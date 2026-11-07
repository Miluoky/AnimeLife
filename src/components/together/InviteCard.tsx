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

  const copyText = async (value: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast(ok)
    } catch {
      toast('Не удалось скопировать — выделите вручную')
    }
  }
  const copyLink = () => void copyText(link, 'Ссылка скопирована')
  const copyCode = () => void copyText(code, 'Код скопирован')
  const share = () =>
    navigator.share?.({ title: `Смотрим вместе: ${title}`, url: link, text: `Заходи смотреть «${title}». Код: ${code}` }).catch(() => undefined) ??
    copyLink()
  const shareTelegram = () => {
    const text = `Смотрим вместе «${title}»\nКод: ${code}\n${link}`
    window.open(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }
  const shareVk = () => {
    window.open(`https://vk.com/share.php?url=${encodeURIComponent(link)}&title=${encodeURIComponent(`Смотрим вместе: ${title}`)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="invite together-invite">
      {qr && <div className="invite__qr" aria-label="QR-код ссылки на комнату" role="img" dangerouslySetInnerHTML={{ __html: qr }} />}
      <div className="stack invite__body">
        <span className="muted">Код комнаты</span>
        <div className="invite__code-row">
          <strong className="invite__code">{code}</strong>
          <button type="button" className="btn btn--ghost btn--small" onClick={copyCode}>
            Код
          </button>
        </div>
        <input className="invite__link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Ссылка на комнату" />
        <div className="actions invite__actions">
          <button type="button" className="btn btn--accent" onClick={share}>
            <ShareIcon />
            Позвать друга
          </button>
          <button type="button" className="btn btn--ghost" onClick={copyLink}>
            Ссылка
          </button>
        </div>
        <div className="invite__social" role="group" aria-label="Поделиться в соцсетях">
          <button type="button" className="btn btn--ghost btn--small invite__social-btn invite__social-btn--tg" onClick={shareTelegram}>
            Telegram
          </button>
          <button type="button" className="btn btn--ghost btn--small invite__social-btn invite__social-btn--vk" onClick={shareVk}>
            ВКонтакте
          </button>
        </div>
      </div>
    </div>
  )
}
