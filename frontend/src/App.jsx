import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from './stores/authStore'
import Login from './pages/Login'
import Register from './pages/Register'
import CariKerja from './pages/CariKerja'
import Persiapan from './pages/Persiapan'
import RiwayatLamaran from './pages/RiwayatLamaran'
import KumpulanPertanyaan from './pages/KumpulanPertanyaan'
import AI from './pages/AI'
import Layout from './components/Layout'

// App mode (single-user, tanpa JWT)
const APP_MODE = import.meta.env.VITE_APP_MODE === '1'

function PrivateRoute({ children }) {
  // App mode: always allow (no token needed)
  if (APP_MODE) return children
  const token = useAuthStore(s => s.token)
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  // App mode: skip /login dan /register route, langsung ke layout
  if (APP_MODE) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index              element={<Navigate to="/kerja" replace />} />
            <Route path="kerja"       element={<CariKerja />} />
            <Route path="ai"          element={<AI />} />
            <Route path="riwayat-lamaran" element={<RiwayatLamaran />} />
            <Route path="kumpulan-pertanyaan" element={<KumpulanPertanyaan />} />
            <Route path="persiapan"   element={<Persiapan />} />
            <Route path="cvs"         element={<Navigate to="/persiapan" replace />} />
            <Route path="settings"    element={<Navigate to="/persiapan" replace />} />
            <Route path="targets"     element={<Navigate to="/persiapan" replace />} />
            <Route path="dashboard"   element={<Navigate to="/kerja" replace />} />
            <Route path="session"     element={<Navigate to="/kerja" replace />} />
            <Route path="login"       element={<Navigate to="/" replace />} />
            <Route path="register"    element={<Navigate to="/" replace />} />
            <Route path="*"           element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    )
  }

  // Production mode (multi-user, JWT)
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index              element={<Navigate to="/kerja" replace />} />
          <Route path="kerja"       element={<CariKerja />} />
          <Route path="ai"          element={<AI />} />
          <Route path="riwayat-lamaran" element={<RiwayatLamaran />} />
          <Route path="kumpulan-pertanyaan" element={<KumpulanPertanyaan />} />
          <Route path="persiapan"   element={<Persiapan />} />
          <Route path="cvs"         element={<Navigate to="/persiapan" replace />} />
          <Route path="settings"    element={<Navigate to="/persiapan" replace />} />
          <Route path="targets"     element={<Navigate to="/persiapan" replace />} />
          <Route path="dashboard"   element={<Navigate to="/kerja" replace />} />
          <Route path="session"     element={<Navigate to="/kerja" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
