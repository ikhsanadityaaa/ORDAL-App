import { create } from 'zustand'
import api from '../api'

// ─────────────────────────────────────────────────────────────────────────────
// Auth Store v3 — login wajib, verifikasi email, onboarding, device (max 2)
// ─────────────────────────────────────────────────────────────────────────────

function loadStoredUser() {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return null
    return JSON.parse(raw)
  } catch (err) {
    try {
      localStorage.removeItem('user')
      localStorage.removeItem('token')
    } catch (e) { /* ignore */ }
    return null
  }
}

function loadStoredToken() {
  try {
    return localStorage.getItem('token') || null
  } catch (err) {
    return null
  }
}

const useAuthStore = create((set, get) => ({
  user: loadStoredUser(),
  token: loadStoredToken(),
  onboarding: { completed: false, current_step: 1 },
  devices: [],
  googleConfigured: null,
  smtpConfigured: false,
  booted: false,        // true setelah pengecekan /auth/me pertama selesai
  showAuthModal: false, // popup login muncul saat app dibuka
  pendingVerify: null,  // { email, dev_code?, smtp_configured } → layar verifikasi
  deviceLimitInfo: null,// { code, message, devices } → modal batas device
  pendingCreds: null,   // { email, password } IN-MEMORY SAATJA (untuk retry setelah keluarkan device)
  googlePending: null,  // { state } → modal menunggu Google OAuth

  setAuth: (token, user, extras = {}) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({
      token, user,
      onboarding: extras.onboarding || { completed: false, current_step: 1 },
      devices: extras.devices || [],
      showAuthModal: false,
      pendingVerify: null,
      googlePending: null,
      deviceLimitInfo: null,
      pendingCreds: null,
    })
  },

  openAuthModal: () => set({ showAuthModal: true }),
  closeAuthModal: () => {
    // hanya boleh ditutup kalau sudah login
    if (!get().token) return
    set({ showAuthModal: false })
  },

  setPendingVerify: (info) => set({ pendingVerify: info, showAuthModal: false }),
  clearPendingVerify: () => set({ pendingVerify: null }),
  setDeviceLimit: (info) => set({ deviceLimitInfo: info }),
  clearDeviceLimit: () => set({ deviceLimitInfo: null }),

  // Register → selalu lanjut ke verifikasi email dulu
  register: async (name, email, password) => {
    set({ pendingCreds: { email, password } })
    const res = await api.post('/auth/register', { name, email, password })
    set({ pendingVerify: res.data, showAuthModal: false })
    return res.data
  },

  // Login → token (atau redirect ke verifikasi / device limit)
  login: async (email, password) => {
    set({ pendingCreds: { email, password } })
    const res = await api.post('/auth/login', { email, password })
    const d = res.data
    if (d.requires_verification) {
      set({ pendingVerify: d, showAuthModal: false })
      return d
    }
    get().setAuth(d.token, d.user, d)
    return d
  },

  // Verifikasi kode 6-digit → token
  verify: async (email, code) => {
    const res = await api.post('/auth/verify', { email, code })
    const d = res.data
    get().setAuth(d.token, d.user, d)
    return d
  },

  resend: async (email) => {
    const res = await api.post('/auth/resend', { email })
    if (res.data.dev_code) {
      set({ pendingVerify: { ...get().pendingVerify, dev_code: res.data.dev_code } })
    }
    return res.data
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } catch (e) { /* device mungkin sudah tidak terdaftar */ }
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({
      user: null, token: null, onboarding: { completed: false, current_step: 1 },
      devices: [], showAuthModal: true, booted: true,
      pendingCreds: null, pendingVerify: null, deviceLimitInfo: null,
    })
  },

  // Dipanggil sekali saat app dibuka — cek sesi tersimpan
  refresh: async () => {
    const token = get().token
    if (!token) {
      set({ booted: true, showAuthModal: true })
      return
    }
    try {
      const res = await api.get('/auth/me')
      const d = res.data
      set({
        user: d.user,
        onboarding: d.onboarding,
        devices: d.devices,
        googleConfigured: d.google_configured,
        smtpConfigured: d.smtp_configured,
        booted: true,
        showAuthModal: false,
      })
      // v3.1: status lisensi/trial dari /me → licenseStore (tanpa call kedua).
      // Trial habis & belum aktivasi → licenseStore membuka pop-up pembayaran.
      if (d.license) {
        import('./licenseStore').then((m) => m.default.getState().setStatusFromMe(d.license))
      }
    } catch (err) {
      const status = err.response?.status
      if (status === 401) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        set({ user: null, token: null, booted: true, showAuthModal: true })
      } else {
        // backend belum siap / jaringan — tetap coba pakai sesi lokal
        set({ booted: true })
      }
    }
  },

  setOnboarding: (onboarding) => set({ onboarding }),
  setDevices: (devices) => set({ devices }),
}))

export default useAuthStore
