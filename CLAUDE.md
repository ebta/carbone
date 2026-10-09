# CLAUDE.md

## Workflow Git (fork `ebta/carbone`)

Upstream Carbone (v3) masih dikembangkan (v3.8.2 saat ini) dan sesekali di-merge ke `dev-itg`, tetapi fork ini dikelola sendiri dengan fitur tambahan (lihat `doc/ROADMAP.md`), jadi:

- **Branch kerja utama: `dev-itg`.** Semua perubahan dikembangkan, di-commit, dan di-push langsung ke `dev-itg`.
- **Tidak perlu membuat Pull Request.** Jangan membuat PR (ke `master` fork ini maupun ke repo upstream) kecuali diminta secara eksplisit.
- Jangan membuat branch fitur baru per tugas; lanjutkan di `dev-itg`.
- Push: `git push -u origin dev-itg`.

## Test

- Jalankan `npm test`. Script test sudah men-set `TZ=Europe/Paris` karena test tanggal bergantung pada zona waktu tersebut.
- Test konversi membutuhkan LibreOffice lengkap (Writer, Calc, Impress), bukan hanya `libreoffice-core`.
