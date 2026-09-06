import { create } from 'zustand'

// ─────────────────────────────────────────────────────────────────────────────
// i18n Store — Internationalization (Indonesia / English)
// ─────────────────────────────────────────────────────────────────────────────
// Sederhana: pakai object dictionary, bukan library berat seperti i18next.
// Bahasa default: 'id' (Indonesia). Disimpan di localStorage supaya persist
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

function loadStoredLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'id' || stored === 'en') return stored
  } catch (e) {
    // localStorage tidak tersedia (mis. SSR) — abaikan
  }
  return 'en'  // default English (user request: English on first open)
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
}

function translate(key, lang) {
  const entry = TRANSLATIONS[key]
  if (!entry) return key  // fallback: return key as-is
  return entry[lang] || entry.id || key
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

  setLang: (lang) => {
    if (lang !== 'id' && lang !== 'en') return
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch (e) {
      // localStorage tidak tersedia — abaikan, tetap update state
    }
    set({ lang })
  },

  toggleLang: () => {
    const current = get().lang
    const next = current === 'id' ? 'en' : 'id'
    get().setLang(next)
  },

  // Helper translate function — pakai lang dari state saat ini
  t: (key) => translate(key, get().lang),
  // Translate stored available_join value (Secepatnya → Immediately)
  tj: (value) => translateJoin(value, get().lang),
}))

export default useI18n
