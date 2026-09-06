import axios from 'axios'

// App mode (single-user, tanpa JWT). Di-set saat build frontend untuk .app bundle.
// Di dev (Vite), default = false (multi-user mode seperti aslinya).
const APP_MODE = import.meta.env.VITE_APP_MODE === '1'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
})

api.interceptors.request.use((config) => {
  if (APP_MODE) {
    // App mode: tidak perlu Authorization header. Backend auto-return user_id=1.
    return config
  }
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (APP_MODE) {
      // App mode: jangan pernah redirect ke /login
      return Promise.reject(err)
    }
    const isAuthRequest = err.config?.url?.startsWith('/auth/')
    if (err.response?.status === 401 && !isAuthRequest) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
