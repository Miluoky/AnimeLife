import { useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAsync } from '../api'
import { fetchManga } from '../api/manga'
import { chapterLabel, fallbackPage, fetchPages, findMangadex, langName, mergeChapters, preferredLang, readProgress, saveProgress } from '../api/mangadex'
import { OWN_PREFIX, fetchOwnChapter, fetchOwnChapters } from '../api/mangaOwn'
import { usePageMeta } from '../data/pageMeta'
import './manga-reader.css'

const SAVER_KEY = 'anime.mangaSaver.v1'
// Как читать: лентой сверху вниз или по одной странице; по страницам — слева направо или справа налево, как в японской манге.
const VIEW_KEY = 'anime.mangaView.v1'
interface View {
  paged: boolean
  rtl: boolean
}
const loadView = (): View => {
  try {
    return { paged: false, rtl: false, ...(JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') as Partial<View>) }
  } catch {
    return { paged: false, rtl: false }
  }
}
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
function Page({ src, n, eager }: { src: string; n: number; eager?: boolean }) {
  const [attempt, setAttempt] = useState(0)
  // У наших глав запасного сервера нет: сразу предлагаем повторить.
  const main = src.includes('/api/mangadex-img/') || src.includes('mangadex') ? fallbackPage(src) : src
  if (attempt > 1)
    return (
      <button type="button" className="reader__retry" data-n={n} onClick={() => setAttempt(0)}>
        Страница {n} не загрузилась. Нажмите, чтобы повторить
      </button>
    )
  return (
    <img
      src={attempt ? main : src}
      alt={`Страница ${n}`}
      data-n={n}
      loading={eager || n <= 3 ? 'eager' : 'lazy'}
      // Пока картинка не пришла, у неё высота почти в экран: ленивая загрузка не тянет всю главу сразу.
      onLoad={(e) => e.currentTarget.classList.add('is-loaded')}
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
  const [view, setView] = useState(loadView)
  // Номер страницы с нуля; равен числу страниц — значит, глава дочитана (в постраничном режиме карточка «Дальше»).
  const [at, setAt] = useState(0)
  // Быстрые нажатия подряд приходят раньше перерисовки: текущую страницу берём отсюда, а не из замыкания.
  const atRef = useRef(at)
  atRef.current = at
  const restore = useRef(0)
  const touch = useRef<number>()
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

  const urls = pages.value ?? []
  const total = urls.length

  // Вернулись в ту же главу («Продолжить», полка «Читаю»): открываем страницу, на которой остановились.
  useEffect(() => {
    window.scrollTo(0, 0)
    const saved = readProgress(id)
    restore.current = saved?.chapterId === chapter && saved.page ? saved.page - 1 : 0
    setAt(restore.current)
  }, [chapter])
  useEffect(() => {
    if (!total || pages.loading || view.paged || !restore.current) return
    const n = restore.current + 1
    restore.current = 0
    requestAnimationFrame(() => document.querySelector(`.reader__pages [data-n="${n}"]`)?.scrollIntoView())
  }, [total, pages.loading, view.paged, chapter])
  // В ленте текущая страница та, что пересекает середину экрана.
  useEffect(() => {
    if (view.paged || !total || typeof IntersectionObserver !== 'function') return
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setAt(Number((e.target as HTMLElement).dataset.n) - 1)
      },
      { rootMargin: '-50% 0px -50% 0px' },
    )
    document.querySelectorAll('.reader__pages [data-n]').forEach((el) => seen.observe(el))
    return () => seen.disconnect()
  }, [view.paged, total, chapter])
  useEffect(() => {
    if (current)
      saveProgress(id, {
        lang,
        chapterId: current.id,
        num: current.num,
        at: Date.now(),
        title: m?.title,
        image: m?.image,
        page: Math.min(at, Math.max(total - 1, 0)) + 1,
      })
  }, [id, lang, current, m, at, total])
  // Следующие две страницы грузим заранее, чтобы листание было мгновенным.
  useEffect(() => {
    if (!view.paged) return
    for (const src of urls.slice(at + 1, at + 3)) new Image().src = src
  }, [view.paged, at, urls])

  function changeView(next: View) {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(next))
    } catch {
      // Без хранилища режим просто не запомнится.
    }
    if (!next.paged) restore.current = at
  }
  /** Листаем на страницу вперёд (1) или назад (-1); за краем главы — соседняя глава. */
  function turn(step: 1 | -1) {
    const n = atRef.current + step
    if (n < 0) {
      if (prev) navigate(to(prev))
      return
    }
    if (n > total) {
      if (next) navigate(to(next))
      return
    }
    atRef.current = n
    setAt(n)
    // Новая страница встаёт сразу под панелью читалки.
    document.querySelector('.reader__paged')?.scrollIntoView({ block: 'start' })
  }
  // Справа налево: левая сторона страницы ведёт вперёд, как в японской книжке.
  const forwardSide = (left: boolean) => (left === view.rtl ? 1 : -1)
  const onTap = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('a, button')) return
    const box = e.currentTarget.getBoundingClientRect()
    turn(forwardSide(e.clientX - box.left < box.width / 2))
  }
  const onTouchStart = (e: TouchEvent) => (touch.current = e.touches[0]?.clientX)
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current
    touch.current = undefined
    const dx = start === undefined ? 0 : (e.changedTouches[0]?.clientX ?? start) - start
    // Свайп влево — как нажать на правую половину страницы.
    if (Math.abs(dx) > 50) turn(forwardSide(dx > 0))
  }

  // Стрелки влево и вправо: в ленте листают главы, по страницам — страницы (с учётом направления).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.altKey || e.ctrlKey || e.metaKey) return
      if (view.paged && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        turn(forwardSide(e.key === 'ArrowLeft'))
        return
      }
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
        <div className="chips reader__view" role="group" aria-label="Как читать">
          <button type="button" className={`pill${view.paged ? '' : ' active'}`} aria-pressed={!view.paged} onClick={() => changeView({ ...view, paged: false })}>
            Лента
          </button>
          <button type="button" className={`pill${view.paged ? ' active' : ''}`} aria-pressed={view.paged} onClick={() => changeView({ ...view, paged: true })}>
            По страницам
          </button>
          {view.paged && (
            <button type="button" className={`pill${view.rtl ? ' active' : ''}`} aria-pressed={view.rtl} onClick={() => changeView({ ...view, rtl: !view.rtl })}>
              Справа налево
            </button>
          )}
        </div>
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
        ) : view.paged && total ? (
          <div className="reader__paged" onClick={onTap} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {at < total ? (
              <Page key={urls[at]} src={urls[at]} n={at + 1} eager />
            ) : (
              <div className="reader__end">
                <p>Глава дочитана.</p>
                {next ? (
                  <Link className="btn btn--accent" to={to(next)}>
                    {chapterLabel(next)} →
                  </Link>
                ) : (
                  <Link className="btn btn--accent" to={`/manga/${id}`}>
                    К манге
                  </Link>
                )}
              </div>
            )}
            <span className="reader__count" aria-live="polite">
              {Math.min(at + 1, total)} / {total}
            </span>
          </div>
        ) : (
          urls.map((src, i) => <Page key={src} src={src} n={i + 1} />)
        )}
      </div>

      {nav}
    </main>
  )
}
