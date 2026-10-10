# proTV

TV percuma Malaysia, Indonesia dan Amerika Syarikat. Design ikut ProKuiZ School.
Sumber siaran: https://github.com/iptv-org/iptv (senarai awam).

## Pasang di GitHub
1. Buat repo baru (contoh `protv`), upload semua fail dalam folder ini ke branch `main`.
2. Settings > Pages > Source: pilih **GitHub Actions**.
3. Tab Actions > "Semak channel dan deploy proTV" > Run workflow (kali pertama). Lepas tu ia jalan sendiri setiap 3 jam.
4. Buka `https://<username>.github.io/<nama-repo>/`.

## Cara tapis link mati
- Workflow uji SEMUA link dari sumber setiap 3 jam (manifest HLS sah, boleh main dalam browser, hanya https).
  Link yang gagal dibuang. Link yang hidup semula akan masuk balik pada larian seterusnya.
- Dalam app: siaran yang gagal dibuka disembunyikan 2 jam, app lompat ke siaran seterusnya, dan setiap 5 minit
  app semak semula link tersembunyi. Kalau dah hidup, siaran itu muncul balik sendiri.
- Siaran bertanda "mungkin terhad lokasi" gagal diuji dari server Actions (US) tapi mungkin boleh dibuka dari Malaysia,
  jadi dikekalkan dan dicuba terus dari peranti awak.

## Ujian setempat skrip semak
SOURCE_BASE=<url playlist> ALLOW_HTTP=1 node scripts/build-channels.mjs

## Bina APK (Android)
1. Pastikan langkah web di atas dah siap sekali (Pages aktif).
2. Tab Actions > "Bina APK proTV" > Run workflow. Ambil masa lebih kurang 5 hingga 10 minit.
3. Muat turun `protv.apk` dari **Releases** (tag `apk-latest`) terus dari telefon, atau dari Artifacts dalam larian itu.
4. Pasang dengan benarkan "install dari sumber tidak dikenali". APK ini ditandatangan debug, sesuai untuk guna sendiri.

APK ambil senarai siaran terkini dari laman GitHub Pages awak setiap kali dibuka, jadi tak perlu bina APK semula bila senarai berubah.
Salinan senarai dalam APK hanya sandaran bila tiada internet ke Pages.

## Sumber siaran dan tukar ganti automatik
- Sumber 1: iptv-org. Sumber 2: Free-TV/IPTV (padanan negara ikut group-title: Malaysia, Indonesia, USA).
  Channel yang sama dari dua sumber digabung, jadi satu channel boleh ada beberapa link.
  Kalau satu link gagal, app terus cuba link seterusnya sebelum channel itu disembunyikan.
- Link sendiri (kekal, dikongsi semua pengguna): letak fail `extra/my.m3u`, `extra/id.m3u` atau `extra/us.m3u` dalam repo
  (format M3U biasa), kemudian Run workflow. Link itu turut diuji dan ditapis automatik.
- Link sendiri (cepat, peranti ini sahaja): dalam app, buka "+ Tambah link sendiri". Disimpan dalam peranti.
  Versi web hanya terima https; APK terima http juga.
