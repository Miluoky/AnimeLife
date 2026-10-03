import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import Turnstile, { captchaEnabled } from './Turnstile'
import { FORM_LIMITS } from '../data/legal'

type Kind = 'takedown' | 'contact'

const TEXT: Record<Kind, { name: string; message: string; send: string; done: string }> = {
  takedown: {
    name: 'Имя или название организации',
    message: 'Описание: на какое произведение у вас права и чем это подтверждается',
    send: 'Отправить жалобу',
    done: 'Жалоба отправлена. Мы рассмотрим её в течение 3 рабочих дней и ответим на',
  },
  contact: {
    name: 'Имя',
    message: 'Сообщение',
    send: 'Отправить',
    done: 'Сообщение отправлено. Мы ответим на',
  },
}

/**
 * Форма обращения: жалоба правообладателя или обратная связь. Отправляется в функцию community
 * (действие takedown-create), вход не нужен. SDK Appwrite подгружается только при отправке.
 */
export default function ContactForm({ kind }: { kind: Kind }) {
  const t = TEXT[kind]
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [links, setLinks] = useState('')
  const [message, setMessage] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [website, setWebsite] = useState('')
  const [captcha, setCaptcha] = useState<string>()
  const [captchaKey, setCaptchaKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState('')

  const min = FORM_LIMITS.messageMin[kind]
  const ready =
    name.trim().length >= 2 &&
    email.includes('@') &&
    message.trim().length >= min &&
    (kind === 'contact' || (confirm && links.trim().length > 0)) &&
    (!captchaEnabled || !!captcha)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError('')
    try {
      const { sendTakedown } = await import('../data/takedowns')
      await sendTakedown({ kind, name, email, links, message, confirm, captcha, website })
      setSentTo(email.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось отправить. Попробуйте ещё раз.')
      // Токен капчи одноразовый: после ошибки нужен новый.
      setCaptcha(undefined)
      setCaptchaKey((k) => k + 1)
    }
    setBusy(false)
  }

  if (sentTo) {
    return (
      <div className="stack legal-form">
        <p className="notice notice--ok" role="status">
          {t.done} {sentTo}.
        </p>
        <Link to="/" className="btn btn--ghost">
          На главную
        </Link>
      </div>
    )
  }

  return (
    <form className="stack legal-form" onSubmit={submit} aria-label={t.send}>
      <label className="field">
        {t.name}
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={FORM_LIMITS.name} required autoComplete="name" />
      </label>
      <label className="field">
        Электронная почта для ответа
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={FORM_LIMITS.email}
          required
          autoComplete="email"
        />
      </label>
      <label className="field">
        {kind === 'takedown' ? 'Ссылки на страницы animelife.top, по одной в строке' : 'Ссылка на страницу, если вопрос о ней'}
        <textarea
          className={kind === 'contact' ? 'legal-form__short' : undefined}
          value={links}
          onChange={(e) => setLinks(e.target.value)}
          maxLength={FORM_LIMITS.links}
          required={kind === 'takedown'}
          placeholder="https://animelife.top/anime/…"
        />
      </label>
      <label className="field">
        {t.message}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={FORM_LIMITS.message}
          minLength={min}
          required
        />
      </label>
      {/* Ловушка для ботов: человек это поле не видит и не заполняет. */}
      <label className="legal-form__trap" aria-hidden="true">
        Сайт
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>
      {kind === 'takedown' && (
        <label className="legal-form__check">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} required />
          Подтверждаю, что являюсь правообладателем или его представителем, а сведения в жалобе достоверны
        </label>
      )}
      <Turnstile key={captchaKey} onToken={setCaptcha} />
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      <div className="review-form__row">
        <button type="submit" className="btn btn--accent" disabled={!ready || busy}>
          {busy ? 'Отправляем…' : t.send}
        </button>
      </div>
      <p className="muted legal-form__note">
        Отправляя форму, вы соглашаетесь с <Link to="/privacy">политикой конфиденциальности</Link>.
      </p>
    </form>
  )
}
