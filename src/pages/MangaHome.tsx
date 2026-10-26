import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAsync } from '../api'
import { MANGA_PAGE_SIZE, mangasByIds, searchMangas, type MangaQuery } from '../api/manga'
import { allProgress, chapterLabel, latestChapter, readableIds } from '../api/mangadex'
import type { Anime } from '../data/catalog'
import { mangaProgressStore } from '../data/mangaProgress'
import PosterCard from '../components/PosterCard'
import { usePageMeta } from '../data/pageMeta'
import './manga.css'

const tabs = [
  // Всё, что можно прочитать на сайте по-русски (главы с MangaDex), самое читаемое первым.
  { id: 'ru', title: 'На русском', query: {} },
  { id: 'popular', title: 'Популярное', query: { order: 'popularity' } },
  { id: 'best', title: 'Лучшее', query: { order: 'ranked' } },
  { id: 'ongoing', title: 'Выходит', query: { order: 'popularity', status: 'ongoing' } },
] as const

const kinds = [
  { id: '', title: 'Всё' },
  { id: 'manga', title: 'Манга' },
  { id: 'manhwa', title: 'Манхва' },
  { id: 'manhua', title: 'Маньхуа' },
]

// Последние главы проверяем не чаще раза в 6 часов: каждый запрос к MangaDex идёт через наш Worker.
const LATEST_KEY = 'anime.mangaLatest.v1'
const LATEST_TTL = 6 * 3600_000

async function latestCached(md: string, lang: string): Promise<string | undefined> {
  const key = `${md}:${lang}`
  let all: Record<string, { num?: string; at: number }> = {}
  try {
    all = JSON.parse(localStorage.getItem(LATEST_KEY) ?? '{}')
  } catch {
    // Без хранилища просто спросим MangaDex.
  }
  if (all[key] && Date.now() - all[key].at < LATEST_TTL) return all[key].num
  const num = await latestChapter(md, lang)
  all[key] = { num, at: Date.now() }
  try {
    localStorage.setItem(LATEST_KEY, JSON.stringify(all))
  } catch {
    // Не запомнилось: в следующий раз проверим снова.
  }
  return num
}

/** Сколько новых глав вышло после той, на которой остановились; 0 — новых нет или номера не числа. */
const fresh = (num: string, latest?: string) => {
  const d = Math.floor(Number(latest) - Number(num))
  return Number.isFinite(d) && d > 0 ? d : 0
}

/** «Читаю»: манга, которую уже открывали в читалке, со ссылкой на место остановки и числом новых глав. */
function Reading() {
  // Подписка: место из аккаунта приходит после входа, полка обновляется сама.
  mangaProgressStore.use()
  const list = allProgress().slice(0, 12)
  const latest = useAsync(
    () =>
      Promise.all(list.map((p) => (p.md ? latestCached(p.md, p.lang).catch(() => undefined) : undefined))).then(
        (nums) => new Map(list.map((p, i) => [p.id, nums[i]])),
      ),
    [list.map((p) => p.id).join()],
  )
  if (!list.length) return null
  return (
    <section className="stack">
      <h2>Читаю</h2>
      <ul className="manga-reading">
        {list.map((p) => (
          <li key={p.id}>
            <Link to={`/manga/${p.id}/chapter/${p.chapterId}?lang=${p.lang}`}>
              <span className="manga-reading__img">{p.image && <img src={p.image} alt="" width={60} height={90} loading="lazy" decoding="async" />}</span>
              <span className="manga-reading__text">
                <b>{p.title ?? 'Манга'}</b>
                <span className="muted">
                  {chapterLabel({ num: p.num })}
                  {p.page ? `, стр. ${p.page}` : ''}
                </span>
                {fresh(p.num, latest.value?.get(p.id)) > 0 && (
                  <span className="manga-reading__new">Новых глав: {fresh(p.num, latest.value?.get(p.id))}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Одна страница списка: из Shikimori по запросу или, на вкладке «На русском», по списку MangaDex. */
async function loadPage(tab: string, query: MangaQuery): Promise<{ items: Anime[]; more: boolean }> {
  if (tab === 'ru' && !query.search) {
    const { ids, more } = await readableIds('ru', query.kind ?? '', query.page ?? 1)
    return { items: await mangasByIds(ids), more }
  }
  const items = await searchMangas(query)
  return { items, more: items.length === MANGA_PAGE_SIZE }
}

/** Раздел «Манга»: поиск, популярное, лучшее и выходящее, полка «Читаю». Читать можно прямо на сайте. */
export default function MangaHome() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const tabId = tabs.some((t) => t.id === params.get('tab')) ? (params.get('tab') as (typeof tabs)[number]['id']) : 'ru'
  const kind = kinds.some((k) => k.id === params.get('kind')) ? (params.get('kind') ?? '') : ''
  const tab = tabs.find((t) => t.id === tabId)!
  const [text, setText] = useState(q)
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<Anime[]>([])
  useEffect(() => setText(q), [q])
  useEffect(() => setPage(1), [q, tabId, kind])

  const query: MangaQuery = { ...tab.query, search: q || undefined, kind: kind || undefined, page }
  const result = useAsync(() => loadPage(tabId, query).catch(() => null), [q, tabId, kind, page])
  useEffect(() => {
    if (result.loading || !result.value) return
    const fresh = result.value.items
    setItems((prev) => (page === 1 ? fresh : [...prev, ...fresh.filter((a) => !prev.some((p) => p.id === a.id))]))
  }, [result])

  usePageMeta(
    q ? `Манга «${q}»: поиск` : 'Читать мангу онлайн',
    'Тысячи манг, манхв и маньхуа с главами на русском, поиск, популярное, лучшее и выходящее. Читайте прямо на Anime Life.',
  )

  function set(name: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    setParams(next, { replace: true })
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    set('q', text.trim())
  }

  const hasMore = !!result.value?.more
  return (
    <main className="container stack manga-home">
      <header className="stack">
        <h1 className="page-title">Манга</h1>
        <p className="muted">Манга, манхва и маньхуа. Главы на русском и других языках читаются прямо здесь: переводы команд с MangaDex и загруженные к нам.</p>
        <form className="manga-home__search" role="search" onSubmit={submit}>
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Название манги"
            aria-label="Название манги"
            enterKeyHint="search"
          />
          <button type="submit" className="btn btn--accent">
            Найти
          </button>
        </form>
      </header>

      {!q && <Reading />}

      <div className="stack">
        {q ? (
          <div className="chips">
            <span>Результаты по запросу «{q}»</span>
            <button type="button" className="pill" onClick={() => set('q', '')}>
              Сбросить
            </button>
          </div>
        ) : (
          <div className="chips" role="tablist" aria-label="Подборка">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={t.id === tabId}
                className={`pill${t.id === tabId ? ' active' : ''}`}
                onClick={() => set('tab', t.id === 'ru' ? '' : t.id)}
              >
                {t.title}
              </button>
            ))}
          </div>
        )}
        <div className="chips" role="group" aria-label="Вид">
          {kinds.map((k) => (
            <button key={k.id || 'all'} type="button" aria-pressed={k.id === kind} className={`pill${k.id === kind ? ' active' : ''}`} onClick={() => set('kind', k.id)}>
              {k.title}
            </button>
          ))}
        </div>
      </div>

      {result.value === null && !result.loading && page === 1 ? (
        <p className="muted">Список сейчас не загрузился. Попробуйте обновить страницу через минуту.</p>
      ) : !result.loading && items.length === 0 ? (
        <p className="muted">Ничего не нашлось. Попробуйте другое название или вид.</p>
      ) : (
        <div className="grid grid--posters" aria-busy={result.loading}>
          {items.map((a, i) => (
            <PosterCard key={a.id} anime={a} href={`/manga/${a.id.replace('manga-', '')}`} priority={i < 2} />
          ))}
        </div>
      )}
      {hasMore && (
        <button type="button" className="btn btn--ghost load-more" disabled={result.loading} onClick={() => setPage(page + 1)}>
          {result.loading ? 'Загружаем…' : 'Показать ещё'}
        </button>
      )}
      <p className="muted manga__credit">
        Данные о манге:{' '}
        <a href="https://shikimori.io/mangas" target="_blank" rel="noopener noreferrer">
          Shikimori
        </a>
        . Главы: команды переводчиков на Anime Life и{' '}
        <a href="https://mangadex.org" target="_blank" rel="noopener noreferrer">
          MangaDex
        </a>
        .
      </p>
    </main>
  )
}
