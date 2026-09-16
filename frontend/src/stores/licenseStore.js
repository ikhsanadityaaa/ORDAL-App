import { create } from 'zustand'
import api from '../api'

// ─────────────────────────────────────────────────────────────────────────────
// License Store v3.1 — trial 3 hari + pembayaran + activation code
//
// - Trial dimulai saat user klik "Cari Kerja" pertama kali (POST /trial/start)
// - Trial tercatat di DB pusat → install ulang app TIDAK mereset trial
// - Trial habis → pop-up pembayaran FORCED (QRIS BCA / PayPal) → kode aktivasi
// - Kode aktivasi tersimpan di server per email user, bisa dikirim ulang
// ─────────────────────────────────────────────────────────────────────────────

const useLicenseStore = create((set, get) => ({
  status: null,          // response /api/trial/status (activated, trial, pricing, ...)
  loading: false,
  showPaymentModal: false,
  paymentModalStep: 'choose',   // choose | qris | paypal | code | success
  forced: false,                // true = modal tidak bisa ditutup (trial habis)
  trialStartedToast: null,      // { remaining_seconds } → toast "trial dimulai"

  // Ambil status terbaru (dipanggil saat boot + poll berkala)
  refresh: async () => {
    set({ loading: true })
    try {
      const res = await api.get('/trial/status')
      const d = res.data
      const blocked = !d.activated && d.trial?.status === 'expired'
      set({
        status: d,
        loading: false,
        // Trial habis & belum aktivasi → pop-up pembayaran dipaksa muncul
        // (kecuali modal sudah terbuka / user sudah aktivasi)
        ...(blocked && !get().showPaymentModal
          ? { showPaymentModal: true, paymentModalStep: 'choose', forced: true }
          : {}),
      })
      return d
    } catch (err) {
      set({ loading: false })
      return null
    }
  },

  // Set status dari /auth/me (boot) supaya tidak call kedua.
  // Merge — jangan timpa field lengkap (mis. payments_simulated) dari /trial/status
  // kalau refresh() sudah lebih dulu selesai.
  setStatusFromMe: (license) => {
    if (!license) return
    const blocked = !license.activated && license.trial?.status === 'expired'
    set({
      status: { ...get().status, ...license },
      ...(blocked ? { showPaymentModal: true, paymentModalStep: 'choose', forced: true } : {}),
    })
  },

  // Dipanggil sebelum POST /sessions/start (klik tombol Cari Kerja).
  // Return true kalau boleh lanjut mulai sesi.
  startTrial: async () => {
    try {
      const res = await api.post('/trial/start')
      const d = res.data
      set({ status: { ...get().status, ...d } })
      if (d.just_started) {
        set({ trialStartedToast: { remaining_seconds: d.trial?.remaining_seconds || 259200 } })
      }
      return true
    } catch (err) {
      const detail = err.response?.data?.detail
      if (detail?.code === 'TRIAL_EXPIRED') {
        set({
          showPaymentModal: true,
          paymentModalStep: 'choose',
          forced: true,
          status: { ...get().status, ...(detail.status || {}) },
        })
        return false
      }
      throw err
    }
  },

  clearTrialToast: () => set({ trialStartedToast: null }),

  openPaymentModal: (step = 'choose') =>
    set({ showPaymentModal: true, paymentModalStep: step, forced: false }),

  closePaymentModal: () => {
    if (get().forced) return  // trial habis → modal tidak bisa ditutup
    set({ showPaymentModal: false, paymentModalStep: 'choose' })
  },

  // Setelah aktivasi sukses → lepas forced + tampilkan layar sukses
  onActivated: async () => {
    set({ paymentModalStep: 'success', forced: false })
    get().refresh()
  },

  // Event 403 TRIAL_EXPIRED dari interceptor api.js
  handleTrialExpiredEvent: () => {
    get().refresh()
    set({ showPaymentModal: true, paymentModalStep: 'choose', forced: true })
  },
}))

export default useLicenseStore
