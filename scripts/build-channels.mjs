// proTV: ambil playlist iptv-org (MY, ID, US), uji setiap stream, tulis data/channels.json
// Dijalankan oleh GitHub Actions setiap beberapa jam. Setiap larian uji SEMUA channel dari sumber,
// jadi channel yang hidup semula akan masuk balik secara automatik.

import { writeFile, mkdir } from 'node:fs/promises';

const SOURCE_BASE = process.env.SOURCE_BASE || 'https://iptv-org.github.io/iptv/countries';
const ALLOW_HTTP = process.env.ALLOW_HTTP === '1'; // untuk ujian setempat sahaja
const OUT = process.env.OUT || 'data/channels.json';
const ORIGIN = process.env.CHECK_ORIGIN
  || (process.env.GITHUB_REPOSITORY_OWNER ? `https://${process.env.GITHUB_REPOSITORY_OWNER}.github.io` : 'https://example.github.io');
const TIMEOUT_MS = 8000;
const CONCURRENCY = 24;

const COUNTRIES = [
  { code: 'MY', name: 'Malaysia' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'US', name: 'Amerika Syarikat' },
];

export function parseM3U(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const attrs = {};
      for (const m of line.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[m[1]] = m[2];
      const name = line.slice(line.lastIndexOf(',') + 1).trim();
      cur = { attrs, rawName: name, headers: false };
    } else if (line.startsWith('#EXTVLCOPT')) {
      if (cur && /http-(referrer|referer|user-agent)/i.test(line)) cur.headers = true;
    } else if (line.startsWith('#')) {
      continue;
    } else if (cur) {
      out.push({ ...cur, url: line });
      cur = null;
    }
  }
  return out;
}

export function cleanName(raw) {
  let q = '';
  let geo = false;
  let name = raw.replace(/\((\d{3,4}[pi])\)/gi, (_, v) => { q = v.toLowerCase(); return ''; });
  name = name.replace(/\[([^\]]*)\]/g, (_, v) => { if (/geo/i.test(v)) geo = true; return ''; });
  name = name.replace(/\s{2,}/g, ' ').trim();
  return { name: name || raw, quality: q, geo };
}

async function fetchText(url, ms = TIMEOUT_MS) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { Origin: ORIGIN, Referer: ORIGIN + '/', 'User-Agent': 'Mozilla/5.0 (proTV-checker)' },
    });
    const body = res.ok ? await res.text() : '';
    return { ok: res.ok, status: res.status, headers: res.headers, body, url: res.url };
  } finally {
    clearTimeout(t);
  }
}

function corsOk(headers) {
  const v = headers.get('access-control-allow-origin');
  if (!v) return false;
  return v === '*' || v.split(',').map(s => s.trim()).includes(ORIGIN);
}

// Stream dianggap hidup jika manifest HLS sah, CORS dibenarkan (supaya boleh main dalam browser),
// dan (jika master playlist) varian pertama pun boleh dibuka.
export async function checkStream(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetchText(url);
      if (!r.ok || !r.body.trimStart().startsWith('#EXTM3U')) continue;
      if (!corsOk(r.headers)) return false; // tak akan main dalam browser, tak perlu cuba lagi
      if (r.body.includes('#EXT-X-STREAM-INF')) {
        const lines = r.body.split(/\r?\n/);
        const i = lines.findIndex(l => l.startsWith('#EXT-X-STREAM-INF'));
        const variant = lines.slice(i + 1).find(l => l.trim() && !l.startsWith('#'));
        if (variant) {
          const vurl = new URL(variant.trim(), r.url || url).toString();
          const v = await fetchText(vurl);
          if (!v.ok || !v.body.trimStart().startsWith('#EXTM3U')) continue;
        }
      }
      return true;
    } catch {
      // cuba sekali lagi
    }
  }
  return false;
}

async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

async function buildCountry({ code, name }) {
  const url = `${SOURCE_BASE}/${code.toLowerCase()}.m3u`;
  const res = await fetchText(url, 30000);
  if (!res.ok) throw new Error(`Gagal ambil ${url} (${res.status})`);
  let entries = parseM3U(res.body)
    .filter(e => (ALLOW_HTTP ? /^https?:\/\//i : /^https:\/\//i).test(e.url))
    .filter(e => !e.headers)
    .filter(e => /\.m3u8?(\?|$)/i.test(e.url) || e.url.includes('m3u8'));

  const checked = [];
  await pool(entries, CONCURRENCY, async (e) => {
    const { name: nm, quality, geo } = cleanName(e.rawName);
    const ok = await checkStream(e.url);
    checked.push({ e, nm, quality, geo, ok });
  });

  // Susun semula ikut urutan asal supaya output stabil
  checked.sort((a, b) => entries.indexOf(a.e) - entries.indexOf(b.e));

  const byKey = new Map();
  let dropped = 0;
  for (const c of checked) {
    // Gagal + bukan geo-block => buang. Gagal + geo-block => simpan (client akan cuba dari lokasi pengguna).
    if (!c.ok && !c.geo) { dropped++; continue; }
    const key = (c.e.attrs['tvg-id'] || c.nm).toLowerCase();
    let ch = byKey.get(key);
    if (!ch) {
      ch = {
        id: `${code.toLowerCase()}-${byKey.size}`,
        name: c.nm,
        logo: c.e.attrs['tvg-logo'] || '',
        group: (c.e.attrs['group-title'] || 'Lain-lain').split(';')[0] || 'Lain-lain',
        country: code,
        urls: [],
        verified: false,
      };
      byKey.set(key, ch);
    }
    ch.urls.push({ u: c.e.url, q: c.quality, v: c.ok ? 1 : 0 });
    if (c.ok) ch.verified = true;
  }
  for (const ch of byKey.values()) ch.urls.sort((a, b) => b.v - a.v); // yang disahkan hidup dulu, susunan asal dikekalkan
  const channels = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  channels.forEach((c, i) => { c.id = `${code.toLowerCase()}-${i}`; });
  console.log(`${code}: sumber ${entries.length}, hidup/geo ${channels.length} channel, dibuang ${dropped}`);
  return { code, name, channels };
}

async function main() {
  const countries = [];
  for (const c of COUNTRIES) {
    try { countries.push(await buildCountry(c)); }
    catch (err) { console.error(String(err)); }
  }
  const total = countries.reduce((s, c) => s + c.channels.length, 0);
  if (!countries.length || total === 0) {
    console.error('Tiada channel langsung — batal supaya data lama tidak ditimpa.');
    process.exit(1);
  }
  await mkdir('data', { recursive: true });
  await writeFile(OUT, JSON.stringify({
    updated: new Date().toISOString(),
    countries: countries.map(c => ({ code: c.code, name: c.name, count: c.channels.length })),
    channels: countries.flatMap(c => c.channels),
  }));
  console.log(`Siap: ${total} channel -> ${OUT}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
