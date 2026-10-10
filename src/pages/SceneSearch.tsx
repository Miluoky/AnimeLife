import './top.css'
import './social.css'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { usePageMeta } from '../data/pageMeta'
import { SearchIcon } from '../components/Icons'

/**
 * Поиск аниме по кадру через trace.moe: бесплатный API, без ключа (лимит — несколько поисков в минуту с адреса).
 * Скриншот можно загрузить, вставить из буфера (Ctrl+V) или дать ссылку на картинку.
 * В ответе id AniList и MyAnimeList; id MAL совпадает с id Shikimori, поэтому сразу ведём на свою страницу.
 */
const API = 'https://api.trace.moe/search?anilistInfo&cutBorders'

interface Hit {
  anilist: { id: number; idMal?: number; title: { native?: string; romaji?: string; english?: string }; isAdult?: boolean }
  episode?: number | string | null
  from: number
  similarity: number
  video: string
  image: string
}

const two = (n: number) => String(Math.floor(n)).padStart(2, '0')
const stamp = (s: number) => `${Math.floor(s / 60)}:${two(s % 60)}`

export default function SceneSearch() {
  usePageMeta('Найти аниме по кадру', 'Загрузите скриншот, и Anime Life найдёт аниме, серию и момент. Работает на trace.moe.')
  const [preview, setPreview] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const search = async (body: Blob | string) => {
    setBusy(true)
    setError('')
    setHits(null)
    try {
      const res =
        typeof body === 'string'
          ? await fetch(`${API}&url=${encodeURIComponent(body)}`)
          : await fetch(API, { method: 'POST', body, headers: { 'Content-Type': body.type || 'image/jpeg' } })
      const json = (await res.json().catch(() => ({}))) as { result?: Hit[]; error?: string }
      if (res.status === 402 || res.status === 429) throw new Error('Слишком много поисков подряд. Подождите минуту и попробуйте снова.')
      if (!res.ok || json.error) throw new Error(json.error || 'Не получилось найти. Попробуйте другой кадр.')
      setHits((json.result ?? []).filter((h) => !h.anilist.isAdult).slice(0, 5))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось найти.')
    } finally {
      setBusy(false)
    }
  }

  const pick = (f?: File | null) => {
    if (!f || !f.type.startsWith('image/')) return
    if (f.size > 25 * 1024 * 1024) return setError('Картинка больше 25 МБ.')
    setPreview(URL.createObjectURL(f))
    void search(f)
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => pick([...(e.clipboardData?.files ?? [])][0])
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const byUrl = (e: FormEvent) => {
    e.preventDefault()
    if (!/^https?:\/\//.test(url)) return setError('Нужна ссылка на картинку, начинается с https://')
    setPreview(url)
    void search(url)
  }

  return (
    <main className="container top-page social-page">
      <header className="top-head">
        <span className="top-head__icon" aria-hidden="true">
          <SearchIcon />
        </span>
        <div>
          <h1 className="page-title">Найти аниме по кадру</h1>
          <p className="muted top-head__lead">Скриншот из серии, мем или гифка: покажем, что это за аниме, какая серия и минута.</p>
        </div>
      </header>
      <label
        className="scene-drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          pick(e.dataTransfer.files[0])
        }}
      >
        {preview ? <img src={preview} alt="Ваш кадр" /> : <span>Перетащите картинку сюда, нажмите, чтобы выбрать файл, или вставьте из буфера (Ctrl+V)</span>}
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => pick(e.currentTarget.files?.[0])} />
      </label>
      <form className="s-row" onSubmit={byUrl}>
        <input className="scene-url" type="url" value={url} onChange={(e) => setUrl(e.currentTarget.value)} placeholder="или ссылка на картинку" />
        <button type="submit" className="btn btn--ghost" disabled={busy}>
          Найти
        </button>
      </form>
      {busy && <p className="muted" aria-busy="true">Ищем по миллионам кадров…</p>}
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      {hits && !hits.length && <div className="s-empty">Ничего похожего. Попробуйте кадр без надписей и рамок.</div>}
      {hits && hits.length > 0 && (
        <ul className="scene-hits">
          {hits.map((h, i) => {
            const id = h.anilist.idMal
            const ep = Number(h.episode) || 1
            const t = Math.floor(h.from)
            const name = h.anilist.title.romaji || h.anilist.title.english || h.anilist.title.native
            return (
              <li key={i} className="scene-hit">
                <video src={`${h.video}&size=m`} poster={h.image} muted loop autoPlay playsInline />
                <div className="stack" style={{ gap: 6 }}>
                  <b>{name}</b>
                  {h.anilist.title.native && <span className="muted">{h.anilist.title.native}</span>}
                  <span className="muted">
                    {h.episode ? `Серия ${h.episode}, ` : ''}
                    {stamp(t)} · совпадение {Math.round(h.similarity * 100)}%
                  </span>
                  {id ? (
                    <span className="s-row">
                      <Link to={`/watch/${id}/${ep}?t=${t}`} className="btn btn--accent btn--small">
                        Смотреть с этого места
                      </Link>
                      <Link to={`/anime/${id}`} className="btn btn--ghost btn--small">
                        О тайтле
                      </Link>
                    </span>
                  ) : (
                    <Link to={`/catalog?q=${encodeURIComponent(name ?? '')}`} className="link-accent">
                      Найти в каталоге
                    </Link>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="muted s-note">
        Поиск работает на <a href="https://trace.moe" target="_blank" rel="noopener noreferrer" className="link-accent">trace.moe</a>. Картинка уходит туда только для поиска.
      </p>
    </main>
  )
}
