import { useEffect, useState, useRef } from 'react'
import { toast } from '../data/toast'
import { playerTime } from '../data/playerTime'
import { CloseIcon } from './Icons'

export interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  animeId: string
  episode: number
  currentTime?: number
}

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0')
export const formatTimestamp = (s: number): string =>
  s >= 3600
    ? `${Math.floor(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`
    : `${Math.floor(s / 60)}:${pad(s % 60)}`

function TelegramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z" />
    </svg>
  )
}

function VkIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.684 0H8.316C3.723 0 0 3.723 0 8.316v7.368C0 20.277 3.723 24 8.316 24h7.368C20.277 24 24 20.277 24 15.684V8.316C24 3.723 20.277 0 15.684 0zm4.568 17.204h-1.921c-.727 0-.95-.578-2.257-1.892-1.144-1.118-1.65-1.26-1.93-1.26-.39 0-.503.112-.503.65v1.815c0 .466-.149.687-1.378.687-2.029 0-4.28-1.233-5.867-3.523-2.385-3.376-3.037-5.918-3.037-6.44 0-.233.093-.448.55-.448h1.922c.493 0 .68.224.87.747.95 2.775 2.544 5.206 3.206 5.206.252 0 .363-.112.363-.73V10.74c-.075-1.309-.765-1.42-.765-1.884 0-.215.178-.43.467-.43h2.902c.41 0 .56.215.56.692v3.714c0 .393.177.533.29.533.232 0 .428-.14.867-.588 1.343-1.503 2.3-3.79 2.3-3.79.13-.27.355-.476.84-.476h1.921c.58 0 .709.29.58.708-.242.858-1.97 3.76-2.074 3.966-.205.373-.28.541 0 .914.195.27.84.821 1.268 1.325 1.54 1.774 1.83 2.455 1.886 2.651.056.186-.14.28-.466.28z" />
    </svg>
  )
}

function CopyIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

/**
 * Модальное окно социального шеринга серии и момента с QR-кодом для мобильных.
 */
export default function ShareModal({
  isOpen,
  onClose,
  title,
  animeId,
  episode,
  currentTime,
}: ShareModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const currentSec = Math.floor(currentTime ?? playerTime() ?? 0)
  const [includeTimestamp, setIncludeTimestamp] = useState(currentSec > 0)
  const [qrSvg, setQrSvg] = useState<string>()
  const [qrLoading, setQrLoading] = useState(false)

  // Обновляем состояние чекбокса при открытии с новым временем
  useEffect(() => {
    if (isOpen) {
      setIncludeTimestamp(currentSec > 0)
    }
  }, [isOpen, currentSec])

  // Закрытие по Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  // Формирование ссылки и текста
  const hasValidTime = currentSec > 0
  const effectiveSec = includeTimestamp && hasValidTime ? currentSec : 0
  const baseWatchUrl = `${location.origin}${import.meta.env.BASE_URL}watch/${animeId}/${episode}`
  const shareUrl = effectiveSec > 0 ? `${baseWatchUrl}?t=${effectiveSec}` : baseWatchUrl

  const timeLabel = effectiveSec > 0 ? `, с ${formatTimestamp(effectiveSec)}` : ''
  const shareText = `Смотрю «${title}», ${episode} серия${timeLabel} на AnimeLife`

  // Генерация QR-кода через динамический импорт
  useEffect(() => {
    if (!isOpen) return
    let alive = true
    setQrLoading(true)
    import('qrcode-generator')
      .then(({ default: qrcode }) => {
        if (!alive) return
        const q = qrcode(0, 'M')
        q.addData(shareUrl)
        q.make()
        setQrSvg(q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }))
        setQrLoading(false)
      })
      .catch(() => {
        if (alive) setQrLoading(false)
      })
    return () => {
      alive = false
    }
  }, [isOpen, shareUrl])

  if (!isOpen) return null

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast(effectiveSec > 0 ? `Ссылка с моментом ${formatTimestamp(effectiveSec)} скопирована` : 'Ссылка на серию скопирована')
    } catch {
      toast('Не удалось скопировать ссылку')
    }
  }

  const shareTelegram = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const shareVk = () => {
    const url = `https://vk.com/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareText)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" style={{ zIndex: 110 }} />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        className="share-modal"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 120,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--glass-shadow)',
          width: 'min(460px, calc(100vw - 32px))',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          color: 'var(--text)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 id="share-modal-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
              Поделиться серией
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--text-soft)' }}>
              «{title}», серия {episode}
            </p>
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            aria-label="Закрыть"
            style={{ padding: '8px', minWidth: '40px', minHeight: '40px', borderRadius: 'var(--radius-full)' }}
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {hasValidTime && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              background: 'var(--surface-2)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: '0.9rem',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={includeTimestamp}
              onChange={(e) => setIncludeTimestamp(e.currentTarget.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }}
            />
            <span>
              Ссылка на точный момент: <strong style={{ color: 'var(--accent)' }}>{formatTimestamp(currentSec)}</strong>
            </span>
          </label>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button
            type="button"
            onClick={shareTelegram}
            className="btn"
            style={{
              background: '#2AABEE',
              color: '#fff',
              border: 'none',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <TelegramIcon size={20} />
            Telegram
          </button>
          <button
            type="button"
            onClick={shareVk}
            className="btn"
            style={{
              background: '#0077FF',
              color: '#fff',
              border: 'none',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <VkIcon size={20} />
            ВКонтакте
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '14px',
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--line)',
          }}
        >
          <div
            style={{
              width: '84px',
              height: '84px',
              background: '#fff',
              borderRadius: 'var(--radius-sm)',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {qrLoading ? (
              <span style={{ fontSize: '10px', color: '#666' }}>Код...</span>
            ) : qrSvg ? (
              <div
                style={{ width: '100%', height: '100%', display: 'flex' }}
                aria-label="QR-код для продолжения просмотра на мобильном"
                role="img"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : null}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Продолжить на смартфоне</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-soft)', lineHeight: 1.3 }}>
              Наведите камеру смартфона на QR-код для мгновенного перехода к просмотру.
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Ссылка для шеринга"
            style={{
              flex: 1,
              background: 'var(--bg)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              color: 'var(--text-soft)',
              fontSize: '0.85rem',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
          />
          <button
            type="button"
            className="btn btn--accent"
            onClick={copyLink}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              whiteSpace: 'nowrap',
              fontWeight: 600,
            }}
          >
            <CopyIcon size={18} />
            Копировать
          </button>
        </div>
      </div>
    </>
  )
}
