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
    <>
      <style>{`
        .age-gate {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom))
            max(16px, env(safe-area-inset-left));
          background: rgb(5 6 10 / 0.9);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-sizing: border-box;
        }
        .age-gate__panel {
          width: 100%;
          max-width: 460px;
          max-height: min(calc(100dvh - max(32px, env(safe-area-inset-top) + env(safe-area-inset-bottom))), calc(100svh - 32px));
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          box-sizing: border-box;
          margin: 0;
          padding: max(28px, calc(20px + env(safe-area-inset-top) * 0.35)) max(24px, env(safe-area-inset-right)) max(28px, env(safe-area-inset-bottom))
            max(24px, env(safe-area-inset-left));
          border-radius: 8px;
          border: 1px solid var(--line);
          background: var(--surface);
          text-align: left;
          box-shadow: 0 12px 40px rgb(0 0 0 / 0.35);
          animation: fade-scale 0.25s var(--ease);
        }
        .age-gate__badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 14px;
          padding: 5px 11px;
          border-radius: var(--radius-full);
          background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
          border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--line));
          color: var(--accent);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .age-gate__dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--accent);
          flex-shrink: 0;
        }
        .age-gate__title {
          margin: 0 0 12px;
          font-size: clamp(1.15rem, 2.8vw, 1.4rem);
          font-weight: 700;
          line-height: 1.25;
          color: var(--text);
          letter-spacing: -0.02em;
        }
        .age-gate__text {
          margin: 0 0 24px;
          font-size: 15px;
          line-height: 1.55;
          color: var(--muted);
        }
        .age-gate__actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .age-gate__actions .btn {
          width: 100%;
          justify-content: center;
          min-height: 52px;
          box-sizing: border-box;
        }
        .age-gate__actions .btn--ghost {
          order: 2;
          font-weight: 600;
        }
        .age-gate__actions .btn--accent {
          order: 1;
        }
        @media (min-width: 480px) {
          .age-gate__panel {
            padding: 32px 28px;
            text-align: center;
          }
          .age-gate__actions {
            flex-direction: row;
            flex-wrap: wrap;
            gap: 12px;
            justify-content: center;
          }
          .age-gate__actions .btn {
            width: auto;
            flex: 1 1 160px;
            min-width: 0;
          }
          .age-gate__actions .btn--accent {
            flex: 1 1 200px;
            order: unset;
          }
          .age-gate__actions .btn--ghost {
            order: unset;
          }
        }
      `}</style>
      <div className="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
        <div className="age-gate__panel frame-corners">
          <p className="age-gate__badge">
            <span className="age-gate__dot" aria-hidden />
            Раздел 18+
          </p>

          <h2 id="age-gate-title" className="age-gate__title">
            Подтверждение возраста
          </h2>

          <p className="age-gate__text">
            Этот раздел содержит откровенные материалы и предназначен исключительно для совершеннолетних пользователей. Вам уже исполнилось 18 лет?
          </p>

          <div className="age-gate__actions">
            <button type="button" className="btn btn--accent" onClick={handleConfirm}>
              Да, мне есть 18
            </button>
            <button type="button" className="btn btn--ghost" onClick={handleDecline}>
              Назад
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
