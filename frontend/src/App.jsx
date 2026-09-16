import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from './stores/authStore'
import useLicenseStore from './stores/licenseStore'
import CariKerja from './pages/CariKerja'
import Persiapan from './pages/Persiapan'
import RiwayatLamaran from './pages/RiwayatLamaran'
import KumpulanPertanyaan from './pages/KumpulanPertanyaan'
import AI from './pages/AI'
import Layout from './components/Layout'
import WelcomeScreen from './components/WelcomeScreen'
import AuthModal from './components/auth/AuthModal'
import VerifyEmailModal from './components/auth/VerifyEmailModal'
import DeviceLimitModal from './components/auth/DeviceLimitModal'
import OnboardingWizard from './components/onboarding/OnboardingWizard'
import PaymentModal from './components/license/PaymentModal'
import TrialToast from './components/license/TrialToast'

// ─────────────────────────────────────────────────────────────────────────────
// App v3.1 — wajib login (APP_MODE dihapus):
//   1. App dibuka → popup login (Gmail / email+password) di atas WelcomeScreen
//   2. Email wajib diverifikasi (kode 6 digit)
//   3. Onboarding wizard (CV → preferensi → cover letter → platform → login)
//   4. Masuk aplikasi utama
//   5. v3.1: Trial 3 hari mulai saat klik "Cari Kerja" pertama kali.
//      Trial habis & belum aktivasi → pop-up pembayaran FORCED
//      (QRIS BCA / PayPal → kode aktivasi) — status dicek berkala dari server,
//      jadi install ulang app TIDAK mereset trial.
// ─────────────────────────────────────────────────────────────────────────────

function App() {
  const { token, booted, onboarding, refresh } = useAuthStore()
  const license = useLicenseStore()
  const licenseStatus = useLicenseStore((s) => s.status)

  // Cek sesi tersimpan saat app dibuka (+ listen event session expired)
  useEffect(() => {
    refresh()
    const onExpired = () => {
      useAuthStore.setState({
        user: null, token: null, showAuthModal: true,
        onboarding: { completed: false, current_step: 1 },
      })
    }
    window.addEventListener('ordal:session-expired', onExpired)
    return () => window.removeEventListener('ordal:session-expired', onExpired)
  }, [])

  // v3.1 — license: poll status tiap 60 dtk + listen event 403 TRIAL_EXPIRED.
  // Trial habis → licenseStore otomatis membuka pop-up pembayaran (forced).
  useEffect(() => {
    if (!token || !onboarding.completed) return
    license.refresh()
    const iv = setInterval(() => license.refresh(), 60_000)
    const onTrialExpired = () => license.handleTrialExpiredEvent()
    window.addEventListener('ordal:trial-expired', onTrialExpired)
    return () => {
      clearInterval(iv)
      window.removeEventListener('ordal:trial-expired', onTrialExpired)
    }
  }, [token, onboarding.completed])

  // Belum selesai cek sesi → layar kosong cream
  if (!booted) {
    return <div style={{ height: '100vh', background: '#F4F2EC' }} />
  }

  // Belum login → WelcomeScreen + popup login + verifikasi email + batas device
  if (!token) {
    return (
      <>
        <WelcomeScreen />
        <AuthModal />
        <VerifyEmailModal />
        <DeviceLimitModal />
      </>
    )
  }

  // Onboarding belum selesai → wizard interaktif di atas WelcomeScreen
  if (!onboarding.completed) {
    return (
      <>
        <WelcomeScreen />
        <OnboardingWizard />
      </>
    )
  }

  // Aplikasi utama (+ pop-up pembayaran / toast trial)
  return (
    <>
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
            <Route path="login"       element={<Navigate to="/kerja" replace />} />
            <Route path="register"    element={<Navigate to="/kerja" replace />} />
            <Route path="*"           element={<Navigate to="/kerja" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <PaymentModal />
      <TrialToast />
    </>
  )
}

export default App
