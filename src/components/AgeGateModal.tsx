import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const STORAGE_KEY = 'animelife.age_verified'

export function isAgeVerified(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export default function AgeGateModal({ onVerified }: { onVerified?: () => void }) {
  const [verified, setVerified] = useState(() => isAgeVerified())
  const navigate = useNavigate()

  useEffect(() => {
    if (verified) onVerified?.()
  }, [verified, onVerified])

  if (verified) return null

  const handleConfirm = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Игнорируем ошибки хранилища
    }
    setVerified(true)
    onVerified?.()
  }

  const handleDecline = () => {
    navigate('/')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        backgroundColor: 'rgba(5, 6, 10, 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <div
        className="frame-corners"
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          padding: '32px 28px',
          boxShadow: 'var(--glass-shadow), 0 0 32px color-mix(in srgb, var(--accent) 25%, transparent)',
          textAlign: 'center',
          animation: 'fade-scale 0.25s var(--ease)',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
            color: 'var(--accent)',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '16px',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
          Раздел 18+
        </span>

        <h2 id="age-gate-title" style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 12px', color: 'var(--text)' }}>
          Подтверждение возраста
        </h2>

        <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--muted)', margin: '0 0 28px' }}>
          Этот раздел содержит откровенные материалы и предназначен исключительно для совершеннолетних пользователей. Вам уже исполнилось 18 лет?
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn--accent"
            onClick={handleConfirm}
            style={{ flex: 1, padding: '12px 18px', fontSize: '15px', fontWeight: 600 }}
          >
            Да, мне есть 18
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleDecline}
            style={{ flex: 1, padding: '12px 18px', fontSize: '15px' }}
          >
            Назад
          </button>
        </div>
      </div>
    </div>
  )
}
