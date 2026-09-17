import axios from 'axios'

// v3: App selalu multi-user — login wajib sebelum pakai app.
// Opaque session token diterbitkan ORDAL-Web dan terikat ke device.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthRequest = err.config?.url?.startsWith('/auth/')
    const detail = err.response?.data?.detail

    // Batas 2 device tercapai → biarkan komponen auth yang handle (bukan hard redirect)
    if (err.response?.status === 403 && detail?.code === 'DEVICE_LIMIT') {
      return Promise.reject(err)
    }

    // v3.1: Trial habis & belum aktivasi → komponen lisensi yang handle
    // (pop-up pembayaran) — bukan hard redirect
    if (err.response?.status === 403 && detail?.code === 'TRIAL_EXPIRED') {
      window.dispatchEvent(new CustomEvent('ordal:trial-expired'))
      return Promise.reject(err)
    }

    if (err.response?.status === 401 && !isAuthRequest) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      // Trigger event supaya authStore membuka popup login lagi
      window.dispatchEvent(new CustomEvent('ordal:session-expired'))
    }
    return Promise.reject(err)
  }
)

export default api
