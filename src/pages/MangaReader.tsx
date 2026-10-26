import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAsync } from '../api'
import { fetchManga } from '../api/manga'
import { chapterLabel, fallbackPage, fetchPages, findMangadex, langName, mergeChapters, preferredLang, saveProgress } from '../api/mangadex'
import { OWN_PREFIX, fetchOwnChapter, fetchOwnChapters } from '../api/mangaOwn'
import { usePageMeta } from '../data/pageMeta'
import './manga-reader.css'

const SAVER_KEY = 'anime.mangaSaver.v1'
const loadSaver = () => {
  try {
    return localStorage.getItem(SAVER_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Страница главы. Если картинка не загрузилась (сбой Worker или узла MangaDex@Home), берём её напрямую
 * с основного сервера MangaDex, а если и он не ответил, даём повторить вручную.
 */
function Page({ src, n }: { src: string; n: number }) {
  const [attempt, setAttempt] = useState(0)
  // У наших глав запасного сервера нет: сразу предлагаем повторить.
  const main = src.includes('/api/mangadex-img/') || src.includes('mangadex') ? fallbackPage(src) : src
  if (attempt > 1)
    return (
      <button type="button" className="reader__retry" onClick={() => setAttempt(0)}>
        Страница {n} не загрузилась. Нажмите, чтобы повторить
      </button>
    )
  return (
    <img
      src={attempt ? main : src}
      alt={`Страница ${n}`}
      loading={n <= 3 ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setAttempt(attempt + 1)}
    />
  )
}

/** Читалка: страницы главы лентой сверху вниз, переход по главам, язык из адреса (?lang=ru). */
export default function MangaReader() {
  const { id = '', chapter = '' } = useParams()
  const [params] = useSearchParams()
  const lang = params.get('lang') || preferredLang()
  const navigate = useNavigate()
  const [saver, setSaver] = useState(loadSaver)
  const [retry, setRetry] = useState(0)

  const manga = useAsync(() => fetchManga(id).catch(() => undefined), [id])
  const m = manga.value
  const chapters = useAsync(
    () =>
      m
        ? Promise.all([findMangadex(m.id, [m.originalTitle, m.english, m.title]).catch(() => null), fetchOwnChapters(m.id).catch(() => [])])
            .then(([t, own]) => mergeChapters(own, t?.id, lang))
            .catch(() => [])
        : Promise.resolve([]),
    [m?.id, lang],
  )
  // Страницы грузим сразу, не дожидаясь списка глав: id главы уже в адресе.
  // Наши главы (загруженные командами) хранятся в Appwrite: у них адреса страниц готовые.
  const pages = useAsync(
    () =>
      (chapter.startsWith(OWN_PREFIX)
        ? fetchOwnChapter(chapter.slice(OWN_PREFIX.length)).then((c) => c?.pageUrls ?? null)
        : fetchPages(chapter, saver)
      ).catch(() => null),
    [chapter, saver, retry],
  )

  const list = chapters.value ?? []
  const index = list.findIndex((c) => c.id === chapter)
  const current = index >= 0 ? list[index] : undefined
  const prev = index > 0 ? list[index - 1] : undefined
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : undefined
  const to = (c: { id: string }) => `/manga/${id}/chapter/${c.id}?lang=${lang}`

  usePageMeta(
    m && current ? `${m.title}: ${chapterLabel(current).toLowerCase()} читать онлайн` : 'Читать мангу',
    m ? `«${m.title}»: читать онлайн на Anime Life.` : '',
  )

  useEffect(() => window.scrollTo(0, 0), [chapter])
  useEffect(() => {
    if (current) saveProgress(id, { lang, chapterId: current.id, num: current.num, at: Date.now(), title: m?.title, image: m?.image })
  }, [id, lang, current, m])
  // Стрелки влево и вправо листают главы, как в других читалках.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'ArrowLeft' && prev) navigate(to(prev))
      if (e.key === 'ArrowRight' && next) navigate(to(next))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const nav = (
    <nav className="reader__nav" aria-label="Главы">
      {prev ? (
        <Link className="btn" to={to(prev)}>
          ← {chapterLabel(prev)}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link className="btn btn--accent" to={to(next)}>
          {chapterLabel(next)} →
        </Link>
      ) : (
        <Link className="btn" to={`/manga/${id}`}>
          К манге
        </Link>
      )}
    </nav>
  )

  return (
    <main className="reader">
      <div className="reader__bar">
        <Link to={`/manga/${id}`} className="reader__back">
          ← {m?.title ?? 'Манга'}
        </Link>
        {list.length > 0 && (
          <select className="reader__select" value={chapter} aria-label="Глава" onChange={(e) => navigate(to({ id: e.target.value }))}>
            {index < 0 && <option value={chapter}>Глава</option>}
            {list.map((c) => (
              <option key={c.id} value={c.id}>
                {chapterLabel(c)}
                {c.title && c.num ? `: ${c.title}` : ''}
              </option>
            ))}
          </select>
        )}
        <span className="muted reader__lang">{langName(lang)}</span>
        <label className="reader__saver">
          <input
            type="checkbox"
            checked={saver}
            onChange={(e) => {
              setSaver(e.target.checked)
              try {
                localStorage.setItem(SAVER_KEY, e.target.checked ? '1' : '0')
              } catch {
                // Без хранилища настройка просто не запомнится.
              }
            }}
          />
          Экономия трафика
        </label>
      </div>

      {current && (
        <p className="muted reader__credit">
          {current.title && current.num ? `${current.title} · ` : ''}
          Перевод: {current.group ?? 'неизвестная команда'} · {current.own ? 'загружено на Anime Life' : 'источник: MangaDex'}
        </p>
      )}

      <div className="reader__pages" aria-busy={pages.loading}>
        {pages.value === null && !pages.loading ? (
          <div className="reader__error">
            <p>Страницы главы не загрузились.</p>
            <button type="button" className="btn btn--accent" onClick={() => setRetry(retry + 1)}>
              Повторить
            </button>
          </div>
        ) : (
          (pages.value ?? []).map((src, i) => <Page key={src} src={src} n={i + 1} />)
        )}
      </div>

      {nav}
    </main>
  )
}
