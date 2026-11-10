import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAsync } from '../api'
import { fetchManga } from '../api/manga'
import { LANGS } from '../api/mangadex'
import { forget, OWN_MANGA_ENABLED, OWN_PREFIX } from '../api/mangaOwn'
import { useAuth } from '../data/auth'
import { CONTACT_EMAIL } from '../data/legal'
import { usePageMeta } from '../data/pageMeta'
import './manga-reader.css'

const TEAM_KEY = 'anime.mangaTeam.v1'
const MAX_PAGES = 300
const MAX_MB = 15
const UPLOAD_LANGS = ['ru', 'uk', 'en']

const loadTeam = () => {
  try {
    return localStorage.getItem(TEAM_KEY) ?? ''
  } catch {
    return ''
  }
}

const byName = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

/**
 * Загрузка главы командой переводчиков.
 * Core: R2 + D1 через /api/core/manga*.
 * Загружать могут аккаунты с меткой translator или admin.
 */
export default function MangaUpload() {
  const { id = '' } = useParams()
  const { user, checking } = useAuth()
  const manga = useAsync(() => fetchManga(id).catch(() => undefined), [id])
  const m = manga.value
  usePageMeta(m ? `Загрузить главу: ${m.title}` : 'Загрузить главу', '')

  const [lang, setLang] = useState('ru')
  const [num, setNum] = useState('')
  const [title, setTitle] = useState('')
  const [team, setTeam] = useState(loadTeam)
  const [files, setFiles] = useState<File[]>([])
  const [progress, setProgress] = useState<string>()
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<string>()

  const allowed = !!user?.labels?.some((l) => l === 'translator' || l === 'admin')

  if (checking) return <main className="container empty-page" aria-busy="true" />
  if (!OWN_MANGA_ENABLED)
    return (
      <main className="container empty-page stack">
        <h1>Загрузка глав временно недоступна</h1>
        <p>Свои главы на сайте отложены: для хранилища страниц нужна карта вне РФ (Cloudflare R2). Читать мангу с MangaDex можно как обычно.</p>
        <p>
          <Link to={`/manga/${id}`}>← К манге</Link>
        </p>
      </main>
    )
  if (!allowed)
    return (
      <main className="container empty-page stack">
        <h1>Главы от команд переводчиков</h1>
        <p>
          Anime Life принимает переводы манги от команд: главы читаются прямо на сайте, с названием вашей команды на каждой
          странице, без рекламы поверх страниц.
        </p>
        <p>
          Чтобы включить загрузку, {user ? 'напишите' : <><Link to="/account">войдите в аккаунт</Link> и напишите</>} на{' '}
          <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Загрузка глав манги на Anime Life')}`}>{CONTACT_EMAIL}</a>: название команды,
          ссылку на её страницу или канал{user ? <> и номер вашего аккаунта <code>{user.$id}</code></> : ''}.
        </p>
        <p className="muted">Выкладывайте только свои переводы. Главы снимаются по запросу правообладателя.</p>
        <p>
          <Link to={`/manga/${id}`}>← К манге</Link>
        </p>
      </main>
    )

  const submitCore = async (n: string) => {
    const keys: string[] = []
    try {
      for (const [i, file] of files.entries()) {
        setProgress(`Загружаем страницу ${i + 1} из ${files.length}…`)
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/core/manga/page', { method: 'POST', credentials: 'include', body: form })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error((j as { message?: string }).message || `Core ${res.status}`)
        }
        const { key } = (await res.json()) as { key: string }
        keys.push(key)
      }
      setProgress('Сохраняем главу…')
      const res = await fetch('/api/core/manga/chapters', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mangaId: id,
          lang,
          num: n,
          title: title.trim() || null,
          team: team.trim(),
          pages: keys,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { message?: string }).message || `Core ${res.status}`)
      }
      const data = (await res.json()) as { chapter: { id: string } }
      forget(id)
      setDone(`/manga/${id}/chapter/${OWN_PREFIX}${data.chapter.id}?lang=${lang}`)
      setNum('')
      setTitle('')
      setFiles([])
    } catch (e) {
      await Promise.all(
        keys.map((key) =>
          fetch(`/api/core/manga/page/${encodeURIComponent(key)}`, { method: 'DELETE', credentials: 'include' }).catch(
            () => undefined,
          ),
        ),
      )
      throw e
    }
  }

  const submit = async () => {
    setError(undefined)
    setDone(undefined)
    const n = num.trim().replace(',', '.')
    if (!/^\d{1,5}(\.\d{1,2})?$/.test(n)) return setError('Номер главы: число, например 12 или 12.5.')
    if (!team.trim()) return setError('Укажите название команды.')
    if (!files.length) return setError('Выберите картинки страниц.')
    if (files.length > MAX_PAGES) return setError(`Не больше ${MAX_PAGES} страниц в главе.`)
    const big = files.find((f) => f.size > MAX_MB * 1024 * 1024)
    if (big) return setError(`Файл ${big.name} больше ${MAX_MB} МБ.`)
    try {
      localStorage.setItem(TEAM_KEY, team.trim())
    } catch {
      /* */
    }
    try {
      await submitCore(n)
    } catch (e) {
      setError(`Не получилось загрузить: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setProgress(undefined)
    }
  }

  return (
    <main className="container upload stack">
      <p>
        <Link to={`/manga/${id}`}>← {m?.title ?? 'К манге'}</Link>
      </p>
      <h1 className="page-title">Загрузить главу</h1>
      <form
        className="upload__form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!progress) void submit()
        }}
      >
        <label>
          Язык перевода
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            {UPLOAD_LANGS.map((l) => (
              <option key={l} value={l}>
                {LANGS[l]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Номер главы
          <input inputMode="decimal" required value={num} onChange={(e) => setNum(e.target.value)} placeholder="12" />
        </label>
        <label>
          Название главы (необязательно)
          <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Команда
          <input required value={team} maxLength={100} onChange={(e) => setTeam(e.target.value)} />
        </label>
        <label>
          Страницы (JPG, PNG, WEBP; порядок по имени файла)
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={(e) => setFiles([...(e.target.files ?? [])].sort(byName))} />
        </label>
        {files.length > 0 && (
          <p className="muted">
            {files.length} стр.: {files[0].name} … {files[files.length - 1].name}
          </p>
        )}
        {error && <p className="upload__error">{error}</p>}
        {done && (
          <p>
            Глава загружена. <Link to={done}>Открыть в читалке</Link>
          </p>
        )}
        <button type="submit" className="btn btn--accent" disabled={!!progress}>
          {progress ?? 'Загрузить'}
        </button>
      </form>
    </main>
  )
}
