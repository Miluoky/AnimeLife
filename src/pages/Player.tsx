import { Link, useNavigate, useParams } from 'react-router-dom'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { loadAnime, useAsync } from '../api'
import { episodeCount } from '../data/catalog'
import { saveProgress } from '../data/history'
import { getEntry, setWatched, useMyList } from '../data/myList'
import NotFound from './NotFound'
import WatchTogetherButton from '../components/together/WatchTogetherButton'
import VideoPlayer, { type Provider } from '../components/VideoPlayer'
import { isBalancerAvailable } from '../api/balancers'
import { fetchKodikTranslations } from '../api/kodik'
import { findRelease } from '../api/anilibria'
import { findAnimeVost } from '../api/animevost'
import { anixartEpisodes, findAnixart, type AnixartRelease } from '../api/anixart'
import { markFlag } from '../data/flags'
import { createLocalStore } from '../data/localStore'
import { usePageMeta } from '../data/pageMeta'
import { ageLabel, animeInfo, watchPageDescription, watchPageTitle } from '../data/seo'
import { BackIcon, SearchIcon, SkipIcon } from '../components/Icons'

// «Пропускать филлеры»: кнопка и автопереход ведут сразу к следующей сюжетной серии.
const skipFillersStore = createLocalStore('anime.skipfillers.v1', false)

// Комментарии тянут SDK Appwrite: грузим их отдельно, плеер появляется сразу.
const EpisodeComments = lazy(() => import('../components/EpisodeComments'))
const NextPart = lazy(() => import('../components/NextPart'))

export default function Player() {
  const { id = '', episode = '1' } = useParams()
  const navigate = useNavigate()
  const result = useAsync(() => loadAnime(id), [id])
  const anime = result.value?.data
  // Названия серий приходят от AniLibria, когда плеер нашёл релиз.
  const [names, setNames] = useState<Record<number, string>>({})
  // Другой тайтл — серии прошлого релиза не в счёт.
  useEffect(() => setNames({}), [id])
  const list = useMyList()
  const seen = (anime && list.find((e) => e.anime.id === anime.id)?.watched) || 0

  const total = anime ? episodeCount(anime) : 1
  const kodik = useAsync(() => fetchKodikTranslations(id).catch(() => []), [id])
  // Где есть серии из бесплатных источников. Ответы запоминаются, плеер потом берёт их же без новых запросов.
  const free = useAsync(async () => {
    if (!anime) return undefined
    const q = { title: anime.title, originalTitle: anime.originalTitle, englishTitle: anime.englishTitle, year: anime.year }
    const [al, av, ax] = await Promise.all([
      findRelease(anime.id, [anime.title, anime.originalTitle, anime.englishTitle]).catch(() => undefined),
      findAnimeVost(anime.id, q).catch(() => null),
      findAnixart(anime.id, q).catch(() => null),
    ])
    return { aniLibria: al === null ? 0 : al?.episodes.length, animeVost: av?.length ?? 0, anixart: ax }
  }, [anime?.id])
  const voices = useMemo(
    () => buildVoices(kodik.value ?? [], Object.keys(names).length || free.value?.aniLibria, free.value?.animeVost ?? 0, free.value?.anixart ?? null),
    [kodik.value, names, free.value],
  )
  // Филлеры размечены в Anixart: берём их из самой популярной озвучки, у всех студий номера одни.
  const axRelease = free.value?.anixart
  const fillers = useAsync(
    () => (axRelease?.voices.length ? anixartEpisodes(axRelease.id, axRelease.voices[0].type).then((e) => e.fillers).catch(() => undefined) : Promise.resolve(undefined)),
    [axRelease?.id],
  )
  const skipFillers = skipFillersStore.use()
  const [voiceKey, setVoiceKey] = useState(savedVoice)
  const voice = voices.find((v) => v.key === voiceKey) ?? voices[0]
  const chooseVoice = (key: string) => {
    saveVoice(key)
    setVoiceKey(key)
  }
  const current = Math.min(Math.max(1, Number(episode) || 1), total)

  useEffect(() => {
    if (!anime) return
    saveProgress(anime, current, total)
    // Открыли серию N: предыдущие считаем просмотренными, если тайтл в списке.
    const entry = getEntry(anime.id)
    if (entry && (entry.watched ?? 0) < current - 1) setWatched(anime.id, current - 1)
    const hour = new Date().getHours()
    if (hour < 5) markFlag('nightOwl')
  }, [anime, current, total])

  usePageMeta(
    anime && watchPageTitle(animeInfo(anime), current),
    anime && watchPageDescription(animeInfo(anime), current, total),
  )

  if (result.loading && !result.value) return <main className="container empty-page" aria-busy="true" />
  if (!anime) return <NotFound title="Тайтл не найден" />

  const goTo = (n: number) => navigate(`/watch/${anime.id}/${n}`)
  // Вперёд на одну серию с включённым пропуском — через все филлеры подряд.
  const goNext = () => {
    let n = current + 1
    while (skipFillers && fillers.value?.has(n) && n < total) n++
    goTo(n)
  }
  const name = names[current]

  return (
    <main className="container player-page">
      {/* Мульти-провайдерный плеер; если серию взять негде — трейлер */}
      {/* Пока не знаем озвучки Kodik, плеер не включаем: иначе он начнёт с одной озвучки и тут же сменит её. */}
      {kodik.loading || free.loading || !free.value ? (
        <div className="video-player">
          <div className="player-frame" aria-busy="true" />
        </div>
      ) : (
      <VideoPlayer
        title={anime.title}
        originalTitle={anime.originalTitle}
        englishTitle={anime.englishTitle}
        year={anime.year}
        shikimoriId={anime.id}
        episode={current}
        totalEpisodes={total}
        onEpisodeChange={(n) => (n === current + 1 ? goNext() : goTo(n))}
        onEpisodes={(eps) => setNames(Object.fromEntries(eps.map((e) => [e.ordinal, e.name ?? ''])))}
        trailerUrl={anime.trailerUrl}
        provider={voice?.provider}
        available={[...new Set(voices.map((v) => v.provider))]}
        kodikLink={voice?.kodikLink}
        anixart={voice?.anixart}
        onProviderChange={(p) => {
          const next = voices.find((v) => v.provider === p)
          if (next) chooseVoice(next.key)
        }}
      />
      )}

      <div className="watch-side">
        {voices.length > 0 && <VoicePicker voices={voices} current={voice?.key} onChoose={chooseVoice} />}
        <EpisodePicker
          animeId={anime.id}
          total={total}
          current={current}
          seen={seen}
          names={voice?.provider === 'anilibria' ? names : {}}
          provider="AniLibria"
          fillers={fillers.value}
        />
      </div>

      <div className="watch-head">
        <div className="watch-head__info">
          {/* Название тайтла входит в заголовок: «Ван-Пис, серия 5» ищут именно так. */}
          <h1>
            <Link to={`/anime/${anime.id}`} className="muted watch-head__title">
              {anime.title}
            </Link>{' '}
            Серия {current}
          </h1>
          {ageLabel(anime.rating) && (
            <span className="chip chip--age watch-head__age" title="Возрастное ограничение">
              {ageLabel(anime.rating)}
            </span>
          )}
          {name && <p className="watch-head__name">{name}</p>}
        </div>
        <div className="watch-actions">
          <WatchTogetherButton anime={anime} episode={current} />
          <button
            type="button"
            className="btn btn--ghost"
            disabled={current <= 1}
            aria-label="Предыдущая серия"
            onClick={() => goTo(current - 1)}
          >
            <BackIcon size={18} />
            <span className="watch-prev__text">Предыдущая</span>
          </button>
          <button type="button" className="btn btn--accent" disabled={current >= total} onClick={goNext}>
            Следующая серия
            <SkipIcon />
          </button>
        </div>
      </div>

      <Suspense fallback={null}>
        {current >= total && !anime.ongoing && !anime.upcoming && <NextPart animeId={anime.id} />}
        <EpisodeComments animeId={anime.id} episode={current} />
      </Suspense>
    </main>
  )
}

const RANGE = 100

/**
 * Номера серий полосой (на телефоне листается вбок, на компьютере — сетка сбоку).
 * Текущая подсвечена, просмотренные по «Моему списку» отмечены точкой. У длинных сериалов — по сотне.
 */
function EpisodePicker({
  animeId,
  total,
  current,
  seen,
  names,
  provider,
  fillers,
}: {
  animeId: string
  total: number
  current: number
  seen: number
  /** Серии, которые нашлись у источника (номер → название). Пусто — источник ещё не ответил. */
  names: Record<number, string>
  provider: string
  /** серии не по сюжету манги: их можно пропустить */
  fillers?: Set<number>
}) {
  const [range, setRange] = useState(Math.floor((current - 1) / RANGE))
  const skip = skipFillersStore.use()
  const [query, setQuery] = useState('')
  const strip = useRef<HTMLDivElement>(null)
  const ranges = Math.ceil(total / RANGE)
  const from = range * RANGE + 1
  const to = Math.min(total, from + RANGE - 1)
  // Источник озвучил не всё: остальные номера приглушены, чтобы не казалось, что есть все серии.
  const voiced = Object.keys(names).length
  const missing = (n: number) => voiced > 0 && !(n in names)
  // Поиск по номеру или названию серии ищет по всем сериям, а не только в открытом диапазоне.
  const q = query.trim().toLowerCase()
  const shown = q
    ? Array.from({ length: total }, (_, i) => i + 1).filter((n) => String(n).startsWith(q) || names[n]?.toLowerCase().includes(q))
    : Array.from({ length: to - from + 1 }, (_, i) => from + i)

  // Текущая серия сразу на виду: прокручиваем только саму полосу, не страницу.
  useEffect(() => {
    const box = strip.current
    const chip = box?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!box || !chip) return
    box.scrollTo({
      left: chip.offsetLeft - box.clientWidth / 2 + chip.offsetWidth / 2,
      top: chip.offsetTop - box.clientHeight / 2,
    })
  }, [current, range])

  return (
    <aside className="episodes">
      <div className="episodes__head">
        <h2>Серии</h2>
        <span className="muted">{total}</span>
      </div>
      {voiced > 0 && voiced < total && (
        <p className="ep-voiced muted">
          В озвучке {provider}: {voiced} из {total}. Приглушённых серий у источника нет.
        </p>
      )}
      {total > 12 && (
        <label className="side-search">
          <SearchIcon size={16} />
          <span className="sr-only">Найти серию</span>
          <input
            type="search"
            inputMode={voiced ? 'text' : 'numeric'}
            placeholder={voiced ? 'Номер или название' : 'Номер серии'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      {ranges > 1 && !q && (
        <div className="ep-ranges" role="group" aria-label="Диапазон серий">
          {Array.from({ length: ranges }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`pill${i === range ? ' active' : ''}`}
              aria-pressed={i === range}
              onClick={() => setRange(i)}
            >
              {i * RANGE + 1}–{Math.min(total, (i + 1) * RANGE)}
            </button>
          ))}
        </div>
      )}
      <nav className="ep-strip" ref={strip} aria-label="Серии">
        {shown.length === 0 && <span className="muted side-empty">Такой серии нет</span>}
        {shown.map((n) => (
          <Link
            key={n}
            to={`/watch/${animeId}/${n}`}
            className={`ep-chip${n <= seen && n !== current ? ' ep-chip--seen' : ''}${missing(n) ? ' ep-chip--missing' : ''}${fillers?.has(n) ? ' ep-chip--filler' : ''}`}
            aria-current={n === current ? 'page' : undefined}
            aria-label={`Серия ${n}${names[n] ? `: ${names[n]}` : ''}${fillers?.has(n) ? ', филлер' : ''}${n <= seen ? ', просмотрена' : ''}${missing(n) ? `, нет в озвучке ${provider}` : ''}`}
            title={[names[n], fillers?.has(n) && 'Филлер: не по сюжету манги'].filter(Boolean).join(' · ') || undefined}
          >
            {n}
          </Link>
        ))}
      </nav>
      {!!fillers?.size && (
        <p className="ep-legend muted">
          <span className="ep-legend__mark" aria-hidden="true" /> Филлеры: {fillers.size} из {total}, не по сюжету манги, их можно пропустить.
          {fillers.has(current) && <strong className="ep-legend__now"> Эта серия филлер.</strong>}
        </p>
      )}
      {!!fillers?.size && (
        <label className="ep-skip">
          <input type="checkbox" checked={skip} onChange={(e) => skipFillersStore.set(e.target.checked)} />
          Пропускать филлеры: «Следующая серия» ведёт к сюжетной
        </label>
      )}
      {names[current] && (
        <p className="ep-name">
          {current}. {names[current]}
        </p>
      )}
    </aside>
  )
}

/* ─── Озвучки: список сбоку, как выбор студии в кинотеатрах ─── */

interface Voice {
  key: string
  provider: Provider
  title: string
  kind: 'voice' | 'subtitles'
  /** сколько серий в этой озвучке; неизвестно, пока источник не ответил */
  episodes?: number
  kodikLink?: string
  anixart?: { release: number; type: number; title: string }
  icon?: string
}

const VOICE_KEY = 'player-voice'

function savedVoice() {
  try {
    return sessionStorage.getItem(VOICE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

function saveVoice(key: string) {
  try {
    sessionStorage.setItem(VOICE_KEY, key)
  } catch {
    // Без хранилища на следующей серии будет озвучка по умолчанию.
  }
}

/**
 * Все озвучки тайтла из подключённых источников: Kodik (если есть токен), Alloha, AniLibria, AnimeVost, Anixart.
 * AniLibria без релиза (0 серий) убираем, если есть другой бесплатный источник: тогда он и включается первым.
 * Студии AniLibria и AnimeVost из Anixart не дублируем: свои плееры у них лучше (качество, пропуск опенинга).
 */
function buildVoices(
  kodik: Awaited<ReturnType<typeof fetchKodikTranslations>>,
  aniLibriaEpisodes: number | undefined,
  animeVostEpisodes: number,
  anixart: AnixartRelease | null,
): Voice[] {
  const list: Voice[] = [...kodik]
    .sort((a, b) => b.episodes - a.episodes)
    .map((t) => ({ key: `kodik:${t.id}`, provider: 'kodik', title: t.title, kind: t.kind, episodes: t.episodes, kodikLink: t.link }))
  if (isBalancerAvailable('alloha')) list.push({ key: 'alloha', provider: 'alloha', title: 'Alloha', kind: 'voice' })
  const others = animeVostEpisodes > 0 || !!anixart?.voices.length
  const aniLibria: Voice = { key: 'anilibria', provider: 'anilibria', title: 'AniLibria', kind: 'voice', episodes: aniLibriaEpisodes || undefined }
  // AniLibria первой, только если релиз точно нашёлся; не ответила — ставим её в конец, чтобы не включился трейлер.
  if (aniLibriaEpisodes || !others) list.push(aniLibria)
  if (animeVostEpisodes) list.push({ key: 'animevost', provider: 'animevost', title: 'AnimeVost', kind: 'voice', episodes: animeVostEpisodes })
  const own = new Set(list.map((v) => v.title.toLowerCase()))
  for (const v of anixart?.voices ?? []) {
    if (own.has(v.title.toLowerCase())) continue
    list.push({
      key: `anixart:${v.type}`,
      provider: 'anixart',
      title: v.title,
      kind: v.kind,
      episodes: v.episodes,
      icon: v.icon,
      anixart: { release: anixart!.id, type: v.type, title: v.title },
    })
  }
  if (aniLibriaEpisodes === undefined && others && !list.some((v) => v.title === 'AniLibria')) list.push(aniLibria)
  return list
}

/** Логотип студии, а если его нет или он не загрузился — первая буква названия. */
function VoiceMark({ title, icon }: { title: string; icon?: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="voice__mark" aria-hidden="true">
      {icon && !broken ? (
        <img src={icon} alt="" width={36} height={36} loading="lazy" decoding="async" onError={() => setBroken(true)} />
      ) : (
        title.slice(0, 1).toUpperCase()
      )}
    </span>
  )
}

type VoiceSort = 'episodes' | 'title'

function VoicePicker({ voices, current, onChoose }: { voices: Voice[]; current?: string; onChoose: (key: string) => void }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<VoiceSort>('episodes')
  const q = query.trim().toLowerCase()
  const shown = voices
    .filter((v) => !q || v.title.toLowerCase().includes(q))
    .sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title, 'ru') : (b.episodes ?? 0) - (a.episodes ?? 0)))

  return (
    <section className="voices" aria-labelledby="voices-title">
      <div className="episodes__head">
        <div>
          <div className="voices__eyebrow">Озвучка</div>
          <h2 id="voices-title">Выберите студию</h2>
        </div>
        <span className="voices__count">{voices.length}</span>
      </div>
      {voices.length > 4 && (
        <>
          <label className="side-search">
            <SearchIcon size={16} />
            <span className="sr-only">Найти озвучку</span>
            <input type="search" placeholder="Поиск студии" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="voices__sort" role="group" aria-label="Порядок">
            {(
              [
                ['episodes', 'Больше серий'],
                ['title', 'По названию'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={`pill${sort === id ? ' active' : ''}`} aria-pressed={sort === id} onClick={() => setSort(id)}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      <ul className="voices__list">
        {shown.map((v) => (
          <li key={v.key}>
            <button type="button" className="voice" aria-pressed={v.key === current} onClick={() => onChoose(v.key)}>
              <VoiceMark title={v.title} icon={v.icon} />
              <span className="voice__text">
                <span className="voice__title">{v.title}</span>
                <span className="voice__kind">{v.kind === 'subtitles' ? 'Субтитры' : 'Озвучка'}</span>
              </span>
              {v.episodes ? <span className="voice__eps">{v.episodes} эп.</span> : null}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="muted side-empty">Ничего не нашлось</li>}
      </ul>
      {voices.length === 1 && <p className="muted voices__note">Других озвучек этого аниме пока нет.</p>}
    </section>
  )
}
