# ORDAL-App v3.2.3

Aplikasi desktop **ORDAL** — AI Job Search Agent yang auto-apply lowongan dari **JobStreet**, **LinkedIn Jobs (Easy Apply)**, dan **LinkedIn Posts** (email ke recruiter).

> Design, logo, dan sistem akun **satu kesatuan dengan [ORDAL-Web](https://github.com/ikhsanadityaaa/ORDAL-Web)** — database pusat yang sama (PostgreSQL/Prisma milik web).

## Apa yang baru di v3

| Aspek | v2 (lama) | v3 (sekarang) |
|---|---|---|
| **Auth** | Login biasa, ada mode single-user (APP_MODE) | **Wajib login** — Google OAuth 2.0 atau email+password |
| **Verifikasi email** | Tidak ada | **Kode 6 digit** (berlaku 15 menit) via SMTP Gmail |
| **Onboarding** | Tidak ada | **Wizard interaktif**: upload CV → preferensi kerja → cover letter (dengan contoh `{company}`/`{position}`) → pilih job platform → login job platform |
| **Database** | SQLite lokal | **PostgreSQL pusat** — sama dengan DB web (Supabase di production) |
| **Device** | — | **Maksimal 2 device per akun** (konsep WhatsApp) + dashboard kelola device |
| **Data user** | Hilang saat reinstall / pindah device | Tersimpan di DB pusat — CV, cookies platform, riwayat lamaran, bank pertanyaan ikut pindah device |
| **Design** | Tema lama | **Sticker style ORDAL-Web**: cream `#F4F2EC`, charcoal `#33363F`, oranye `#F2661A`, border 2px + hard shadow, tombol rounded |
| **Logo** | Petir oranye | **Logo web**: kotak oranye + ring "O" putih |

## Apa yang baru di v3.2 — Build & Ikon & Google

| Versi | Perbaikan |
|---|---|
| **v3.2.2** | **FIX app ter-build tapi tidak bisa dibuka** — zip source yang diunduh membawa atribut quarantine `com.apple.quarantine` yang menular ke app bundle hasil build → Gatekeeper memblokir. `build.sh` kini membersihkan **semua xattr** (`xattr -cr`) **sebelum** codesign. |
| **v3.2.3** | **FIX ikon pecah / resolusi rendah** — `ordal.icns` dirakit ulang dengan mapping slot berdasar **ukuran piksel PNG** (sebelumnya slot `ic13` yang mengharapkan 256px terisi PNG 32px — itulah kenapa ikon tampak pecah). Semua 8 slot (ic07–ic14) kini terverifikasi cocok 100%. |
| **v3.2.3** | **FIX logo Google** — tombol "Lanjut dengan Google" kini memakai **logo "G" resmi 4 warna Google** (sebelumnya salah memakai ikon Chrome lucide). |
| **v3.2.3** | **Panduan login Google** — jika `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` belum diisi, app menampilkan panduan langkah isi `.env` (bukan lagi "segera hadir"). Panduan kini menyarankan OAuth Client tipe **Desktop app**. |

## Apa yang baru di v3.1 — Lisensi & Pembayaran

| Aspek | Detail |
|---|---|
| **Free trial** | **3 hari**, terhitung saat user pertama kali klik **"Cari Kerja"** (bukan saat register) — countdown live di badge |
| **Anti-restart trial** | Trial tercatat di **DB pusat per akun** → install ulang app / ganti komputer **tidak me-reset trial** |
| **Setelah trial habis** | Pop-up pembayaran **forced** muncul: pilih **QRIS (Bank BCA)** atau **PayPal** |
| **Verifikasi instan** | Midtrans QRIS dinamis (webhook/polling) · PayPal Orders API (auto-capture) · transfer manual BCA (verifikasi 1-klik admin) — app polling tiap 3 detik, begitu valid langsung VERIFIED |
| **Activation code** | Format `ORD-XXXX-XXXX-XXXX` — **tersimpan di server sesuai email user** (kolom `"User"."activationCode"`, kompatibel dengan ORDAL-Web) — 1 kode per user selamanya (idempotent) |
| **Lupa kode** | Tombol **"Kirim ulang kode ke email"** di jendela aktivasi (cooldown 60 detik) |
| **Kode admin** | `ADMIN_ACTIVATION_CODE` di `.env` — bisa membuka akun mana pun (untuk owner/testing) |
| **Lisensi** | Tercatat di `app_licenses` (DB pusat) → aktif di semua device user, tidak hilang saat reinstall. Durasi via `LICENSE_DURATION_DAYS` (0 = selamanya) |

### Alur lisensi

```
register → verifikasi email → onboarding → app utama
     ↓
 klik "Cari Kerja" pertama kali ──▶ TRIAL 3 HARI MULAI (server-side)
     ↓ (3 hari kemudian)
 akses apply diblokir 403 ──▶ POP-UP PEMBAYARAN (QRIS BCA / PayPal)
     ↓ bayar (valid & instan terverifikasi)
 kode aktivasi diterbitkan + dikirim ke email ──▶ user masukkan kode
     ↓
 ORDAL PRO AKTIF (badge PRO, lisensi lintas device, anti-reinstall)
```

## Arsitektur

```
┌─────────────────────────── ORDAL-App (desktop) ───────────────────────────┐
│  pywebview window → frontend React/Vite (dist) di-serve oleh backend     │
│                                                                           │
│  Backend FastAPI (localhost, port acak)                                   │
│    ├── Auth: register/login/verify/resend · Google OAuth (PKCE loopback)  │
│    ├── Device: app_devices (max 2) + app_login_events                     │
│    ├── Onboarding: app_onboarding (wizard state, resumable)               │
│    ├── Bot: JobStreet / LinkedIn Jobs / LinkedIn Posts (Playwright)       │
│    └── Files: CV PDF + cookies → disk lokal + backup base64 di DB         │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │ psycopg2 (pool)
                    ┌────────────▼─────────────┐
                    │  PostgreSQL (DB PUSAT)   │
                    │  "User","Trial","Session"│ ← dimiliki Prisma (web)
                    │  + tabel app_*           │ ← milik app ini
                    └────────────▲─────────────┘
                                 │ Prisma
                        ORDAL-Web (Next.js)
```

- Tabel **web tidak diubah sama sekali** (`"User"`, `"Trial"`, `"Download"`, `"Session"` — PascalCase, milik Prisma).
- App menambah tabel sendiri: `app_user_profile`, `app_devices`, `app_login_events`, `app_verification_codes`, `app_oauth_pending`, `app_onboarding`, plus tabel data lama (`cvs`, `job_targets`, `apply_sessions`, `apply_logs`, `user_preferences`, `question_bank`, `telegram_users`, `app_secrets`, `email_configs`, `user_credentials`) yang kini `user_id`-nya TEXT (cuid web).
- Password: **bcrypt** (baru). User lama buatan web (SHA-256) tetap bisa login — hash di-upgrade otomatis ke bcrypt.

## Setup Development

### 1. Database PostgreSQL

Pakai PostgreSQL lokal atau URL Supabase yang sama dengan web:

```bash
# backend/.env
ORDAL_DATABASE_URL=postgresql://user:password@host:5432/dbname
```

> Catatan: app pakai `ORDAL_DATABASE_URL` (prioritas) dengan fallback `DATABASE_URL`, supaya tidak bentrok dengan env lain di sistem.

Tabel web dibuat oleh Prisma (jalankan `prisma migrate deploy` dari repo web, atau import SQL migration-nya). Tabel app dibuat **otomatis** saat backend start.

### 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # lalu isi (lihat bawah)
python run.py               # uvicorn di :8000
```

### 3. Frontend (dev hot-reload)

```bash
cd frontend
npm install
npm run dev                 # vite di :5173, proxy /api → :8000
```

### 4. Konfigurasi `.env`

| Variabel | Wajib? | Keterangan |
|---|---|---|
| `ORDAL_DATABASE_URL` | ✅ | DSN PostgreSQL pusat (production: Supabase, sama dengan web) |
| `SMTP_HOST` / `SMTP_PORT` | — | Default `smtp.gmail.com` / `587` |
| `SMTP_USER` / `SMTP_APP_PASSWORD` | ✅ untuk verifikasi email | Gmail App Password → https://myaccount.google.com/apppasswords (aktifkan 2FA dulu). Production tidak menampilkan kode verifikasi di layar. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — untuk login Google | Lihat panduan di bawah. Kalau kosong, UI menampilkan petunjuk konfigurasi. |
| `CORS_ORIGINS` | — | Default sudah mencakup localhost dev |
| `ABUSE_HASH_SECRET` | ✅ production | Kunci acak 32+ byte untuk hash identitas trial dan sinyal perangkat. |
| `BLOCKED_EMAIL_DOMAINS` | — | Tambahan domain email sementara, dipisahkan koma. |
| `ALLOW_DEV_VERIFICATION_CODE` | — | Gunakan `true` hanya di development lokal. Wajib `false` di production. |

Trial sekarang diikat ke canonical email dan fingerprint hardware. Alias Gmail dengan titik atau `+tag` dianggap satu identitas. Satu perangkat tidak dapat mengambil trial baru dengan akun lain.

> Batas arsitektur saat ini: desktop masih terhubung langsung ke PostgreSQL pusat. Gunakan role database khusus dengan hak minimum. Untuk distribusi publik skala besar, pindahkan auth, trial, pembayaran, lisensi, dan penyimpanan data ke control-plane HTTPS; jangan membagikan DSN database kepada installer.

## Setup Google OAuth (Login dengan Gmail)

1. Buka https://console.cloud.google.com → buat project baru.
2. **APIs & Services → OAuth consent screen**: External → nama app "ORDAL" → scope `openid`, `email`, `profile` → tambahkan test user (atau Publish).
3. **Credentials → Create Credentials → OAuth Client ID → tipe "Desktop app"** (bukan Web application).
   > Tipe Desktop app otomatis mengizinkan **loopback redirect** `http://localhost:PORT` dengan port acak (RFC 8252) — tidak perlu mendaftar redirect URI manual. Flow PKCE + loopback di app ini sudah benar; yang dibutuhkan hanya Client ID & Secret.
4. Copy **Client ID** & **Client Secret** ke `backend/.env` (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`), lalu jalankan ulang app.

Flow yang diimplementasikan: **PKCE + loopback redirect** — app membuka browser sistem, setelah login Google, tab browser menutup otomatis dan app melanjutkan login (polling `state`).

## Setup Lisensi & Pembayaran (v3.1)

### Konfigurasi wajib (backend/.env)

```env
TRIAL_HOURS=72                  # durasi trial (default 3 hari)
LICENSE_PRICE_IDR=159000        # harga QRIS (Rp)
LICENSE_PRICE_USD=10.00         # harga PayPal (US$)
LICENSE_DURATION_DAYS=0         # 0 = lisensi selamanya; mis. 30 = 30 hari
ADMIN_ACTIVATION_CODE=            # opsional; isi kode acak khusus owner/testing
ADMIN_TOKEN=...                 # token utk endpoint /api/admin/*
PAYMENTS_SIMULATION=false       # WAJIB false di production!
```

### Metode 1 — QRIS BCA otomatis (production, verifikasi INSTAN tanpa cek manual)

1. Daftar [Midtrans](https://midtrans.com) → dashboard → aktifkan izin **QRIS**.
2. Copy **Server Key** → `MIDTRANS_SERVER_KEY=` di `.env`.
3. (Opsional, lebih instan lagi) Dashboard Midtrans → Settings → Configuration → **Payment Notification URL**: `https://domain-kamu/api/payments/webhook/midtrans`.

Hasil: setiap invoice jadi **QRIS dinamis** (QR ditampilkan di app, nominal exact). Begitu user bayar → Midtrans kirim webhook DAN app polling tiap 3 detik → status VERIFIED + kode aktivasi keluar otomatis.

### Metode 2 — Transfer BCA manual (tanpa gateway)

1. Isi `BCA_ACCOUNT_NAME`, `BCA_ACCOUNT_NUMBER` (rekening pribadi), opsional `BCA_QRIS_IMAGE` (path gambar QRIS statis milikmu → ditampilkan di jendela pembayaran).
2. Isi `ADMIN_EMAIL` → setiap user yang klik **"Saya Sudah Bayar"** mengirim email notifikasi ke kamu.
3. Cek m-banking → cocokkan nominal unik (`harga + 3 angka acak`) + reference → verifikasi sekali klik:

```bash
curl -X POST http://127.0.0.1:8000/api/admin/payments/PAY-XXXXXXXX/verify \
  -H "X-Admin-Token: ADMIN_TOKEN_KAMU"
# → user langsung lihat status VERIFIED di app (instan) + kode dikirim ke emailnya

curl "http://127.0.0.1:8000/api/admin/payments?status=verifying" \
  -H "X-Admin-Token: ADMIN_TOKEN_KAMU"   # daftar pembayaran menunggu verifikasi
```

### Metode 3 — PayPal otomatis (verifikasi INSTAN)

1. Buat app di [PayPal Developer](https://developer.paypal.com/dashboard/applications).
2. Copy **Client ID** & **Secret** → `PAYPAL_CLIENT_ID=`, `PAYPAL_CLIENT_SECRET=`, `PAYPAL_MODE=live` (atau `sandbox` untuk test).

Hasil: user klik **"Bayar dengan PayPal"** → approve di browser → app polling → auto-capture → VERIFIED + kode otomatis.

### Mode simulasi (DEVELOPMENT ONLY)

`PAYMENTS_SIMULATION=true` menampilkan tombol **"Simulasikan Pembayaran (Demo)"** di app — pembayaran langsung verified tanpa uang sungguhan (untuk testing flow). **Wajib `false` di production.**

### Endpoint lisensi (ringkas)

| Endpoint | Fungsi |
|---|---|
| `GET  /api/trial/status` | Status trial + lisensi + harga + opsi pembayaran |
| `POST /api/trial/start` | Mulai trial 3 hari (idempotent, server-side) |
| `POST /api/payments/create` | Buat invoice (`{"method":"qris_bca\|"paypal"}`) |
| `POST /api/payments/{id}/check` | Polling gateway (Midtrans/PayPal) → instan verified |
| `POST /api/payments/{id}/confirm` | "Saya sudah bayar" (manual → verifying + email admin) |
| `POST /api/payments/{id}/simulate` | Simulasi (hanya `PAYMENTS_SIMULATION=true`) |
| `POST /api/payments/webhook/midtrans` | Webhook Midtrans (signature SHA512 diverifikasi) |
| `POST /api/activation/activate` | Masukkan kode aktivasi → ORDAL PRO |
| `POST /api/activation/resend` | Kirim ulang kode ke email user (cooldown 60 dtk) |
| `GET  /api/activation/info` | Info kode milik akun (masked) |
| `GET  /api/admin/payments` | (Admin) daftar pembayaran |
| `POST /api/admin/payments/{id}/verify` | (Admin) verifikasi manual 1-klik |
| `POST /api/admin/grant` | (Admin) beri lisensi langsung ke email |

## Build Aplikasi Desktop

- **Windows**: `windows-app/build_windows.bat` (PyInstaller + pywebview, install otomatis saat first-run)
- **macOS**: `./build.sh` (bundle `.app` ad-hoc codesign)

> v3: `VITE_APP_MODE`/`ORDAL_APP_MODE` sudah dihapus — build selalu mode login penuh.

## Perilaku Device (maks 2)

- Setiap instalasi app punya `device_id` stabil (disimpan di data dir lokal).
- Login di device ke-3 **ditolak** dengan modal daftar device — user harus mengeluarkan salah satu (atau logout dari device lain).
- **Logout** = melepas slot device ini (seperti "Log out" WhatsApp Web).
- Token JWT ter-bind ke device: device yang dikeluarkan otomatis 401 → popup login muncul.

## Struktur penting

```
backend/
  database.py          # PostgreSQL pool + konversi otomatis SQL SQLite→PG
  auth_utils.py        # JWT + device binding + bcrypt/sha256
  routers/auth.py      # register/login/verify/resend/me/logout/devices/google
  routers/onboarding.py# wizard state + complete (buat job targets awal)
  routers/license.py   # v3.1: trial 3 hari + pembayaran QRIS/PayPal + activation code + admin
  services/email_sender.py  # SMTP: kode verifikasi + kode aktivasi + notif admin
frontend/src/
  components/auth/     # AuthModal, VerifyEmailModal, DeviceLimitModal
  components/onboarding/ # OnboardingWizard (6 langkah), ChipsInput, contoh cover letter
  components/license/  # v3.1: PaymentModal, TrialBadge, TrialToast
  components/          # Layout (sidebar baru), WelcomeScreen, DeviceManagerModal, brand
  stores/licenseStore.js  # v3.1: state trial/lisensi/pop-up pembayaran
  index.css            # Design system sticker (match web) + komponen pembayaran
```

## Catatan penting

- **Prisma migration**: tabel app tidak dikelola Prisma. Kalau menjalankan `prisma migrate dev` dari repo web, tambahan tabel app diabaikan (tidak konflik).
- **User web lama login ke app**: password SHA-256 web diverifikasi lalu di-upgrade ke bcrypt. (Sebaliknya, user baru daftar dari app butuh patch kecil di web login route agar bcrypt didukung — akan backward compatible.)
- **File berat** (PDF CV, cookies platform) ditulis ke disk lokal DAN disimpan base64 di DB — direstore otomatis saat login di device baru atau app update.
