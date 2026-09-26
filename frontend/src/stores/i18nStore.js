import { create } from 'zustand'

// ─────────────────────────────────────────────────────────────────────────────
// i18n Store — Internationalization (Indonesia / English)
// ─────────────────────────────────────────────────────────────────────────────
// Sederhana: pakai object dictionary, bukan library berat seperti i18next.
// Bahasa default: English. Disimpan di localStorage supaya persist
// antar session.
//
// Cara pakai:
//   import useI18n from '../stores/i18nStore'
//   const { t, lang, setLang } = useI18n()
//   <h1>{t('cari_kerja')}</h1>
//
// Translation keys didefinisikan di TRANSLATIONS di bawah. Kalau key tidak
// ditemukan, fallback ke key itu sendiri (supaya app tidak crash).

const STORAGE_KEY = 'ordal_lang'
const CONFIRMED_KEY = 'ordal_language_confirmed'

function loadStoredLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'id' || stored === 'en') return stored
  } catch (e) {
    // localStorage tidak tersedia (mis. SSR) — abaikan
  }
  return 'en'
}

function hasStoredLang() {
  try {
    return localStorage.getItem(CONFIRMED_KEY) === '1'
  } catch (e) {
    return false
  }
}

// ── Dictionary ─────────────────────────────────────────────────────────────
// Format: { key: { id: 'teks Indonesia', en: 'English text' } }
// Hanya string yang tampil di UI user yang perlu di-translate. String
// internal (log, error backend) tetap bahasa aslinya.
const TRANSLATIONS = {
  // ── Sidebar nav ──────────────────────────────────────────────────────
  'nav.cari_kerja':          { id: 'Cari Kerja',            en: 'Find Jobs' },
  'nav.ai':                  { id: 'AI',                    en: 'AI' },
  'nav.riwayat_lamaran':     { id: 'Riwayat Lamaran',       en: 'Application History' },
  'nav.kumpulan_pertanyaan': { id: 'Kumpulan Pertanyaan',   en: 'Question Bank' },
  'nav.persiapan':           { id: 'Persiapan',             en: 'Preparation' },

  // ── Sidebar footer ───────────────────────────────────────────────────
  'sidebar.cek_log':         { id: 'Cek Log',               en: 'View Log' },
  'sidebar.mode':            { id: 'Mode',                  en: 'Mode' },
  'sidebar.local_app':       { id: 'Local App',             en: 'Local App' },
  'sidebar.single_user':     { id: 'single-user, offline',  en: 'single-user, offline' },

  // ── Language switcher ────────────────────────────────────────────────
  'lang.label':              { id: 'Bahasa',                en: 'Language' },
  'lang.toggle_to_en':       { id: 'Switch to English',     en: 'Ganti ke Indonesia' },
  'lang.choose_title':       { id: 'Pilih bahasa',          en: 'Choose your language' },
  'lang.choose_sub':         { id: 'Mari mulai dengan bahasa yang paling nyaman untukmu. Kamu bisa mengubahnya lagi nanti.', en: 'Let’s begin in the language that feels most comfortable. You can change it later.' },
  'lang.indonesian':         { id: 'Bahasa Indonesia',      en: 'Bahasa Indonesia' },
  'lang.english':            { id: 'English',               en: 'English' },

  // ── Page: Cari Kerja ─────────────────────────────────────────────────
  'page.cari_kerja.title':         { id: 'Cari Kerja',           en: 'Find Jobs' },
  'page.cari_kerja.desc':          { id: 'Bot cari lowongan, filter yang cocok, bantu kirim atau siapkan draft, lalu catat hasilnya.', en: 'Bot finds vacancies, filters matching ones, helps submit or prepare drafts, then records results.' },
  'page.cari_kerja.start':         { id: 'Carikan Kerjaan',      en: 'Find Jobs' },
  'page.cari_kerja.run_again':     { id: 'Jalankan Lagi',        en: 'Run Again' },
  'page.cari_kerja.stop':          { id: 'Stop',                 en: 'Stop' },
  'page.cari_kerja.running':       { id: 'RUNNING',              en: 'RUNNING' },
  'page.cari_kerja.processed':     { id: 'diproses',             en: 'processed' },
  'page.cari_kerja.start_tooltip': { id: 'Mulai cari & apply lowongan', en: 'Start finding & applying to jobs' },
  'page.cari_kerja.stop_tooltip':  { id: 'Hentikan proses sekarang',   en: 'Stop process now' },
  'page.cari_kerja.bot_running':   { id: 'Bot sedang berjalan',  en: 'Bot is running' },
  'page.cari_kerja.no_process':    { id: 'Tidak ada proses yang berjalan', en: 'No process running' },
  'page.cari_kerja.press_start':   { id: 'Tekan CARIKAN KERJAAN untuk mulai.', en: 'Press FIND JOBS to start.' },

  // ── Page: Riwayat Lamaran ────────────────────────────────────────────
  'page.riwayat.title':      { id: 'Riwayat Lamaran',  en: 'Application History' },
  'page.riwayat.desc':       { id: 'Lamaran yang sudah berhasil dikirim dan dikonfirmasi oleh bot.', en: 'Applications successfully submitted and confirmed by the bot.' },
  'page.riwayat.excel':      { id: 'CSV (Excel)',      en: 'CSV (Excel)' },
  'page.riwayat.search':     { id: 'Cari posisi/perusahaan...', en: 'Search position/company...' },
  'page.riwayat.total':      { id: 'Total',            en: 'Total' },
  'page.riwayat.lamaran':    { id: 'lamaran',          en: 'applications' },
  'page.riwayat.belum_ada':  { id: 'Belum ada riwayat', en: 'No history yet' },
  'page.riwayat.empty_desc': { id: 'Lamaran yang berhasil dikirim akan muncul di sini.', en: 'Successfully submitted applications will appear here.' },
  'page.riwayat.buka':       { id: 'Buka',             en: 'Open' },
  'page.riwayat.memuat':     { id: 'Memuat...',        en: 'Loading...' },

  // ── Riwayat table headers ────────────────────────────────────────────
  'riwayat.col.no':         { id: 'No',          en: 'No' },
  'riwayat.col.waktu':      { id: 'Waktu',       en: 'Date' },
  'riwayat.col.posisi':     { id: 'Posisi',      en: 'Position' },
  'riwayat.col.perusahaan': { id: 'Perusahaan',  en: 'Company' },
  'riwayat.col.lokasi':     { id: 'Lokasi',      en: 'Location' },
  'riwayat.col.gaji':       { id: 'Gaji',        en: 'Salary' },
  'riwayat.col.platform':   { id: 'Platform',    en: 'Platform' },
  'riwayat.col.detail':     { id: 'Detail',      en: 'Details' },

  // ── Page: Kumpulan Pertanyaan ────────────────────────────────────────
  'page.pertanyaan.title': { id: 'Kumpulan Pertanyaan', en: 'Question Bank' },
  'page.pertanyaan.desc':  { id: 'Jawaban otomatis dari LinkedIn dan JobStreet. Edit agar pertanyaan mirip dijawab sesuai kamu.', en: 'Auto-answers from LinkedIn and JobStreet. Edit so similar questions are answered your way.' },
  'page.pertanyaan.search': { id: 'Cari pertanyaan/jawaban...', en: 'Search question/answer...' },
  'page.pertanyaan.add_manual': { id: 'Tambah Jawaban Manual', en: 'Add Manual Answer' },

  // ── Page: Persiapan ──────────────────────────────────────────────────
  'page.persiapan.title':   { id: 'Persiapan', en: 'Preparation' },
  'page.persiapan.tab_cv':       { id: 'CV',     en: 'CV' },
  'page.persiapan.tab_apply':    { id: 'Platform',  en: 'Platform' },
  'page.persiapan.tab_telegram': { id: 'Telegram', en: 'Telegram' },
  'page.persiapan.tab_jadwal':   { id: 'Jadwal', en: 'Schedule' },

  // ── Page: AI ─────────────────────────────────────────────────────────
  'page.ai.title': { id: 'AI', en: 'AI' },
  'page.ai.desc': {
    id: 'Pilih provider AI yang dipakai bot untuk menjawab pertanyaan form lamaran & menulis email ke recruiter. Set API key untuk provider yang ingin dipakai, lalu klik "Pakai" untuk mengaktifkan.',
    en: 'Choose the AI provider the bot uses to answer application form questions & write recruiter emails. Set the API key for the provider you want, then click "Use" to activate.',
  },
  'page.ai.no_key_title': { id: 'Belum ada API key yang di-set', en: 'No API key set yet' },
  'page.ai.no_key_desc': {
    id: 'Pilih salah satu provider di bawah, dapatkan API key dari link yang tersedia, lalu simpan. Setelah itu, klik "Pakai" untuk mengaktifkan provider tersebut.',
    en: 'Pick a provider below, get an API key from the link provided, then save. After that, click "Use" to activate that provider.',
  },
  'page.ai.oauth_note': {
    id: 'Koneksi API AI tidak sama dengan login akun biasa. Gemini, OpenAI, Claude, dan Groq memakai API key developer. OpenRouter mendukung OAuth PKCE, tetapi ORDAL tetap memakai key manual agar penyimpanan lokal dan pergantian provider konsisten.',
    en: 'AI API access is separate from normal account sign-in. Gemini, OpenAI, Claude, and Groq use developer API keys. OpenRouter supports OAuth PKCE, but ORDAL keeps manual keys for consistent local storage and provider switching.',
  },
  'page.ai.section_provider': { id: 'Provider AI', en: 'AI Provider' },
  'page.ai.section_provider_desc': {
    id: 'Pilih satu provider yang akan dipakai untuk semua fitur AI di ORDAL: jawab pertanyaan form, generate cover letter, validate email, & analisis lowongan.',
    en: 'Pick one provider to use for all AI features in ORDAL: answer form questions, generate cover letters, validate emails, & analyze jobs.',
  },
  'page.ai.section_test': { id: 'Test AI', en: 'Test AI' },
  'page.ai.section_test_desc': {
    id: 'Coba kirim prompt ke provider yang aktif untuk verifikasi kualitas output.',
    en: 'Try sending a prompt to the active provider to verify output quality.',
  },

  // ── AI: ProviderCard ─────────────────────────────────────────────────
  'ai.badge.active': { id: 'Aktif', en: 'Active' },
  'ai.badge.key_set': { id: 'Key di-set', en: 'Key set' },
  'ai.badge.key_missing': { id: 'Key belum', en: 'No key' },
  'ai.btn.use': { id: 'Pakai', en: 'Use' },
  'ai.btn.save_key': { id: 'Simpan Key', en: 'Save Key' },
  'ai.btn.test': { id: 'Test', en: 'Test' },
  'ai.btn.delete_aria': { id: 'Hapus', en: 'Delete' },
  'ai.label.current': { id: 'Current', en: 'Current' },
  'ai.label.override_key': { id: 'Override API Key (kosongkan jika tidak ingin ubah)', en: 'Override API Key (leave empty to keep current)' },
  'ai.label.enter_key': { id: 'Masukkan', en: 'Enter' },  // dipakai: `Masukkan ${provider.api_key_label}` → `Enter ${provider.api_key_label}`
  'ai.placeholder.enter_key': { id: 'Masukkan', en: 'Enter' },  // `Masukkan ${api_key_label}...`
  'ai.link.get_key': { id: 'Dapatkan', en: 'Get' },  // `Dapatkan ${api_key_label}`
  'ai.toast.key_empty': { id: 'API key tidak boleh kosong.', en: 'API key cannot be empty.' },
  'ai.toast.key_saved': { id: 'API key untuk', en: 'API key for' },  // `API key untuk ${label} disimpan.`
  'ai.toast.saved_suffix': { id: 'disimpan.', en: 'saved.' },
  'ai.toast.key_deleted': { id: 'API key untuk', en: 'API key for' },  // `API key untuk ${label} dihapus.`
  'ai.toast.deleted_suffix': { id: 'dihapus.', en: 'deleted.' },
  'ai.toast.save_failed': { id: 'Gagal simpan:', en: 'Save failed:' },
  'ai.toast.delete_failed': { id: 'Gagal hapus:', en: 'Delete failed:' },
  'ai.toast.test_failed': { id: 'Gagal test:', en: 'Test failed:' },
  'ai.confirm.delete': { id: 'Hapus API key untuk', en: 'Delete API key for' },  // `Hapus API key untuk ${label}?`
  'ai.confirm.question_mark': { id: '?', en: '?' },

  // ── AI: ChatPlayground ───────────────────────────────────────────────
  'ai.playground.title': { id: 'Chat Playground', en: 'Chat Playground' },
  'ai.playground.desc': {
    id: 'Test kualitas AI sebelum dipakai bot untuk jawab pertanyaan form & generate email.',
    en: 'Test AI quality before the bot uses it to answer form questions & generate emails.',
  },
  'ai.playground.no_key': {
    id: 'Provider aktif belum punya API key. Set dulu di salah satu kartu di atas.',
    en: 'Active provider has no API key set. Set one in a card above first.',
  },
  'ai.playground.label_system': { id: 'System Prompt (opsional)', en: 'System Prompt (optional)' },
  'ai.playground.placeholder_system': {
    id: 'contoh: You are a helpful assistant that answers concisely.',
    en: 'example: You are a helpful assistant that answers concisely.',
  },
  'ai.playground.label_prompt': { id: 'Prompt', en: 'Prompt' },
  'ai.playground.placeholder_prompt': {
    id: 'contoh: Write a 2-paragraph cover letter for a Purchasing Specialist role at PT ABC.',
    en: 'example: Write a 2-paragraph cover letter for a Purchasing Specialist role at PT ABC.',
  },
  'ai.playground.btn_send': { id: 'Kirim ke AI', en: 'Send to AI' },
  'ai.playground.response_label': { id: 'Response', en: 'Response' },
  'ai.playground.response_empty': { id: 'Response kosong.', en: 'Empty response.' },

  // ── Settings: Log Backend card ───────────────────────────────────────
  'settings.log.title':     { id: 'Log Backend', en: 'Backend Log' },
  'settings.log.subtitle':  { id: 'Lihat log Telegram polling, JobStreet apply, dan error bot', en: 'View Telegram polling, JobStreet apply, and bot error logs' },
  'settings.log.buka':      { id: 'Buka',        en: 'Open' },
  'settings.log.tutup':     { id: 'Tutup',       en: 'Close' },
  'settings.log.refresh':   { id: 'Refresh',     en: 'Refresh' },
  'settings.log.copy':      { id: 'Copy',        en: 'Copy' },
  'settings.log.folder':    { id: 'Buka Folder', en: 'Open Folder' },
  'settings.log.baris':     { id: 'baris',       en: 'lines' },
  'settings.log.empty':     { id: '(klik Refresh untuk memuat log)', en: '(click Refresh to load log)' },

  // ── CariKerja: Target Panel (v41) ──────────────────────────────────
  'cari_kerja.target_aktif':     { id: 'TARGET AKTIF',     en: 'ACTIVE TARGETS' },
  'cari_kerja.tambah':           { id: 'TAMBAH',           en: 'ADD' },
  'cari_kerja.edit':             { id: 'EDIT',             en: 'EDIT' },
  'cari_kerja.save_close':       { id: 'SAVE AND CLOSE',   en: 'SAVE AND CLOSE' },
  'cari_kerja.menyimpan':        { id: 'MENYIMPAN...',     en: 'SAVING...' },
  'cari_kerja.simpan':           { id: 'SIMPAN',           en: 'SAVE' },
  'cari_kerja.batal':            { id: 'BATAL',            en: 'CANCEL' },
  'cari_kerja.upload_cv_dulu':  { id: 'Upload CV dulu di Persiapan.', en: 'Upload CV first in Preparation.' },
  'cari_kerja.belum_target':    { id: 'Belum ada target.', en: 'No targets yet.' },
  'cari_kerja.pilih_cv':         { id: 'Pilih CV dulu',    en: 'Select a CV first' },
  'cari_kerja.isi_posisi':       { id: 'Isi minimal 1 posisi', en: 'Enter at least 1 position' },
  'cari_kerja.isi_lokasi':       { id: 'Isi minimal 1 lokasi', en: 'Enter at least 1 location' },
  'cari_kerja.max_2_platform':   { id: 'Maksimal 2 platform, atau pilih Semua', en: 'Max 2 platforms, or select All' },
  'cari_kerja.testing_email':     { id: 'TESTING EMAIL',    en: 'TESTING EMAIL' },
  'cari_kerja.testing_on':       { id: 'LinkedIn Posts tetap mencari lowongan match, tapi email lamaran dikirim ke diri sendiri.', en: 'LinkedIn Posts still finds matching jobs, but application emails are sent to yourself.' },
  'cari_kerja.testing_off':      { id: 'Email lamaran LinkedIn Posts dikirim ke kontak recruiter normal.', en: 'LinkedIn Posts application emails are sent to the actual recruiter.' },
  'cari_kerja.log_proses':       { id: 'LOG PROSES',       en: 'PROCESS LOG' },
  'cari_kerja.memuat':           { id: 'Memuat...',        en: 'Loading...' },
  'cari_kerja.gagal_simpan':    { id: 'Gagal menyimpan',  en: 'Failed to save' },
  'cari_kerja.gagal_memulai':   { id: 'Gagal memulai sesi. Pastikan CV, target, dan login platform sudah siap.', en: 'Failed to start session. Make sure CV, targets, and platform login are ready.' },
  'cari_kerja.gagal_kirim':     { id: 'Gagal mengirim jawaban', en: 'Failed to send answer' },
  'cari_kerja.jawaban_tersimpan': { id: 'Jawaban tersimpan dan bot lanjut.', en: 'Answer saved and bot continues.' },
  'cari_kerja.jawaban_harus_angka': { id: 'Jawaban harus angka.', en: 'Answer must be a number.' },
  'cari_kerja.jawaban_harus_ya': { id: 'Jawaban harus Yes atau No.', en: 'Answer must be Yes or No.' },
  'cari_kerka.pilih_opsi':       { id: 'Pilih salah satu opsi yang tersedia di tombol Telegram.', en: 'Select one of the options available on the Telegram buttons.' },
  'cari_kerja.posisi_dikecualikan': { id: 'Posisi dikecualikan', en: 'Position excluded' },
  'cari_kerja.perusahaan_dikecualikan': { id: 'Perusahaan dikecualikan', en: 'Company excluded' },
  'cari_kerja.posisi_tidak_sesuai': { id: 'Posisi tidak sesuai', en: 'Position does not match' },
  'cari_kerja.cv':               { id: 'CV',               en: 'CV' },
  'cari_kerja.cover_letter':     { id: 'COVER LETTER',     en: 'COVER LETTER' },
  'cari_kerja.buat_dari_cv':     { id: 'BUAT DARI CV (AI)', en: 'GENERATE FROM CV (AI)' },
  'cari_kerja.membuat_dari_cv':  { id: 'MEMBUAT DARI CV...', en: 'GENERATING FROM CV...' },
  'cari_kerja.posisi_dihindari': { id: 'POSISI YANG DIHINDARI', en: 'POSITIONS TO AVOID' },
  'cari_kerja.perusahaan_dihindari': { id: 'PERUSAHAAN YANG DIHINDARI', en: 'COMPANIES TO AVOID' },
  'cari_kerja.tambah_posisi_dihindari': { id: 'Tambah posisi dihindari (tekan Enter)', en: 'Add position to avoid (press Enter)' },
  'cari_kerja.tambah_perusahaan_dihindari': { id: 'Tambah perusahaan dihindari (tekan Enter)', en: 'Add company to avoid (press Enter)' },
  'cari_kerja.mode_edit':        { id: 'mode edit',         en: 'edit mode' },
  'cari_kerja.gaji_target':      { id: 'GAJI TARGET',       en: 'TARGET SALARY' },
  'cari_kerja.dapat_bergabung':  { id: 'DAPAT BERGABUNG',   en: 'AVAILABLE TO JOIN' },
  'cari_kerja.lokasi':           { id: 'LOKASI',           en: 'LOCATION' },
  'cari_kerja.platform':         { id: 'PLATFORM',         en: 'PLATFORM' },
  'cari_kerja.semua':            { id: 'Semua',             en: 'All' },
  'cari_kerja.pilih':            { id: '— Pilih —',         en: '— Select —' },
  'cari_kerja.secepatnya':       { id: 'Secepatnya',        en: 'Immediately' },
  'cari_kerja.1_minggu':         { id: '1 minggu',          en: '1 week' },
  'cari_kerja.1_month_notice':   { id: '1 month notice',   en: '1 month notice' },
  'cari_kerja.isi_sendiri':      { id: 'Isi sendiri...',    en: 'Custom...' },
  'cari_kerja.ketik_sendiri':    { id: 'Ketik sendiri...',  en: 'Type your own...' },
  'cari_kerja.sarankan_cv':      { id: 'Sarankan dari CV',  en: 'Suggest from CV' },
  'cari_kerja.placeholder_gaji': { id: 'Contoh: Rp 12.000.000', en: 'Example: Rp 12,000,000' },
  'cari_kerja.info_cover':       { id: 'Gunakan {company} dan {position} sebagai placeholder. Akan diganti otomatis saat melamar.', en: 'Use {company} and {position} as placeholders. Will be auto-replaced when applying.' },
  'cari_kerja.bergabung':        { id: 'Bergabung',         en: 'Join' },
  'cari_kerja.gaji':             { id: 'Gaji',              en: 'Salary' },
  'cari_kerja.target':           { id: 'target',            en: 'target' },

  // ── CVManager ──────────────────────────────────────────────────────
  'cv.title':                    { id: 'CV Manager',        en: 'CV Manager' },
  'cv.upload':                   { id: 'Upload CV',         en: 'Upload CV' },
  'cv.label':                    { id: 'Label CV',          en: 'CV Label' },
  'cv.pilih_file':               { id: 'Pilih file PDF...', en: 'Choose PDF file...' },
  'cv.belum_ada':                { id: 'Belum ada CV. Upload dulu untuk mulai.', en: 'No CVs yet. Upload one to get started.' },
  'cv.gagal_upload':             { id: 'Gagal upload CV',   en: 'Failed to upload CV' },
  'cv.gagal_baca':               { id: 'CV PDF tidak mengandung teks yang bisa dibaca. Kemungkinan PDF hasil scan/gambar tanpa lapisan teks. Silakan gunakan PDF dengan teks asli atau lakukan OCR terlebih dahulu.', en: 'CV PDF does not contain readable text. It may be a scanned/image PDF. Please use a text-based PDF or run OCR first.' },
  'cv.hanya_pdf':                { id: 'Only PDF files are accepted', en: 'Only PDF files are accepted' },

  // ── Login/Register ─────────────────────────────────────────────────
  'login.title':                 { id: 'Masuk',             en: 'Login' },
  'login.email':                 { id: 'Email',             en: 'Email' },
  'login.password':              { id: 'Password',          en: 'Password' },
  'login.submit':                { id: 'Masuk',             en: 'Login' },
  'login.register_link':         { id: 'Belum punya akun? Daftar', en: 'No account? Register' },
  'register.title':              { id: 'Daftar',            en: 'Register' },
  'register.name':               { id: 'Nama',              en: 'Name' },
  'register.submit':             { id: 'Daftar',             en: 'Register' },
  'register.login_link':         { id: 'Sudah punya akun? Masuk', en: 'Already have an account? Login' },

  // ── Window title (synced via JS) ──────────────────────────────────────
  'app.title':                    { id: 'ORDAL — Auto-Apply Kerja', en: 'ORDAL — Job Auto-Apply' },

  // ── CariKerja: extra strings (v43) ───────────────────────────────────
  'cari_kerja.headless_on_desc':  { id: 'Bot jalan diam saat sesi berikutnya.', en: 'Bot runs silently in the next session.' },
  'cari_kerja.headless_off_desc': { id: 'Browser bot terlihat saat sesi berikutnya.', en: 'Bot browser will be visible in the next session.' },
  'cari_kerja.empty_jobs_title':  { id: 'BELUM ADA LOWONGAN', en: 'NO VACANCIES YET' },
  'cari_kerja.empty_jobs_desc':   { id: 'Progress real-time muncul saat bot berjalan.', en: 'Real-time progress appears when the bot runs.' },
  'cari_kerja.target_count':     { id: 'target', en: 'targets' },  // plural — used after a number
  'cari_kerja.cv_label':         { id: 'CV', en: 'CV' },
  'cari_kerja.gagal_simpan_cover': { id: 'Gagal menyimpan cover letter', en: 'Failed to save cover letter' },
  'cari_kerja.gagal_generate_cover': { id: 'Gagal generate cover letter', en: 'Failed to generate cover letter' },
  'cari_kerja.gagal_generate_cover_ai': { id: 'Gagal generate cover letter via AI', en: 'Failed to generate cover letter via AI' },
  'cari_kerja.gen_template_desc': { id: 'Generate template cover letter dari CV pakai AI. Bahasa mengikuti CV.', en: 'Generate cover letter template from CV using AI. Language follows the CV.' },
  'cari_kerja.cv_not_selected':  { id: 'CV tidak terpilih untuk target ini. Edit target untuk pilih CV.', en: 'No CV selected for this target. Edit the target to pick a CV.' },
  'cari_kerja.cv_not_selected_edit': { id: 'CV tidak terpilih untuk target ini. Edit target untuk pilih CV dulu.', en: 'No CV selected for this target. Edit the target to pick a CV first.' },
  'cari_kerja.cover_letter_scope': { id: 'Cover letter berlaku untuk', en: 'Cover letter applies to' },
  'cari_kerja.cover_letter_scope_all': { id: 'semua target posisi', en: 'all targets in position' },
  'cari_kerja.cover_letter_placeholder_note': { id: 'otomatis diganti saat melamar.', en: 'auto-replaced when applying.' },
  'cari_kerja.gagal_simpan_prefs': { id: 'Gagal menyimpan preferensi', en: 'Failed to save preferences' },
  'cari_kerja.klik_edit':         { id: 'Klik untuk edit target', en: 'Click to edit target' },
  'cari_kerja.sudah_dilamar':     { id: 'Sudah pernah dilamar', en: 'Already applied' },
  'cari_kerja.jawaban_harus_angka_msg': { id: 'Jawaban harus angka.', en: 'Answer must be a number.' },
  'cari_kerja.jawaban_tersimpan_msg': { id: 'Jawaban tersimpan dan bot lanjut.', en: 'Answer saved, bot continues.' },
  'cari_kerja.gagal_kirim_jawaban': { id: 'Gagal mengirim jawaban', en: 'Failed to send answer' },

  // ── available_join display values (stored values, translated at display) ──
  'join.immediate':              { id: 'Secepatnya', en: 'Immediately' },
  'join.1_week':                 { id: '1 minggu', en: '1 week' },
  'join.1_month_notice':         { id: '1 month notice', en: '1 month notice' },

  // ── Settings page (v43) ──────────────────────────────────────────────
  'settings.platform.linkedin.desc': { id: 'Dipakai untuk LinkedIn Jobs dan LinkedIn Posts', en: 'Used for LinkedIn Jobs and LinkedIn Posts' },
  'settings.platform.jobstreet.desc': { id: 'Dipakai untuk JobStreet Indonesia', en: 'Used for JobStreet Indonesia' },
  'settings.session_not_captured': { id: 'Session belum terbaca', en: 'Session not captured yet' },
  'settings.cara_login':         { id: 'Cara login', en: 'How to log in' },
  'settings.email.sender_required': { id: 'Email pengirim wajib diisi', en: 'Sender email is required' },
  'settings.email.saved':        { id: 'Konfigurasi email disimpan!', en: 'Email configuration saved!' },
  'settings.email.gagal_simpan': { id: 'Gagal menyimpan', en: 'Failed to save' },
  'settings.email.konfirmasi_hapus': { id: 'Hapus konfigurasi email?', en: 'Delete email configuration?' },
  'settings.log.gagal_buka':     { id: 'Gagal buka log', en: 'Failed to open log' },
  'settings.log.gagal_buka_folder': { id: 'Gagal buka folder log', en: 'Failed to open log folder' },
  'settings.log.buka_finder':    { id: 'Buka file log backend di Finder/Explorer', en: 'Open backend log file in Finder/Explorer' },
  'settings.capture_ulang':      { id: 'Capture Ulang', en: 'Re-capture' },

  // ── Persiapan: tab descriptions (v43) ─────────────────────────────────
  'persiapan.tab.cv.desc':       { id: 'Upload & kelola CV PDF', en: 'Upload & manage CV PDF' },
  'persiapan.tab.apply.desc':    { id: 'Login LinkedIn/JobStreet & Email SMTP', en: 'Login LinkedIn/JobStreet & Email SMTP' },
  'persiapan.tab.telegram.desc': { id: 'Bot token & link akun', en: 'Bot token & account link' },
  'persiapan.tab.jadwal.desc':   { id: 'Auto-apply schedule', en: 'Auto-apply schedule' },
  'persiapan.telegram.desc_long': { id: 'Untuk kontrol via Telegram & notifikasi auto-apply. Dapat dari @BotFather.', en: 'For Telegram control & auto-apply notifications. Get it from @BotFather.' },

  // ── CVManager: error messages (v43) ───────────────────────────────────
  'cv.pilih_file_dulu':          { id: 'Pilih file PDF dulu', en: 'Please choose a PDF file first' },
  'cv.isi_label':                { id: 'Isi label posisi', en: 'Please enter a position label' },
  'cv.upload_gagal':             { id: 'Upload gagal', en: 'Upload failed' },

  // ── Login/Register: error messages (v43) ──────────────────────────────
  'login.gagal':                 { id: 'Login gagal', en: 'Login failed' },
  'register.gagal':              { id: 'Registrasi gagal', en: 'Registration failed' },

  // ── AppConfig (v43) ──────────────────────────────────────────────────
  'appconfig.belum_diset':       { id: 'Belum di-set', en: 'Not set yet' },
  'appconfig.nilai_tidak_boleh_kosong': { id: 'Nilai tidak boleh kosong.', en: 'Value cannot be empty.' },
  'appconfig.override_label':    { id: 'Override (kosongkan jika tidak ingin ubah)', en: 'Override (leave empty to keep current)' },
  'appconfig.masukkan_nilai':    { id: 'Masukkan nilai', en: 'Enter value' },
  'appconfig.konfirmasi_putus_telegram': { id: 'Putuskan link Telegram? Bot tidak akan bisa kirim notifikasi ke Anda lagi.', en: 'Disconnect Telegram link? The bot will no longer be able to send you notifications.' },
  'appconfig.jadwal_disimpan':   { id: 'Jadwal auto-apply disimpan.', en: 'Auto-apply schedule saved.' },
  'appconfig.prefs_disimpan':    { id: 'Preferensi disimpan.', en: 'Preferences saved.' },
  'appconfig.tersimpan_suffix':  { id: 'Tersimpan.', en: 'Saved.' },
  'appconfig.gagal_simpan_prefix': { id: 'Gagal simpan:', en: 'Save failed:' },
  'appconfig.dihapus_suffix':    { id: 'dihapus.', en: 'deleted.' },

  // ── RiwayatLamaran: errors (v43) ──────────────────────────────────────
  'riwayat.gagal_memuat':        { id: 'Gagal memuat riwayat lamaran', en: 'Failed to load application history' },

  // ── KumpulanPertanyaan (v43) ──────────────────────────────────────────
  'pertanyaan.gagal_memuat':     { id: 'Gagal memuat pertanyaan', en: 'Failed to load questions' },
  'pertanyaan.qa_wajib':         { id: 'Pertanyaan dan jawaban wajib diisi', en: 'Question and answer are required' },
  'pertanyaan.opsi_wajib':       { id: 'Isi minimal satu opsi untuk pertanyaan dropdown.', en: 'Add at least one option for a dropdown question.' },
  'pertanyaan.jawaban_harus_opsi': { id: 'Jawaban dropdown harus dipilih dari opsi yang tersedia.', en: 'A dropdown answer must be selected from the available options.' },
  'pertanyaan.opsi_ph':          { id: 'Opsi, pisahkan dengan koma atau baris baru', en: 'Options, separated by commas or new lines' },
  'pertanyaan.pilih_jawaban':    { id: 'Pilih jawaban', en: 'Choose an answer' },
  'pertanyaan.jawaban':          { id: 'Jawaban', en: 'Answer' },
  'pertanyaan.gagal_menyimpan': { id: 'Gagal menyimpan', en: 'Failed to save' },
  'pertanyaan.gagal_update':     { id: 'Gagal update', en: 'Failed to update' },

  // ── Activity log status labels (v43) ──────────────────────────────────
  'log.gagal_apply':            { id: 'Gagal apply.', en: 'Apply failed.' },
  'log.dilewati':                { id: 'Dilewati.', en: 'Skipped.' },
  'log.status_applied':         { id: 'APPLIED', en: 'APPLIED' },
  'log.status_prospek':         { id: 'PROSPEK', en: 'PROSPECT' },
  'log.status_proses':          { id: 'PROSES', en: 'IN PROGRESS' },
  'log.status_skip':            { id: 'SKIP', en: 'SKIP' },
  'log.standby':                { id: 'STANDBY', en: 'STANDBY' },
  // ═══ v3: UMUM ═══════════════════════════════════════════════════════
  'common.cancel':    { id: 'Batal',            en: 'Cancel' },
  'common.back':      { id: 'Kembali',          en: 'Back' },
  'common.next':      { id: 'Lanjut',           en: 'Continue' },
  'common.close':     { id: 'Tutup',            en: 'Close' },
  'common.add':       { id: 'Tambah',           en: 'Add' },
  'common.remove':    { id: 'Hapus',            en: 'Remove' },

  // ═══ v3: AUTH — popup login (gaya web) ══════════════════════════════
  'auth.login_title':     { id: 'Masuk ke ORDAL',          en: 'Sign in to ORDAL' },
  'auth.login_sub':      { id: 'Satu akun untuk semua fitur auto-apply.', en: 'One account for all auto-apply features.' },
  'auth.register_title':  { id: 'Buat akun ORDAL',         en: 'Create your ORDAL account' },
  'auth.register_sub':   { id: 'Gratis — mulai auto-apply sekarang.', en: 'Free — start auto-applying now.' },
  'auth.google_btn':     { id: 'Lanjut dengan Google',    en: 'Continue with Google' },
  'auth.google_soon':    { id: 'Login Google belum aktif di server ORDAL-Web. Hubungi admin ORDAL.', en: 'Google login is not enabled on the ORDAL-Web server. Contact the ORDAL administrator.' },
  'auth.google_unreachable': { id: 'Server ORDAL tidak dapat dihubungi. Periksa koneksi internet lalu coba lagi.', en: 'The ORDAL server could not be reached. Check your internet connection and try again.' },
  'auth.google_waiting': { id: 'Menunggu login Google...', en: 'Waiting for Google login...' },
  'auth.google_waiting_sub': { id: 'Browser telah terbuka. Selesaikan login Google, lalu kembali ke aplikasi ini.', en: 'Your browser has opened. Complete Google sign-in, then return to this app.' },
  'auth.google_failed':  { id: 'Login Google gagal atau dibatalkan.', en: 'Google login failed or was cancelled.' },
  'auth.google_timeout': { id: 'Waktu login Google habis. Silakan coba lagi.', en: 'Google sign-in timed out. Please try again.' },
  'auth.browser_note':   { id: 'Chrome tidak wajib. Login dibuka aman di browser default kamu.', en: 'Chrome is not required. Sign-in opens safely in your default browser.' },
  'auth.or':             { id: 'atau', en: 'or' },
  'auth.name':           { id: 'Nama', en: 'Name' },
  'auth.name_ph':        { id: 'Aditya Pratama', en: 'Aditya Pratama' },
  'auth.email':          { id: 'Email', en: 'Email' },
  'auth.password':       { id: 'Password', en: 'Password' },
  'auth.login_btn':      { id: 'Masuk', en: 'Sign in' },
  'auth.register_btn':   { id: 'Daftar Sekarang', en: 'Create account' },
  'auth.err_fill':       { id: 'Email dan password wajib diisi.', en: 'Email and password are required.' },
  'auth.err_name':       { id: 'Nama wajib diisi.', en: 'Name is required.' },
  'auth.err_pass_len':   { id: 'Password minimal 6 karakter.', en: 'Password must be at least 6 characters.' },
  'auth.err_generic':    { id: 'Terjadi kesalahan. Coba lagi.', en: 'Something went wrong. Please try again.' },
  'auth.verif_note':     { id: 'Setelah daftar, email kamu wajib diverifikasi dengan kode 6 digit.', en: 'After signing up, your email must be verified with a 6-digit code.' },
  'auth.no_account':     { id: 'Belum punya akun?', en: "Don't have an account?" },
  'auth.have_account':   { id: 'Sudah punya akun?', en: 'Already have an account?' },
  'auth.register_link':  { id: 'Daftar', en: 'Sign up' },
  'auth.login_link':     { id: 'Masuk', en: 'Sign in' },

  // ═══ v3: VERIFIKASI EMAIL ══════════════════════════════════════════
  'verify.title':        { id: 'Verifikasi Email', en: 'Verify your email' },
  'verify.sub':          { id: 'Masukkan kode 6 digit yang kami kirim ke', en: 'Enter the 6-digit code we sent to' },
  'verify.expires_in':   { id: 'Kode berlaku', en: 'Code expires in' },
  'verify.dev_mode':     { id: 'Mode pengembangan', en: 'Development mode' },
  'verify.dev_code':     { id: 'SMTP belum dikonfigurasi — kode verifikasi kamu:', en: 'SMTP not configured — your verification code:' },
  'verify.dev_hint':     { id: 'Isi SMTP_USER & SMTP_APP_PASSWORD di backend/.env agar kode dikirim via email.', en: 'Set SMTP_USER & SMTP_APP_PASSWORD in backend/.env to send codes via email.' },
  'verify.btn':          { id: 'Verifikasi & Lanjut', en: 'Verify & continue' },
  'verify.not_received': { id: 'Tidak menerima kode?', en: "Didn't receive a code?" },
  'verify.resend':       { id: 'Kirim ulang', en: 'Resend code' },
  'verify.sending':      { id: 'Mengirim...', en: 'Sending...' },
  'verify.err_wrong':    { id: 'Kode verifikasi salah. Coba lagi.', en: 'Incorrect verification code. Try again.' },
  'verify.err_resend':   { id: 'Gagal mengirim ulang kode.', en: 'Failed to resend code.' },

  // ═══ v3: DEVICE (maks 2 — konsep WhatsApp) ═════════════════════════
  'device.limit_title':     { id: 'Batas Device Tercapai', en: 'Device Limit Reached' },
  'device.limit_msg':       { id: 'Akun ini sudah dipakai di 2 device. Keluarkan salah satu untuk lanjut.', en: 'This account is already used on 2 devices. Remove one to continue.' },
  'device.limit_explain':   { id: 'Satu akun ORDAL maksimal bisa diakses dari 2 device — mirip konsep WhatsApp. Data kamu tersinkron otomatis di semua device.', en: 'One ORDAL account can be used on at most 2 devices — similar to WhatsApp. Your data syncs automatically across devices.' },
  'device.this_device':     { id: 'Device ini', en: 'This device' },
  'device.last_login':      { id: 'Login terakhir', en: 'Last login' },
  'device.remove':          { id: 'Keluarkan device ini', en: 'Remove this device' },
  'device.remove_btn':      { id: 'Keluarkan', en: 'Remove' },
  'device.remove_failed':   { id: 'Gagal mengeluarkan device.', en: 'Failed to remove device.' },
  'device.slot_available':  { id: 'Slot device tersedia — kamu bisa login sekarang.', en: 'A device slot is now available — you can sign in now.' },
  'device.back_login':      { id: 'Kembali ke Login', en: 'Back to sign in' },
  'device.retry_login':     { id: 'Coba Login Lagi', en: 'Try signing in again' },
  'device.still_full':      { id: 'Masih penuh — keluarkan minimal satu device lain.', en: 'Still full — remove at least one other device.' },
  'device.manager_title':   { id: 'Kelola Device', en: 'Manage Devices' },
  'device.manager_sub':     { id: 'Device yang terhubung ke akunmu (maksimal 2).', en: 'Devices connected to your account (max 2).' },
  'device.slot_free':       { id: '1 slot device masih kosong', en: '1 device slot still free' },

  // ═══ v3: SIDEBAR ════════════════════════════════════════════════════
  'sidebar.devices':       { id: 'Kelola Device', en: 'Manage Devices' },
  'sidebar.logout':        { id: 'Keluar', en: 'Sign out' },
  'sidebar.logout_hint':   { id: 'Keluar sekaligus melepas device ini dari akunmu', en: 'Sign out and release this device from your account' },
  'sidebar.multi_account': { id: 'multi-device', en: 'multi-device' },

  // ═══ v3: WELCOME ═══════════════════════════════════════════════════
  'welcome.title': { id: 'Bantu kamu dapet kerja dengan', en: 'Land your next job with' },
  'welcome.sub':   { id: 'Login dulu untuk melanjutkan — CV, preferensi, riwayat lamaran, dan bank pertanyaan kamu tersimpan aman di akunmu.', en: 'Sign in to continue — your CV, preferences, application history, and question bank are safely stored in your account.' },

  // ═══ v3: ONBOARDING WIZARD ═════════════════════════════════════════
  'onb.step_cv':        { id: 'Upload CV', en: 'Upload your CV' },
  'onb.step_prefs':     { id: 'Preferensi Kerja', en: 'Job Preferences' },
  'onb.step_cover':     { id: 'Cover Letter', en: 'Cover Letter' },
  'onb.step_platforms': { id: 'Pilih Job Platform', en: 'Choose Job Platforms' },
  'onb.step_email':     { id: 'Hubungkan Email', en: 'Connect Email' },
  'onb.step_login':     { id: 'Login Job Platform', en: 'Sign in to Job Platforms' },
  'onb.step_of':        { id: 'Langkah {n} dari {total}', en: 'Step {n} of {total}' },
  'onb.loading':        { id: 'Memuat progres onboarding...', en: 'Loading onboarding progress...' },
  'onb.name_kicker':    { id: 'KENALAN DULU', en: 'FIRST, A QUICK HELLO' },
  'onb.name_title':     { id: 'Hai! Kamu biasa dipanggil apa?', en: 'Hey! What do your friends call you?' },
  'onb.name_sub':       { id: 'Biar obrolan kita terasa lebih dekat. Nama depan atau nama panggilan juga boleh.', en: 'Let’s make this feel personal. Your first name or a nickname works perfectly.' },
  'onb.name_label':     { id: 'Kamu biasa dipanggil', en: 'Your preferred name' },
  'onb.name_ph':        { id: 'Tulis nama panggilanmu', en: 'Type the name you go by' },
  'onb.name_error':     { id: 'Kenalan dulu, ya — tulis nama yang kamu suka.', en: 'Let’s get acquainted first — add the name you prefer.' },
  'onb.name_cta':       { id: 'Kenalan, yuk', en: 'Nice to meet you' },
  'onb.hello_kicker':   { id: 'SENANG KENAL KAMU', en: 'GREAT TO MEET YOU' },
  'onb.hello_title':    { id: 'Hai, {name}. Senang kenalan!', en: 'Hi, {name}. Great to meet you!' },
  'onb.hello_sub':      { id: 'Mulai dari sini, kamu nggak perlu menyiapkan semuanya sendirian. ORDAL bantu bereskan langkah-langkahnya, satu per satu.', en: 'From here, you don’t have to figure everything out alone. ORDAL will help, one clear step at a time.' },
  'onb.hello_cta':      { id: 'Lihat caranya', en: 'Show me how' },
  'onb.intro_kicker':   { id: 'SANTAI, CUMA 3 HAL', en: 'JUST THREE SIMPLE THINGS' },
  'onb.intro_title':    { id: 'Oke, kita mulai pelan-pelan', en: 'Okay, let’s take it step by step' },
  'onb.intro_sub':      { id: 'Bantu ORDAL mengenal CV dan pekerjaan yang kamu cari. Kalau ada informasi yang belum jelas, kami akan tanya — bukan menebak.', en: 'Help ORDAL understand your CV and the work you want. If something is unclear, we’ll ask instead of guessing.' },
  'onb.intro_cv':       { id: 'Baca isi CV kamu, bukan sekadar filenya', en: 'Read your CV, not just store the file' },
  'onb.intro_prefs':    { id: 'Ingat posisi dan lokasi incaranmu', en: 'Remember the roles and places you want' },
  'onb.intro_questions': { id: 'Tanya dulu kalau jawabannya belum ada', en: 'Ask you whenever an answer is missing' },
  'onb.lets_begin':     { id: 'Yuk, mulai', en: 'Let’s get started' },
  'onb.finish':         { id: 'Selesaikan & Mulai', en: 'Finish & start' },
  'onb.view_example':   { id: 'Lihat Contoh', en: 'View example' },
  'onb.cover_hint':     { id: 'Tulis cover letter dengan placeholder', en: 'Write your cover letter using the placeholders' },
  'onb.cover_hint2':    { id: '— akan otomatis diganti sesuai lowongan saat bot melamar.', en: '— they will be auto-replaced per job when the bot applies.' },
  'onb.cover_ph':       { id: 'Halo Tim {company}, saya tertarik dengan posisi {position}...', en: 'Hello {company} team, I am interested in the {position} role...' },
  'onb.chars':          { id: 'karakter', en: 'characters' },

  'onb.cv_title':     { id: 'Klik untuk pilih file PDF', en: 'Click to select a PDF file' },
  'onb.cv_hint':      { id: 'Format PDF · teks harus bisa dibaca (bukan hasil scan)', en: 'PDF format · text must be selectable (not a scan)' },
  'onb.cv_ats_title': { id: 'Tips sebelum upload: gunakan CV ATS-friendly', en: 'Before uploading: use an ATS-friendly CV' },
  'onb.cv_ats_desc':  { id: 'ATS adalah sistem yang membaca dan menyaring CV sebelum dilihat recruiter. Gunakan layout sederhana, judul bagian yang jelas, kata kunci relevan, dan teks asli—bukan gambar atau hasil scan.', en: 'An ATS reads and filters CVs before a recruiter sees them. Use a simple layout, clear section headings, relevant keywords, and real text—not images or scanned pages.' },
  'onb.cv_ai_tip':    { id: 'AI boleh membantu merapikan kalimat dan struktur, tetapi semua pengalaman, tanggal, keahlian, dan pencapaian harus tetap benar.', en: 'AI can help improve wording and structure, but every experience, date, skill, and achievement must remain true.' },
  'onb.cv_read_ok':   { id: 'CV sudah terbaca. ORDAL akan memakai isi CV ini sebagai sumber utama dan bertanya jika informasi tidak ditemukan.', en: 'CV read successfully. ORDAL will use it as the main source and ask you whenever information is missing.' },
  'onb.cv_label':     { id: 'Label posisi untuk CV ini', en: 'Position label for this CV' },
  'onb.cv_label_ph':  { id: 'cth: Backend Engineer', en: 'e.g. Backend Engineer' },
  'onb.cv_list':      { id: 'Pilih CV aktif', en: 'Select active CV' },

  'onb.f_positions':     { id: 'Posisi yang diincar', en: 'Target positions' },
  'onb.f_positions_ph':  { id: 'cth: Backend Engineer — tekan Enter', en: 'e.g. Backend Engineer — press Enter' },
  'onb.f_positions_help': { id: 'Ketik satu posisi lalu tekan Enter. Ulangi untuk menambahkan beberapa posisi.', en: 'Type one position and press Enter. Repeat to add multiple positions.' },
  'onb.f_locations':     { id: 'Lokasi kerja', en: 'Work locations' },
  'onb.f_locations_ph':  { id: 'cth: Jakarta — tekan Enter', en: 'e.g. Jakarta — press Enter' },
  'onb.f_locations_help': { id: 'Ketik satu lokasi lalu tekan Enter. Kamu bisa menambahkan beberapa kota atau area.', en: 'Type one location and press Enter. You can add multiple cities or areas.' },
  'onb.f_salary':        { id: 'Gaji yang diharapkan', en: 'Expected salary' },
  'onb.f_salary_ph':     { id: 'cth: Rp 10-15 juta', en: 'e.g. IDR 10-15 million' },
  'onb.f_join':          { id: 'Kapan bisa bergabung', en: 'Available to join' },
  'onb.f_excl_pos':      { id: 'Posisi yang dihindari', en: 'Positions to avoid' },
  'onb.f_excl_pos_ph':   { id: 'opsional — cth: Sales', en: 'optional — e.g. Sales' },
  'onb.f_excl_co':       { id: 'Perusahaan yang dihindari', en: 'Companies to avoid' },
  'onb.f_excl_co_ph':    { id: 'opsional — cth: PT Contoso', en: 'optional — e.g. Contoso Ltd' },
  'onb.f_type':          { id: 'Tipe pekerjaan', en: 'Employment type' },

  'onb.join_immediately':       { id: 'Segera / secepatnya', en: 'Immediately' },
  'onb.join_2_weeks':           { id: '2 minggu', en: '2 weeks' },
  'onb.join_1_month':           { id: '1 bulan', en: '1 month' },
  'onb.join_more_than_1_month': { id: 'Lebih dari 1 bulan', en: 'More than 1 month' },
  'onb.type_full_time':  { id: 'Penuh (Full-time)', en: 'Full-time' },
  'onb.type_contract':   { id: 'Kontrak', en: 'Contract' },
  'onb.type_intern':     { id: 'Magang', en: 'Internship' },

  'onb.platform_jobstreet':           { id: 'JobStreet', en: 'JobStreet' },
  'onb.platform_jobstreet_desc':      { id: 'Auto-apply lowongan JobStreet dengan CV & jawaban otomatis.', en: 'Auto-apply to JobStreet listings with CV & automatic answers.' },
  'onb.platform_linkedin_jobs':       { id: 'LinkedIn Jobs (Easy Apply)', en: 'LinkedIn Jobs (Easy Apply)' },
  'onb.platform_linkedin_jobs_desc':  { id: 'Apply cepat lowongan LinkedIn lewat tombol Easy Apply.', en: 'Quickly apply to LinkedIn jobs via Easy Apply.' },
  'onb.platform_linkedin_posts':      { id: 'LinkedIn Posts', en: 'LinkedIn Posts' },
  'onb.platform_linkedin_posts_desc': { id: 'Bot cari lowongan dari post LinkedIn & email langsung ke recruiter.', en: 'Bot finds jobs from LinkedIn posts & emails recruiters directly.' },
  'onb.posts_email_note':             { id: 'LinkedIn Posts wajib menghubungkan email (Gmail) untuk kirim lamaran ke recruiter.', en: 'LinkedIn Posts requires connecting your email (Gmail) to send applications to recruiters.' },

  'onb.email_note':          { id: 'Hubungkan Gmail untuk kirim lamaran dari LinkedIn Posts ke recruiter. Pakai App Password (bukan password biasa).', en: 'Connect Gmail to send LinkedIn Posts applications to recruiters. Use an App Password (not your regular password).' },
  'onb.email_app_pass':      { id: 'App Password Gmail', en: 'Gmail App Password' },
  'onb.email_app_pass_hint': { id: 'Buat di', en: 'Create one at' },
  'onb.email_save':          { id: 'Simpan & Hubungkan', en: 'Save & connect' },
  'onb.email_test':          { id: 'Kirim Email Tes', en: 'Send test email' },
  'onb.email_test_ok':       { id: 'Email tes berhasil terkirim!', en: 'Test email sent successfully!' },
  'onb.email_test_fail':     { id: 'Email tes gagal — cek alamat & app password.', en: 'Test email failed — check address & app password.' },
  'onb.email_ok':            { id: 'Email terhubung!', en: 'Email connected!' },
  'onb.email_ok_sub':        { id: 'LinkedIn Posts siap mengirim lamaran ke recruiter.', en: 'LinkedIn Posts is ready to send applications to recruiters.' },

  'onb.login_required_note':  { id: 'Wajib login minimal SATU platform (JobStreet atau LinkedIn) sebelum mulai. Platform lain bisa di-skip.', en: 'You must sign in to at least ONE platform (JobStreet or LinkedIn) before starting. The other one can be skipped.' },
  'onb.login_jobstreet_desc': { id: 'Login JobStreet sekali — bot pakai sesi kamu untuk melamar.', en: 'Sign in to JobStreet once — the bot uses your session to apply.' },
  'onb.login_linkedin_desc':  { id: 'Login LinkedIn sekali — dipakai untuk Jobs (Easy Apply) & Posts.', en: 'Sign in to LinkedIn once — used for both Jobs (Easy Apply) & Posts.' },
  'onb.login_btn':            { id: 'Login via Browser', en: 'Sign in via browser' },
  'onb.logged_in':            { id: 'Sudah login', en: 'Signed in' },
  'onb.not_logged_in':        { id: 'Belum login', en: 'Not signed in' },
  'onb.waiting_login':        { id: 'Menunggu...', en: 'Waiting...' },
  'onb.grab_hint':            { id: 'Browser sedang terbuka — login akun kamu di sana, status akan update otomatis.', en: 'A browser window has opened — sign in there, this status will update automatically.' },

  'onb.done_title':     { id: 'Onboarding Selesai!', en: 'Onboarding Complete!' },
  'onb.done_sub':       { id: 'Semua siap — ORDAL siap mencarikan kerjaan untukmu.', en: 'All set — ORDAL is ready to hunt jobs for you.' },
  'onb.done_cv':        { id: 'CV terupload & tersimpan di akun', en: 'CV uploaded & stored in your account' },
  'onb.done_prefs':     { id: 'Preferensi kerja tersimpan', en: 'Job preferences saved' },
  'onb.done_platforms': { id: 'Job platform terpilih', en: 'Job platforms selected' },
  'onb.done_login':     { id: 'Sesi job platform aktif', en: 'Job platform session active' },
  'onb.start_btn':      { id: 'Mulai Pakai ORDAL', en: 'Start using ORDAL' },
  'onb.ai_title':       { id: 'Hubungkan AI agar bot bekerja maksimal', en: 'Connect AI for the best results' },
  'onb.ai_sub':         { id: 'Opsional, tetapi direkomendasikan untuk menjawab formulir, menilai kecocokan, dan membuat cover letter.', en: 'Optional, but recommended for answering forms, matching jobs, and writing cover letters.' },
  'onb.ai_setup':       { id: 'Atur AI sekarang', en: 'Set up AI now' },
  'onb.ai_skip':        { id: 'Lewati untuk sekarang', en: 'Skip for now' },

  'onb.err_load':           { id: 'Gagal memuat onboarding.', en: 'Failed to load onboarding.' },
  'onb.err_cv':             { id: 'Pilih atau upload CV dulu.', en: 'Select or upload a CV first.' },
  'onb.err_positions':      { id: 'Tambahkan minimal satu posisi.', en: 'Add at least one position.' },
  'onb.err_locations':      { id: 'Tambahkan minimal satu lokasi.', en: 'Add at least one location.' },
  'onb.err_cover':          { id: 'Cover letter terlalu pendek (minimal 50 karakter) — klik Lihat Contoh bila perlu.', en: 'Cover letter is too short (min 50 characters) — click View example if needed.' },
  'onb.err_platforms':      { id: 'Pilih minimal satu job platform.', en: 'Select at least one job platform.' },
  'onb.err_login_required': { id: 'Login minimal satu job platform dulu (JobStreet atau LinkedIn).', en: 'Sign in to at least one job platform first (JobStreet or LinkedIn).' },
  'onb.err_finish':         { id: 'Gagal menyelesaikan onboarding — coba lagi.', en: 'Failed to complete onboarding — try again.' },
  'onb.err_cv_upload':      { id: 'Upload CV gagal — pastikan PDF & teksnya bisa dibaca.', en: 'CV upload failed — make sure it is a readable-text PDF.' },
  'onb.err_grab':           { id: 'Gagal membuka browser login.', en: 'Failed to open the login browser.' },
  'onb.err_email_save':     { id: 'Gagal menyimpan konfigurasi email.', en: 'Failed to save email configuration.' },

  // ═══ v3: CONTOH COVER LETTER ═══════════════════════════════════════
  'cover.title':         { id: 'Contoh Cover Letter', en: 'Cover Letter Example' },
  'cover.sub':           { id: 'Contoh lengkap dengan placeholder yang siap dipakai.', en: 'A complete example with ready-to-use placeholders.' },
  'cover.explain':       { id: 'Placeholder', en: 'The placeholders' },
  'cover.ph_company':    { id: '{company} (nama perusahaan)', en: '{company} (company name)' },
  'cover.and':           { id: 'dan', en: 'and' },
  'cover.ph_position':   { id: '{position} (judul posisi)', en: '{position} (job title)' },
  'cover.auto_replace':  { id: 'akan otomatis diganti saat bot mengirim lamaran.', en: 'are automatically replaced when the bot sends an application.' },
  'cover.use_example':   { id: 'Pakai Contoh Ini', en: 'Use this example' },

  // ═══ v3.1: LISENSI — TRIAL + PEMBAYARAN + AKTIVASI ════════════════
  'lic.title':            { id: 'Lanjutkan Menggunakan ORDAL', en: 'Keep Using ORDAL' },
  'lic.sub_choose':       { id: 'Pilih metode pembayaran untuk mengaktifkan ORDAL PRO.', en: 'Choose a payment method to activate ORDAL PRO.' },
  'lic.expired_banner':   { id: 'Trial gratis 3 hari kamu sudah berakhir. Aktifkan ORDAL PRO untuk melanjutkan menggunakan semua fitur auto-apply.', en: 'Your free 3-day trial has ended. Activate ORDAL PRO to keep using all auto-apply features.' },
  'lic.ineligible_banner': { id: 'Trial gratis sudah pernah dipakai oleh identitas atau perangkat ini. Aktivasi ORDAL PRO untuk melanjutkan.', en: 'A free trial has already been used by this identity or device. Activate ORDAL PRO to continue.' },
  'lic.benefits_title':   { id: 'Yang kamu dapat:', en: 'What you get:' },
  'lic.b1':               { id: 'Auto-apply tanpa batas', en: 'Unlimited auto-apply' },
  'lic.b2':               { id: 'JobStreet + LinkedIn', en: 'JobStreet + LinkedIn' },
  'lic.b3':               { id: 'Lisensi aktif di 2 device', en: 'License works on 2 devices' },
  'lic.b4':               { id: 'Semua data tetap tersimpan', en: 'All your data stays saved' },
  'lic.method_qris':      { id: 'QRIS — Bank BCA', en: 'QRIS — Bank BCA' },
  'lic.method_qris_desc': { id: 'Scan QR pakai mobile banking / e-wallet apa pun', en: 'Scan with any mobile banking / e-wallet app' },
  'lic.method_paypal_desc': { id: 'Bayar internasional via PayPal', en: 'International payment via PayPal' },
  'lic.creating_invoice': { id: 'Menyiapkan invoice pembayaran…', en: 'Preparing payment invoice…' },
  'lic.have_code':        { id: 'Saya sudah punya kode aktivasi', en: 'I already have an activation code' },
  'lic.pay_qris':         { id: 'Bayar via QRIS (BCA)', en: 'Pay via QRIS (BCA)' },
  'lic.pay_paypal':       { id: 'Bayar via PayPal', en: 'Pay via PayPal' },
  'lic.sub_pay':          { id: 'Status pembayaran dicek otomatis — begitu dibayar, kode aktivasi langsung muncul.', en: 'Payment status is checked automatically — your activation code appears as soon as it is paid.' },
  'lic.qris_channel':     { id: 'QRIS — Bank BCA', en: 'QRIS — Bank BCA' },
  'lic.qr_static_hint':   { id: 'QR statis belum diatur — ikuti instruksi transfer di samping', en: 'Static QR not configured — follow the transfer instructions' },
  'lic.exact_amount':     { id: 'Nominal transfer PERSIS', en: 'Transfer EXACTLY' },
  'lic.unique_note':      { id: 'Termasuk 3 angka unik di belakang — jangan dibulatkan!', en: 'Includes a unique 3-digit suffix — do not round it!' },
  'lic.reference':        { id: 'Berita / Reference', en: 'Note / Reference' },
  'lic.total':            { id: 'Total pembayaran', en: 'Total' },
  'lic.invoice_expires':  { id: 'Invoice berakhir dalam', en: 'Invoice expires in' },
  'lic.i_paid':           { id: 'Saya Sudah Bayar', en: "I've Paid" },
  'lic.waiting_payment':  { id: 'Menunggu pembayaran…', en: 'Waiting for payment…' },
  'lic.verifying_note':   { id: 'Pembayaran sedang diverifikasi. Jendela ini akan otomatis lanjut begitu pembayaran valid terdeteksi — biarkan tetap terbuka.', en: 'Payment is being verified. This window will continue automatically once your valid payment is detected — keep it open.' },
  'lic.simulate':         { id: 'Simulasikan Pembayaran (Demo)', en: 'Simulate Payment (Demo)' },
  'lic.back':             { id: 'Kembali', en: 'Back' },
  'lic.pay_with_paypal':  { id: 'Bayar dengan PayPal', en: 'Pay with PayPal' },
  'lic.open_paypal_me':   { id: 'Buka PayPal', en: 'Open PayPal' },
  'lic.enter_code':       { id: 'Masukkan Kode Aktivasi', en: 'Enter Activation Code' },
  'lic.sub_code':         { id: 'Kode aktivasi personal kamu — dikirim ke email setelah pembayaran diverifikasi.', en: 'Your personal activation code — emailed after your payment is verified.' },
  'lic.code_label':       { id: 'Kode aktivasi', en: 'Activation code' },
  'lic.payment_verified': { id: 'Pembayaran terverifikasi!', en: 'Payment verified!' },
  'lic.code_emailed':     { id: 'Kode yang sama juga dikirim ke email kamu', en: 'The same code was also emailed to you' },
  'lic.copy':             { id: 'Salin', en: 'Copy' },
  'lic.copied':           { id: 'Tersalin!', en: 'Copied!' },
  'lic.your_code_info':   { id: 'Kode kamu:', en: 'Your code:' },
  'lic.activate_btn':     { id: 'Aktivasi Sekarang', en: 'Activate Now' },
  'lic.resend_code':      { id: 'Kirim ulang kode ke email', en: 'Email me the code again' },
  'lic.resend_in':        { id: 'Kirim ulang dalam', en: 'Resend in' },
  'lic.resent_ok':        { id: 'Kode aktivasi sudah dikirim ulang ke email kamu.', en: 'Activation code has been resent to your email.' },
  'lic.dev_code_note':    { id: 'Mode pengembangan (SMTP belum diatur) — kode kamu:', en: 'Dev mode (SMTP not configured) — your code:' },
  'lic.activated':        { id: 'ORDAL PRO Aktif!', en: 'ORDAL PRO Active!' },
  'lic.sub_activated':    { id: 'Terima kasih sudah mendukung ORDAL!', en: 'Thanks for supporting ORDAL!' },
  'lic.success_title':    { id: 'ORDAL PRO sudah aktif!', en: 'ORDAL PRO is now active!' },
  'lic.success_desc':     { id: 'Akses penuh auto-apply terbuka. Lisensi terikat ke akun kamu — tetap aktif walau ganti komputer atau install ulang app.', en: 'Full auto-apply access unlocked. Your license is tied to your account — it stays active even if you switch computers or reinstall the app.' },
  'lic.start_using':      { id: 'Mulai Pakai ORDAL', en: 'Start Using ORDAL' },
  'lic.footer_note':      { id: 'Lisensi terikat akun kamu (maks 2 device) dan tersimpan di server — tidak hilang walau install ulang app.', en: 'Your license is tied to your account (max 2 devices) and stored on the server — it survives app reinstalls.' },
  'lic.create_failed':    { id: 'Gagal membuat invoice pembayaran.', en: 'Failed to create payment invoice.' },
  'lic.confirm_failed':   { id: 'Gagal mengonfirmasi pembayaran.', en: 'Failed to confirm payment.' },
  'lic.simulate_failed':  { id: 'Simulasi gagal.', en: 'Simulation failed.' },
  'lic.code_invalid':     { id: 'Kode aktivasi salah. Cek ulang email kamu, atau minta kirim ulang kode.', en: 'Invalid activation code. Double-check your email, or request a new one.' },
  'lic.resend_failed':    { id: 'Gagal mengirim ulang kode.', en: 'Failed to resend code.' },
  'lic.st_pending':       { id: 'MENUNGGU', en: 'PENDING' },
  'lic.st_verifying':     { id: 'VERIFIKASI', en: 'VERIFYING' },
  'lic.st_verified':      { id: 'TERVERIFIKASI', en: 'VERIFIED' },
  'lic.st_failed':        { id: 'GAGAL', en: 'FAILED' },
  'lic.st_expired_inv':   { id: 'INVOICE EXPIRED', en: 'INVOICE EXPIRED' },
  'lic.badge_trial':      { id: 'Trial', en: 'Trial' },
  'lic.badge_trial_title': { id: 'Sisa trial gratis kamu — aktifkan kapan saja untuk akses penuh', en: 'Your remaining free trial — activate anytime for full access' },
  'lic.badge_not_started': { id: 'Trial 3 hari belum dimulai', en: '3-day trial not started' },
  'lic.badge_not_started_title': { id: 'Trial 3 hari dimulai saat kamu klik "Cari Kerja" pertama kali', en: 'Your 3-day trial starts when you first click "Find Jobs"' },
  'lic.badge_expired':    { id: 'Trial Habis — Aktivasi', en: 'Trial Over — Activate' },
  'lic.pro':              { id: 'ORDAL PRO aktif — akses penuh', en: 'ORDAL PRO active — full access' },
  'lic.pro_admin':        { id: 'ORDAL PRO aktif (admin)', en: 'ORDAL PRO active (admin)' },
  'lic.toast_started':    { id: 'Trial gratis 3 hari dimulai! Sisa:', en: 'Free 3-day trial started! Time left:' },
  'lic.toast_started_sub': { id: 'Terhitung sekarang — data tersimpan di server, install ulang tidak me-reset trial.', en: 'Counting from now — stored on our server, reinstalling the app will not reset it.' },
  'sidebar.upgrade_pro':  { id: 'Upgrade ke PRO', en: 'Upgrade to PRO' },
}


function translate(key, lang, params) {
  const entry = TRANSLATIONS[key]
  let text = entry ? (entry[lang] || entry.id || key) : key
  // Interpolasi sederhana: {n}, {total}, dst.
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.split('{' + k + '}').join(String(v))
    }
  }
  return text
}

// Helper: translate stored available_join value (e.g., 'Secepatnya' → 'Immediately' when EN)
// Falls back to original value if no translation found.
function translateJoin(value, lang) {
  if (!value) return value
  const map = {
    'Secepatnya':       'join.immediate',
    '1 minggu':         'join.1_week',
    '1 month notice':   'join.1_month_notice',
  }
  const key = map[value]
  if (!key) return value  // unknown value (e.g., custom text) — return as-is
  return translate(key, lang)
}

const useI18n = create((set, get) => ({
  lang: loadStoredLang(),
  languageChosen: hasStoredLang(),

  setLang: (lang) => {
    if (lang !== 'id' && lang !== 'en') return
    try {
      localStorage.setItem(STORAGE_KEY, lang)
      localStorage.setItem(CONFIRMED_KEY, '1')
    } catch (e) {
      // localStorage tidak tersedia — abaikan, tetap update state
    }
    set({ lang, languageChosen: true })
  },

  toggleLang: () => {
    const current = get().lang
    const next = current === 'id' ? 'en' : 'id'
    get().setLang(next)
  },

  // Helper translate function — pakai lang dari state saat ini
  t: (key, params) => translate(key, get().lang, params),
  // Translate stored available_join value (Secepatnya → Immediately)
  tj: (value) => translateJoin(value, get().lang),
}))

export default useI18n
