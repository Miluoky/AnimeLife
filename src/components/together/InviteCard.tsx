import { useEffect, useState } from 'react'
import { toast } from '../../data/toast'
import { ShareIcon } from '../Icons'

/** Приглашение в комнату: код крупно, ссылка, кнопка «Поделиться» и QR-код для телефона. */
export default function InviteCard({ code, title }: { code: string; title: string }) {
  const link = `${location.origin}${import.meta.env.BASE_URL}together/${code}`
  const [qr, setQr] = useState<string>()

  useEffect(() => {
    let alive = true
    // Генератор QR нужен только здесь: грузим его отдельной маленькой частью.
    void import('qrcode-generator').then(({ default: qrcode }) => {
      const q = qrcode(0, 'M')
      q.addData(link)
      q.make()
      if (alive) setQr(q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }))
    })
    return () => {
      alive = false
    }
  }, [link])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast('Ссылка скопирована')
    } catch {
      toast('Не удалось скопировать, выделите ссылку вручную')
    }
  }
  const share = () =>
    navigator.share?.({ title: `Смотрим вместе: ${title}`, url: link }).catch(() => undefined) ?? copy()

  return (
    <div className="invite">
      {qr && <div className="invite__qr" aria-label="QR-код ссылки на комнату" role="img" dangerouslySetInnerHTML={{ __html: qr }} />}
      <div className="stack" style={{ gap: 8 }}>
        <span className="muted">Код комнаты</span>
        <strong className="invite__code">{code}</strong>
        <input className="invite__link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Ссылка на комнату" />
        <div className="actions">
          <button type="button" className="btn btn--accent" onClick={share}>
            <ShareIcon />
            Позвать друга
          </button>
          <button type="button" className="btn btn--ghost" onClick={copy}>
            Скопировать
          </button>
        </div>
      </div>
    </div>
  )
}
