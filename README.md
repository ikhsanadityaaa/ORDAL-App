# ORDAL-App v3.2.3

Aplikasi desktop **ORDAL** — AI Job Search Agent yang auto-apply lowongan dari **JobStreet**, **LinkedIn Jobs (Easy Apply)**, dan **LinkedIn Posts** (email ke recruiter).

> Design, logo, dan sistem akun **satu kesatuan dengan [ORDAL-Web](https://github.com/ikhsanadityaaa/ORDAL-Web)**. Desktop mengakses akun lewat API HTTPS; kredensial PostgreSQL tetap hanya di server.

## Apa yang baru di v3

| Aspek | v2 (lama) | v3 (sekarang) |
|---|---|---|
| **Auth** | Login biasa, ada mode single-user (APP_MODE) | **Wajib login** — Google OAuth 2.0 atau email+password |
| **Verifikasi email** | Tidak ada | **Kode 6 digit** (berlaku 15 menit) via SMTP Gmail |
| **Onboarding** | Tidak ada | **Wizard interaktif**: upload CV → preferensi kerja → cover letter (dengan contoh `{company}`/`{position}`) → pilih job platform → login job platform |
| **Database** | SQLite lokal | **SQLite lokal untuk data operasional + ORDAL-Web API untuk akun/lisensi** |
| **Device** | — | **Maksimal 2 device per akun** (konsep WhatsApp) + dashboard kelola device |
| **Data user** | Hilang saat reinstall / pindah device | CV, cookies, riwayat lamaran, dan preferensi tersimpan lokal per device |
| **Design** | Tema lama | **Sticker style ORDAL-Web**: cream `#F4F2EC`, charcoal `#33363F`, oranye `#F2661A`, border 2px + hard shadow, tombol rounded |
| **Logo** | Petir oranye | **Logo web**: kotak oranye + ring "O" putih |

## Apa yang baru di v3.2 — Build & Ikon & Google

| Versi | Perbaikan |
|---|---|
| **v3.2.2** | **FIX app ter-build tapi tidak bisa dibuka** — zip source yang diunduh membawa atribut quarantine `com.apple.quarantine` yang menular ke app bundle hasil build → Gatekeeper memblokir. `build.sh` kini membersihkan **semua xattr** (`xattr -cr`) **sebelum** codesign. |
| **v3.2.3** | **FIX ikon pecah / resolusi rendah** — `ordal.icns` dirakit ulang dengan mapping slot berdasar **ukuran piksel PNG** (sebelumnya slot `ic13` yang mengharapkan 256px terisi PNG 32px — itulah kenapa ikon tampak pecah). Semua 8 slot (ic07–ic14) kini terverifikasi cocok 100%. |
| **v3.2.3** | **FIX logo Google** — tombol "Lanjut dengan Google" kini memakai **logo "G" resmi 4 warna Google** (sebelumnya salah memakai ikon Chrome lucide). |
| **v3.2.3** | **Login Google terpusat** — konfigurasi OAuth berada di ORDAL-Web/Vercel, bukan di desktop. |

## Apa yang baru di v3.1 — Lisensi & Pembayaran

| Aspek | Detail |
|---|---|
| **Free trial** | **3 hari**, terhitung saat user pertama kali klik **"Cari Kerja"** (bukan saat register) — countdown live di badge |
| **Anti-restart trial** | Trial tercatat di **DB pusat per akun** → install ulang app / ganti komputer **tidak me-reset trial** |
| **Setelah trial habis** | Pop-up pembayaran **forced** muncul: pilih **QRIS (Bank BCA)** atau **PayPal** |
| **Verifikasi instan** | Midtrans QRIS dinamis (webhook/polling) · PayPal Orders API (auto-capture) · transfer manual BCA (verifikasi 1-klik admin) — app polling tiap 3 detik, begitu valid langsung VERIFIED |
| **Activation code** | Format `ORD-XXXX-XXXX-XXXX` — **tersimpan di server sesuai email user** (kolom `"User"."activationCode"`, kompatibel dengan ORDAL-Web) — 1 kode per user selamanya (idempotent) |
| **Lupa kode** | Tombol **"Kirim ulang kode ke email"** di jendela aktivasi (cooldown 60 detik) |
| **Kode admin** | Dikelola server ORDAL-Web; tidak disertakan dalam desktop. |
| **Lisensi** | Tercatat di server ORDAL-Web → aktif di device terdaftar dan tidak hilang saat reinstall. |

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
│    ├── Proxy akun/lisensi → HTTPS ORDAL-Web API                           │
│    ├── SQLite lokal: onboarding, CV, target, sesi, log, cookies           │
│    ├── Bot: JobStreet / LinkedIn Jobs / LinkedIn Posts (Playwright)       │
│    └── Files: CV PDF + cookies → disk lokal per device                    │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │ HTTPS
                    ┌────────────▼─────────────┐
                    │ ORDAL-Web API (Next.js)  │
                    │ auth/device/trial/bayar  │
                    └────────────┬─────────────┘
                                 │ Prisma
                         Supabase PostgreSQL
```

- Desktop tidak menerima DSN PostgreSQL, password Supabase, service-role key, OAuth secret, atau payment secret.
- ORDAL-Web menjadi otoritas akun, device, trial, pembayaran, dan lisensi.
- Data bot tetap lokal agar Playwright dan file user tidak perlu dikirim ke server.

## Setup Development

### 1. API ORDAL-Web

Desktop memakai endpoint public berikut secara default:

```env
ORDAL_API_URL=https://ordal-web.vercel.app/api/app
```

Tidak perlu memasukkan URL atau password database. Semua secret Supabase, OAuth, email, dan pembayaran disimpan di Vercel milik ORDAL-Web.

Build ulang setelah perubahan launcher:

```bash
./build_clean_mac.sh
open ./dist/ORDAL.app
```

Tanda startup berhasil di log:

```text
Database lokal siap
Backend ready
Opening window
```

### 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run.py               # uvicorn di :8000
```

### 3. Frontend (dev hot-reload)

```bash
cd frontend
npm install
npm run dev                 # vite di :5173, proxy /api → :8000
```

### 4. Konfigurasi desktop

| Variabel | Wajib? | Keterangan |
|---|---|---|
| `ORDAL_API_URL` | — | Default `https://ordal-web.vercel.app/api/app`; ubah hanya untuk preview/dev server. |
| `ORDAL_APP_VERSION` | — | Versi desktop yang dikirim ke API. |
| `APP_TIMEZONE` | — | Default `Asia/Jakarta`. |

Trial sekarang diikat ke canonical email dan fingerprint hardware. Alias Gmail dengan titik atau `+tag` dianggap satu identitas. Satu perangkat tidak dapat mengambil trial baru dengan akun lain.

> Jangan menaruh `DATABASE_URL`, service-role key, OAuth secret, atau payment secret di repo/app desktop.

## Setup Google OAuth (Login dengan Gmail)

1. Buka https://console.cloud.google.com → buat project baru.
2. **APIs & Services → OAuth consent screen**: External → nama app "ORDAL" → scope `openid`, `email`, `profile` → tambahkan test user (atau Publish).
3. **Credentials → Create Credentials → OAuth Client ID → tipe "Desktop app"** (bukan Web application).
   > Tipe Desktop app otomatis mengizinkan **loopback redirect** `http://localhost:PORT` dengan port acak (RFC 8252) — tidak perlu mendaftar redirect URI manual. Flow PKCE + loopback di app ini sudah benar; yang dibutuhkan hanya Client ID & Secret.
4. Simpan **Client ID** dan **Client Secret** di environment Vercel milik ORDAL-Web.

Flow yang diimplementasikan: **PKCE + loopback redirect** — app membuka browser sistem, setelah login Google, tab browser menutup otomatis dan app melanjutkan login (polling `state`).

## Setup Lisensi & Pembayaran (v3.1)

### Konfigurasi wajib

Konfigurasi trial, harga, admin, Midtrans, PayPal, SMTP, dan OAuth berada di ORDAL-Web/Vercel. Desktop hanya memanggil API.

### Metode 1 — QRIS BCA otomatis (production, verifikasi INSTAN tanpa cek manual)

1. Daftar [Midtrans](https://midtrans.com) → dashboard → aktifkan izin **QRIS**.
2. Simpan **Server Key** sebagai environment variable ORDAL-Web di Vercel.
3. (Opsional, lebih instan lagi) Dashboard Midtrans → Settings → Configuration → **Payment Notification URL**: `https://domain-kamu/api/payments/webhook/midtrans`.

Hasil: setiap invoice jadi **QRIS dinamis** (QR ditampilkan di app, nominal exact). Begitu user bayar → Midtrans kirim webhook DAN app polling tiap 3 detik → status VERIFIED + kode aktivasi keluar otomatis.

### Metode 2 — Transfer BCA manual (tanpa gateway)

Konfigurasi rekening, notifikasi, dan verifikasi admin dilakukan di ORDAL-Web. Endpoint admin tidak tersedia di backend desktop.

### Metode 3 — PayPal otomatis (verifikasi INSTAN)

1. Buat app di [PayPal Developer](https://developer.paypal.com/dashboard/applications).
2. Simpan **Client ID** dan **Secret** sebagai environment variable ORDAL-Web di Vercel.

Hasil: user klik **"Bayar dengan PayPal"** → approve di browser → app polling → auto-capture → VERIFIED + kode otomatis.

### Mode simulasi (DEVELOPMENT ONLY)

Simulasi pembayaran dinonaktifkan di desktop. Uji payment hanya lewat environment preview ORDAL-Web.

### Endpoint lisensi (ringkas)

| Endpoint | Fungsi |
|---|---|
| `GET  /api/trial/status` | Status trial + lisensi + harga + opsi pembayaran |
| `POST /api/trial/start` | Mulai trial 3 hari (idempotent, server-side) |
| `POST /api/payments/create` | Buat invoice (`{"method":"qris_bca\|"paypal"}`) |
| `POST /api/payments/{id}/check` | Polling gateway (Midtrans/PayPal) → instan verified |
| `POST /api/payments/{id}/confirm` | "Saya sudah bayar" (manual → verifying + email admin) |
| `POST /api/activation/activate` | Masukkan kode aktivasi → ORDAL PRO |
| `POST /api/activation/resend` | Kirim ulang kode ke email user (cooldown 60 dtk) |
| `GET  /api/activation/info` | Info kode milik akun (masked) |

## Build Aplikasi Desktop

- **Windows**: `windows-app/build_windows.bat` (PyInstaller + pywebview, install otomatis saat first-run)
- **macOS**: `./build.sh` (bundle `.app` ad-hoc codesign)

> v3: `VITE_APP_MODE`/`ORDAL_APP_MODE` sudah dihapus — build selalu mode login penuh.

## Perilaku Device (maks 2)

- Setiap instalasi app punya `device_id` stabil (disimpan di data dir lokal).
- Login di device ke-3 **ditolak** dengan modal daftar device — user harus mengeluarkan salah satu (atau logout dari device lain).
- **Logout** = melepas slot device ini (seperti "Log out" WhatsApp Web).
- Token sesi opaque terikat ke device: device yang dikeluarkan otomatis 401 → popup login muncul.

## Struktur penting

```
backend/
  database.py          # SQLite lokal untuk data operasional per device
  ordal_api.py         # client HTTPS ke ORDAL-Web API
  auth_utils.py        # validasi token sesi + device binding
  routers/auth.py      # proxy register/login/verify/me/logout/devices/google
  routers/onboarding.py# wizard state + complete (buat job targets awal)
  routers/license.py   # proxy trial, pembayaran, dan activation ke ORDAL-Web
frontend/src/
  components/auth/     # AuthModal, VerifyEmailModal, DeviceLimitModal
  components/onboarding/ # OnboardingWizard (6 langkah), ChipsInput, contoh cover letter
  components/license/  # v3.1: PaymentModal, TrialBadge, TrialToast
  components/          # Layout (sidebar baru), WelcomeScreen, DeviceManagerModal, brand
  stores/licenseStore.js  # v3.1: state trial/lisensi/pop-up pembayaran
  index.css            # Design system sticker (match web) + komponen pembayaran
```

## Catatan penting

- **Prisma migration** hanya dijalankan dari repo ORDAL-Web; desktop tidak mengakses PostgreSQL langsung.
- **Password** hanya dikirim melalui HTTPS ke ORDAL-Web saat login/register dan tidak diverifikasi oleh desktop.
- **File berat** seperti PDF CV dan cookies platform tetap di disk lokal per device.
