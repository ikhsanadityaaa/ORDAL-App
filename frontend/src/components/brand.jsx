// ─────────────────────────────────────────────────────────────────────────────
// Brand components — logo ORDAL + logo job platform ASLI (sesuai permintaan:
// logo job platform harus sama dengan logo aslinya)
// ─────────────────────────────────────────────────────────────────────────────

// Logo lockup ORDAL — sama dengan di web:
// kotak oranye rounded dengan border charcoal + hard shadow + huruf "O" putih,
// diikuti wordmark "ORDAL" extrabold tracking-tight.
export function OrdalLogo({ size = 36, wordmark = true, dark = false, className = '', style = {} }) {
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 12, ...style }}>
      <div
        style={{
          width: size,
          height: size,
          background: '#F2661A',
          borderRadius: Math.round(size * 0.28),
          border: '2px solid #33363F',
          boxShadow: '2.5px 2.5px 0 #33363F',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        }}
        className="ordal-logo-box"
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'rotate(-8deg) scale(1.08)' }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'rotate(0deg) scale(1)' }}
      >
        <span style={{
          color: '#FFFFFF',
          fontWeight: 900,
          fontSize: Math.round(size * 0.52),
          lineHeight: 1,
          letterSpacing: '-0.04em',
        }}>O</span>
      </div>
      {wordmark && (
        <div style={{ lineHeight: 1 }}>
          <div style={{
            fontSize: Math.round(size * 0.55),
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: dark ? '#F4F2EC' : '#33363F',
          }}>ORDAL</div>
        </div>
      )}
    </div>
  )
}

// Logo ORDAL versi ring (persis file logo.svg web) — untuk favicon/eksen besar
export function OrdalRingLogo({ size = 48, className = '', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      <rect width="64" height="64" rx="14" fill="#F2661A" />
      <circle cx="32" cy="32" r="14.5" fill="none" stroke="#FFFFFF" strokeWidth="13" />
    </svg>
  )
}

// ── Logo platform ASLI ───────────────────────────────────────────────────────

export function LinkedInLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" fill="#0A66C2"/>
    </svg>
  )
}

export function JobStreetLogo({ size = 28 }) {
  // Logo JobStreet asli: lingkaran biru tua dengan panah putih dari titik-titik
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="128" cy="128" r="128" fill="#0D3880"/>
      <g fill="white">
        <circle cx="70" cy="90" r="4"/>
        <circle cx="95" cy="90" r="6"/>
        <circle cx="125" cy="90" r="8"/>
        <circle cx="160" cy="90" r="10"/>
        <circle cx="200" cy="90" r="12"/>
        <circle cx="70" cy="115" r="5"/>
        <circle cx="98" cy="115" r="7"/>
        <circle cx="130" cy="115" r="9"/>
        <circle cx="167" cy="115" r="11"/>
        <circle cx="208" cy="115" r="13"/>
        <circle cx="70" cy="140" r="6"/>
        <circle cx="100" cy="140" r="8"/>
        <circle cx="135" cy="140" r="10"/>
        <circle cx="175" cy="140" r="12"/>
        <circle cx="215" cy="140" r="14"/>
        <circle cx="75" cy="165" r="5"/>
        <circle cx="103" cy="165" r="7"/>
        <circle cx="135" cy="165" r="9"/>
        <circle cx="172" cy="165" r="11"/>
        <circle cx="213" cy="165" r="13"/>
        <circle cx="80" cy="190" r="4"/>
        <circle cx="105" cy="190" r="6"/>
        <circle cx="135" cy="190" r="8"/>
        <circle cx="170" cy="190" r="10"/>
        <circle cx="208" cy="190" r="12"/>
      </g>
    </svg>
  )
}

export function PlatformLogo({ platformId, size = 28 }) {
  if (platformId === 'linkedin' || platformId === 'linkedin_jobs' || platformId === 'linkedin_posts') {
    return <LinkedInLogo size={size} />
  }
  if (platformId === 'jobstreet') return <JobStreetLogo size={size} />
  return null
}

// Logo Google RESMI — huruf "G" 4 warna sesuai brand guideline Google
// (bukan lagi ikon Chrome lucide). Warna: merah #EA4335, biru #4285F4,
// kuning #FBBC05, hijau #34A853.
export function GoogleGlyph({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Google">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

// ── Logo metode pembayaran ───────────────────────────────────────────────────

// Logo BCA — identitas resmi: biru BCA #0057A6, bagian bawah lebih gelap
// (khas simbol BCA), wordmark "BCA" putih tebal.
export function BCALogo({ size = 28, withWordmark = true }) {
  const h = size
  const w = withWordmark ? size * 2.1 : size
  return (
    <svg width={w} height={h} viewBox="0 0 120 56" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bank BCA">
      <rect x="0" y="0" width="56" height="56" rx="11" fill="#0057A6" />
      {/* bagian bawah lebih gelap — khas simbol BCA */}
      <path d="M0 38 Q14 30 28 36 T56 34 V45 a11 11 0 0 1 -11 11 H11 A11 11 0 0 1 0 45 Z" fill="#003D79" />
      <text x="28" y="33" textAnchor="middle" fill="#FFFFFF" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="19" letterSpacing="-0.5">BCA</text>
      {withWordmark && (
        <text x="66" y="36" fill="#0057A6" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="24" letterSpacing="-0.5">BCA</text>
      )}
    </svg>
  )
}

// Logo PayPal — monogram dua "P" resmi: P belakang biru muda #009CDE,
// P depan biru tua #003087, wordmark dua warna.
export function PayPalLogo({ size = 28, withWordmark = true }) {
  const h = size
  const w = withWordmark ? size * 3.05 : size
  return (
    <svg width={w} height={h} viewBox="0 0 150 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PayPal">
      {/* P belakang (muda, offset kanan) */}
      <path fill="#009CDE" transform="translate(6.5,0) scale(1.92)" d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.595 5.69 1.81 1.01 1.101 1.304 2.266 1.012 3.908-.422 2.376-2.393 4.856-4.825 5.482-1.23.32-2.592.422-3.826.422h-.554c-.62 0-1.15.447-1.256 1.058l-.29 1.83-.863 5.432a.641.641 0 0 1-.633.544z" />
      {/* P depan (tua) */}
      <path fill="#003087" transform="scale(1.92)" d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.595 5.69 1.81 1.01 1.101 1.304 2.266 1.012 3.908-.422 2.376-2.393 4.856-4.825 5.482-1.23.32-2.592.422-3.826.422h-.554c-.62 0-1.15.447-1.256 1.058l-.29 1.83-.863 5.432a.641.641 0 0 1-.633.544z" />
      {withWordmark && (
        <g fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="27" letterSpacing="-0.8">
          <text x="58" y="32" fill="#003087">Pay</text>
          <text x="103" y="32" fill="#009CDE">Pal</text>
        </g>
      )}
    </svg>
  )
}

// Logo QRIS — badge putih border charcoal dengan wordmark "QRIS" hitam
// (identitas QRIS nasional) + ikon scan di kiri.
export function QRISMark({ size = 30 }) {
  const h = size * 0.62
  return (
    <svg width={h * 2.6} height={h} viewBox="0 0 130 50" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QRIS">
      <rect x="0" y="0" width="130" height="50" rx="10" fill="#FFFFFF" stroke="#33363F" strokeWidth="3" />
      {/* ikon scan */}
      <g fill="none" stroke="#33363F" strokeWidth="3.4" strokeLinecap="round">
        <path d="M16 16 v-4 a4 4 0 0 1 4-4 h4" />
        <path d="M16 34 v4 a4 4 0 0 0 4 4 h4" />
        <path d="M40 16 v-4 a4 4 0 0 1 4-4 h4" transform="translate(6,0)" opacity="0" />
        <path d="M40 38 v4 a4 4 0 0 0 4 4 h4" opacity="0" />
        <line x1="14" y1="25" x2="46" y2="25" />
      </g>
      <g fill="#33363F">
        <rect x="24" y="21" width="4" height="8" rx="1" />
        <rect x="32" y="21" width="4" height="8" rx="1" />
      </g>
      <text x="58" y="33" fill="#33363F" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="24" letterSpacing="0.5">QRIS</text>
    </svg>
  )
}

// Spin badge — badge teks melingkar berputar (khas web)
export function SpinBadge({ size = 84, text = 'ORDAL • AUTO APPLY • ' }) {
  const id = 'spin-path-' + Math.round(size)
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div className="animate-spin-slow" style={{ position: 'absolute', inset: 0 }}>
        <svg width={size} height={size} viewBox="0 0 100 100">
          <defs>
            <path id={id} d="M 50,50 m -38,0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0" />
          </defs>
          <text style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.22em', fill: '#33363F' }}>
            <textPath href={`#${id}`}>{text}</textPath>
          </text>
        </svg>
      </div>
      <div style={{
        position: 'absolute',
        inset: '26%',
        background: '#F2661A',
        border: '2px solid #33363F',
        borderRadius: '50%',
        boxShadow: '3px 3px 0 #33363F',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <svg width="38%" height="38%" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <polyline points="19 12 12 19 5 12"/>
        </svg>
      </div>
    </div>
  )
}
