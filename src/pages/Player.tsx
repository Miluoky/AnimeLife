import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { useAmbient } from '../components/ambient'
import { loadAnime, useAsync } from '../api'
import { episodeTotals, episodesLabel } from '../data/catalog'
import { saveProgress } from '../data/history'
import { savePosition } from '../data/positions'
import { logEpisode } from '../data/watchLog'
import { playerTime } from '../data/playerTime'
import { getEntry, setListStatus, setWatched, useMyList } from '../data/myList'
import NotFound from './NotFound'
import WatchTogetherButton from '../components/together/WatchTogetherButton'
import VideoPlayer, { type Provider } from '../components/VideoPlayer'
import { isBalancerAvailable } from '../api/balancers'
import { fetchKodikTranslations } from '../api/kodik'
import { findRelease } from '../api/anilibria'
import { findAnimeVost } from '../api/animevost'
import { anixartEpisodes, findAnixart, type AnixartRelease } from '../api/anixart'
import { findYummy, voiceKey, type YummyPlayer, type YummyVoice } from '../api/yummy'
import { playerVoiceKey, rememberVoice, savedVoice, voiceKey as studioKey } from '../api/voiceKey'
import { markFlag } from '../data/flags'
import { toast } from '../data/toast'
import { createLocalStore } from '../data/localStore'
import { usePageMeta } from '../data/pageMeta'
import { ageLabel, animeInfo, watchPageDescription, watchPageTitle } from '../data/seo'
import { BackIcon, BulbIcon, ClockIcon, CloseIcon, SearchIcon, SkipIcon, WideIcon } from '../components/Icons'
import { useLightsOff, useMiniPlayer } from '../components/watchModes'
import VoiceLogo from '../components/VoiceLogo'
import PlayerGlow, { GlowCaptureButton } from '../components/PlayerGlow'
import NextEpisode from '../components/NextEpisode'

// «Пропускать филлеры»: кнопка и автопереход ведут сразу к следующей сюжетной серии.
const skipFillersStore = createLocalStore('anime.skipfillers.v1', false)
// Широкий экран на компьютере: видео во всю ширину, озвучки и серии под ним.
const wideStore = createLocalStore('anime.widescreen.v1', false)

// Комментарии тянут SDK Appwrite: грузим их отдельно, плеер появляется сразу.
const EpisodeComments = lazy(() => import('../components/EpisodeComments'))
const NextPart = lazy(() => import('../components/NextPart'))
const EpisodeRating = lazy(() => import('../components/EpisodeRating'))

export default function Player() {
  const { id = '', episode = '1' } = useParams()
  const navigate = useNavigate()
  // Ссылка на момент (?t=секунды): кладём его как место, где остановились, и плеер начнёт оттуда.
  const [params] = useSearchParams()
  const startAt = Number(params.get('t'))
  useMemo(() => {
    if (startAt > 0) savePosition(id, Math.max(1, Number(episode) || 1), startAt)
  }, [id, episode, startAt])
  const result = useAsync(() => loadAnime(id), [id])
  const anime = result.value?.data
  // «Кадр»: вокруг плеера свет постера.
  useAmbient(anime?.posterSmall ?? anime?.posterUrl)
  // Названия серий приходят от AniLibria, когда плеер нашёл релиз.
  const [names, setNames] = useState<Record<number, string>>({})
  // Другой тайтл — серии прошлого релиза не в счёт.
  useEffect(() => setNames({}), [id])
  const list = useMyList()
  const seen = (anime && list.find((e) => e.anime.id === anime.id)?.watched) || 0

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
  // YummyAnime: те же студии в других плеерах (CVH, Alloha…) и студии, которых нет больше нигде. Плеер его не ждёт.
  // Ответ помечен id тайтла: пока он не про этот тайтл (ещё грузится или остался от прошлого), строка плееров ждёт его.
  const yummy = useAsync(async () => {
    if (!anime) return undefined
    const found = await findYummy(anime.id, [anime.title, anime.originalTitle, anime.englishTitle]).catch(() => null)
    return { id: anime.id, voices: found }
  }, [anime?.id])
  const yummyVoices = yummy.value?.id === anime?.id ? (yummy.value?.voices ?? null) : null
  const yummyPending = !!anime && yummy.value?.id !== anime.id
  const voices = useMemo(
    () =>
      buildVoices(
        kodik.value ?? [],
        Object.keys(names).length || free.value?.aniLibria,
        free.value?.animeVost ?? 0,
        free.value?.anixart ?? null,
        yummyVoices,
      ),
    [kodik.value, names, free.value, yummyVoices],
  )
  const available = Math.max(0, ...voices.map((v) => v.episodes ?? 0))
  // Источники могут знать больше серий, чем Shikimori, но меньше — не повод прятать вышедшие серии.
  // Счёт общий со страницей тайтла (episodeTotals): номера серий и таймера там и тут совпадают.
  const { total, next } = anime ? episodeTotals(anime, available) : { total: 1, next: 2 }
  // Своих источников нет: ждём YummyAnime, иначе сначала включится трейлер, а потом серия.
  const hasOwn = !!kodik.value?.length || !!free.value?.aniLibria || !!free.value?.animeVost || !!free.value?.anixart?.voices.length
  const waitYummy = yummyPending && !hasOwn
  // Филлеры размечены в Anixart: берём их из самой популярной озвучки, у всех студий номера одни.
  const axRelease = free.value?.anixart
  const fillers = useAsync(
    () => (axRelease?.voices.length ? anixartEpisodes(axRelease.id, axRelease.voices[0].type).then((e) => e.fillers).catch(() => undefined) : Promise.resolve(undefined)),
    [axRelease?.id],
  )
  const skipFillers = skipFillersStore.use()
  const wide = wideStore.use()
  // Выбор зрителя помнится для каждого тайтла (rememberVoice), автопереключение на запасной источник — только на эту серию.
  const [picked, setPicked] = useState<{ id: string; key: string }>()
  const setVoiceKey = (key: string) => setPicked({ id, key })
  const voiceKey = picked?.id === id ? picked.key : savedVoice(id)
  const requested = Math.max(1, Number(episode) || 1)
  const current = Math.min(requested, total)
  // Со страницы тайтла приходит ключ по названию студии (playerVoiceKey): источник там неизвестен.
  const voice =
    voices.find((v) => v.key === voiceKey || playerVoiceKey(v) === voiceKey) ??
    defaultVoice(voices, current, (axRelease?.voices ?? []).filter((v) => v.kind === 'voice').map((v) => studioKey(v.title)))
  // Озвучка для «Итогов года»: журнал читает её из ref, чтобы смена озвучки не считалась новым просмотром.
  const voiceTitle = useRef<string | undefined>(undefined)
  voiceTitle.current = voice?.title
  // Автопереключение: какие пары «озвучка + плеер» на этой серии уже не справились, и выбирал ли зритель сам.
  const tried = useRef(new Set<string>())
  const manual = useRef(false)
  const chooseVoice = (key: string) => {
    manual.current = true
    rememberVoice(id, key)
    setVoiceKey(key)
  }
  const [hostId, setHostId] = useState(savedHost)
  const hosts = voice ? hostsOf(voice) : []
  const host = hosts.find((h) => h.id === hostId) ?? hosts[0]
  const chooseHost = (id: string) => {
    manual.current = true
    saveHost(id)
    setHostId(id)
  }
  useEffect(() => {
    tried.current = new Set()
    manual.current = false
  }, [anime?.id, current])
  // Источник не грузится или серии в нём нет: сами включаем следующий, а не просим зрителя перебирать плееры.
  // Если зритель выбрал источник сам, оставляем его выбор и пояснение под видео.
  const fallBack = () => {
    if (manual.current || !voice || tried.current.size >= MAX_AUTO_SWITCHES) return
    tried.current.add(sourceSlot(voice, host))
    const next = nextSource(voices, voice, current, tried.current)
    if (!next) return
    setVoiceKey(next.voice.key)
    setHostId(next.host.id)
    toast(
      next.voice.key === voice.key
        ? `Плеер ${host?.label ?? voice.title} не грузится, включили ${next.host.label}`
        : `${voice.title} не грузится, включили озвучку ${next.voice.title}`,
    )
  }
  const isScheduled = !!anime?.ongoing && !!anime.nextEpisodeAt && requested === next

  useEffect(() => {
    if (!anime || isScheduled) return
    saveProgress(anime, current, total)
    logEpisode(anime, current, voiceTitle.current)
    // Открыли серию N: предыдущие считаем просмотренными, если тайтл в списке.
    const entry = getEntry(anime.id)
    if (entry && (entry.watched ?? 0) < current - 1) setWatched(anime.id, current - 1)
    const hour = new Date().getHours()
    if (hour < 5) markFlag('nightOwl')
  }, [anime, current, total, isScheduled])

  // Озвучка стала известна позже серии: дописываем её в журнал той же записью.
  useEffect(() => {
    if (anime && voice?.title && !isScheduled) logEpisode(anime, current, voice.title)
  }, [voice?.title])

  const [lightsOff, setLightsOff] = useLightsOff()
  const miniPlayer = useMiniPlayer(!!anime && !isScheduled && !lightsOff)

  usePageMeta(
    anime && watchPageTitle(animeInfo(anime), current),
    anime && watchPageDescription(animeInfo(anime), current, total),
  )

  if (result.loading && !result.value) return <main className="container empty-page" aria-busy="true" />
  if (!anime) return <NotFound title="Тайтл не найден" />
  if (isScheduled) {
    return (
      <main className="container empty-page episode-upcoming">
        <h1>{anime.title}: серия {requested}</h1>
        <p className="muted">Этой серии ещё нет ни в одном подключённом источнике.</p>
        <NextEpisode at={anime.nextEpisodeAt!} episode={requested} />
        <Link className="btn btn--ghost" to={`/anime/${anime.id}`}>Вернуться к сериалу</Link>
      </main>
    )
  }
  if (requested > total) {
    return (
      <NotFound
        title="Серия ещё не вышла"
        text={anime.ongoing ? `Пока вышло серий: ${total}. Новые появляются здесь сразу после выхода.` : `Всего серий: ${total}.`}
        action={
          <Link to={`/watch/${anime.id}/${total}`} className="btn btn--accent">
            Последняя серия
          </Link>
        }
      />
    )
  }

  const goTo = (n: number) => navigate(`/watch/${anime.id}/${n}`)
  // Вперёд на одну серию с включённым пропуском — через все филлеры подряд.
  const goNext = () => {
    let n = current + 1
    while (skipFillers && fillers.value?.has(n) && n < total) n++
    goTo(n)
  }
  const name = names[current]

  return (
    <main
      className={`container player-page${wide ? ' player-page--wide' : ''}${lightsOff ? ' player-page--dark' : ''}`}
    >
      {lightsOff && <div className="lights-curtain" aria-hidden="true" onClick={() => setLightsOff(false)} />}
      <div
        ref={miniPlayer.slot}
        className={`video-slot${miniPlayer.mini ? ' video-slot--mini' : ''}`}
        style={miniPlayer.mini ? { minHeight: miniPlayer.height } : undefined}
      >
      <PlayerGlow slot={miniPlayer.slot} poster={anime.posterSmall ?? anime.posterUrl} animeId={anime.id} />
      {miniPlayer.mini && (
        <button type="button" className="video-slot__close" aria-label="Закрыть мини-плеер" onClick={miniPlayer.close}>
          <CloseIcon size={16} />
        </button>
      )}
      {/* Мульти-провайдерный плеер; если серию взять негде — трейлер */}
      {/* Пока не знаем озвучки Kodik, плеер не включаем: иначе он начнёт с одной озвучки и тут же сменит её. */}
      {kodik.loading || free.loading || !free.value || waitYummy ? (
        <div className="video-player">
          <div className="player-frame" aria-busy="true" />
        </div>
      ) : (
      <VideoPlayer
        title={anime.title}
        poster={anime.posterUrl}
        originalTitle={anime.originalTitle}
        englishTitle={anime.englishTitle}
        year={anime.year}
        shikimoriId={anime.id}
        episode={current}
        totalEpisodes={total}
        onEpisodeChange={(n) => (n === current + 1 ? goNext() : goTo(n))}
        onEnded={() => {
          // Досмотрели серию: отмечаем её в списке, а последняя переносит тайтл в «Просмотрено».
          const entry = getEntry(anime.id)
          if (!entry || (entry.watched ?? 0) >= current) return
          if (setWatched(anime.id, current) === 'completed') toast(`«${anime.title}» — в «Просмотрено»`)
        }}
        onEpisodes={(eps) => setNames(Object.fromEntries(eps.map((e) => [e.ordinal, e.name ?? ''])))}
        trailerUrl={anime.trailerUrl}
        provider={host?.player ? 'embed' : voice?.provider}
        available={[...new Set(voices.map((v) => v.provider))]}
        kodikLink={voice?.kodikLink}
        anixart={voice?.anixart}
        skips={voice?.yummy?.map((p) => p.skips.get(current)).find(Boolean)}
        kodikSkips={voice?.yummy?.find((p) => /kodik/i.test(p.name))?.skips.get(current)}
        embed={host?.player && voice ? { url: host.player.urls.get(current), player: host.player.name, voice: voice.title } : undefined}
        onUnavailable={fallBack}
        onProviderChange={(p) => {
          const next = voices.find((v) => v.provider === p)
          if (next) chooseVoice(next.key)
        }}
      />
      )}
      </div>

      {/* Заголовок и кнопки идут сразу за видео: на телефоне они не уезжают под длинный список озвучек. */}
      <div className="watch-head">
        {/* Выбор плеера — отдельной строкой над заголовком, в той же ячейке сетки. */}
        {/* Запасные плееры YummyAnime приходят через пару секунд: место под строку занято сразу,
            иначе она появлялась над заголовком и сдвигала его и кнопки (CLS 0.1 на телефоне). */}
        {(hosts.length > 1 || yummyPending) && (
          <HostPicker hosts={hosts} current={host?.id} onChoose={chooseHost} searching={yummyPending} />
        )}
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
          <button
            type="button"
            className="btn btn--ghost watch-wide"
            aria-pressed={wide}
            title={wide ? 'Обычный размер' : 'Широкий экран'}
            onClick={() => wideStore.set(!wide)}
          >
            <WideIcon />
            <span className="sr-only">Широкий экран</span>
          </button>
          <button
            type="button"
            className="btn btn--ghost watch-lights"
            aria-pressed={lightsOff}
            title={lightsOff ? 'Включить свет' : 'Выключить свет вокруг видео'}
            onClick={() => setLightsOff(!lightsOff)}
          >
            <BulbIcon />
            <span className="sr-only">Шторка света</span>
          </button>
          {(host?.player || (voice?.provider !== 'anilibria' && voice?.provider !== 'animevost')) && <GlowCaptureButton slot={miniPlayer.slot} />}
          <button
            type="button"
            className="btn btn--ghost watch-moment"
            title="Поделиться моментом: ссылка откроет серию с этого места"
            onClick={() => shareMoment(anime.title, anime.id, current)}
          >
            <ClockIcon size={18} />
            <span className="sr-only">Поделиться моментом</span>
          </button>
          <WatchTogetherButton anime={anime} episode={current} className="btn btn--ghost watch-together" />
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
        {/* Последняя вышедшая серия онгоинга: когда следующая и как о ней узнать — повод вернуться. */}
        {anime.ongoing && anime.nextEpisodeAt && current >= total && (
          <div className="watch-follow">
            <NextEpisode at={anime.nextEpisodeAt} episode={total + 1} />
            {list.find((e) => e.anime.id === anime.id)?.status === 'watching' ? (
              <p className="muted watch-follow__text">Тайтл в «Смотрю»: новая серия появится там с отметкой, а в приложении — числом на значке.</p>
            ) : (
              <div className="watch-follow__text">
                <p className="muted">Добавьте в «Смотрю» — покажем новую серию, как только она выйдет.</p>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    const prev = getEntry(anime.id)?.status
                    setListStatus(anime, 'watching')
                    toast(`«${anime.title}» — в «Смотрю»`, { label: 'Отменить', onClick: () => setListStatus(anime, prev) })
                  }}
                >
                  Следить за сериями
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="watch-side">
        {voices.length > 0 && <VoicePicker voices={voices} current={voice?.key} total={total} onChoose={chooseVoice} />}
        <EpisodePicker
          animeId={anime.id}
          total={total}
          label={episodesLabel(anime, available)}
          current={current}
          seen={seen}
          names={voice?.provider === 'anilibria' ? names : {}}
          provider="AniLibria"
          fillers={fillers.value}
        />
      </div>

      <Suspense fallback={null}>
        {current >= total && !anime.ongoing && !anime.upcoming && <NextPart animeId={anime.id} />}
        <EpisodeRating animeId={anime.id} episode={current} />
        <EpisodeComments animeId={anime.id} episode={current} />
      </Suspense>
    </main>
  )
}

const two = (n: number) => String(Math.floor(n)).padStart(2, '0')
const stamp = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${two((s % 3600) / 60)}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`)

/** Ссылка на серию с текущего места: на телефоне системное меню, на компьютере копируем. */
async function shareMoment(title: string, animeId: string, episode: number) {
  const t = Math.floor(playerTime())
  const url = `${location.origin}${import.meta.env.BASE_URL}watch/${animeId}/${episode}${t > 0 ? `?t=${t}` : ''}`
  const text = `${title}, серия ${episode}${t > 0 ? `, с ${stamp(t)}` : ''}`
  if (navigator.share) return void (await navigator.share({ title: text, url }).catch(() => undefined))
  try {
    await navigator.clipboard.writeText(url)
    toast(t > 0 ? `Ссылка на момент ${stamp(t)} скопирована` : 'Ссылка на серию скопирована')
  } catch {
    toast('Не удалось скопировать ссылку')
  }
}

const RANGE = 100

/**
 * Номера серий полосой (на телефоне листается вбок, на компьютере — сетка сбоку).
 * Текущая подсвечена, просмотренные по «Моему списку» отмечены точкой. У длинных сериалов — по сотне.
 */
function EpisodePicker({
  animeId,
  total,
  label,
  current,
  seen,
  names,
  provider,
  fillers,
}: {
  animeId: string
  total: number
  /** «1180 вышло · 1157 доступно» */
  label: string
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
        <span className="muted">{label}</span>
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
  /** с какой серии есть озвучка (у Kodik студии подхватывают длинные сериалы на середине) */
  first?: number
  kodikLink?: string
  anixart?: { release: number; type: number; title: string }
  icon?: string
  /** та же студия в плеерах YummyAnime */
  yummy?: YummyPlayer[]
}

/**
 * Озвучка по умолчанию, пока зритель не выбрал свою: русская озвучка, а не субтитры; из студий, у которых
 * есть почти все серии (не меньше 90% от лидера), — самая популярная по Anixart (popular — ключи студий
 * по убыванию популярности), при равенстве та, где серий больше. Раньше первой стояла дорожка с наибольшим
 * числом серий, и у Ван-Пис это были субтитры.
 */
function defaultVoice(voices: Voice[], episode: number, popular: string[]): Voice | undefined {
  const withEpisode = voices.filter((v) => hasEpisode(v, episode))
  const dubbed = withEpisode.filter((v) => v.kind === 'voice')
  if (!dubbed.length) return withEpisode[0] ?? voices[0]
  const count = (v: Voice) => (v.episodes ?? 0) - (v.first ?? 1) + 1
  const most = Math.max(...dubbed.map(count))
  const full = most > 1 ? dubbed.filter((v) => count(v) >= most * 0.9) : dubbed
  const rank = (v: Voice) => {
    const i = popular.indexOf(studioKey(v.title))
    return i < 0 ? popular.length : i
  }
  return [...full].sort((a, b) => rank(a) - rank(b) || count(b) - count(a))[0]
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
  yummy: YummyVoice[] | null,
): Voice[] {
  const list: Voice[] = [...kodik]
    .sort((a, b) => b.episodes - a.episodes)
    .map((t) => ({ key: `kodik:${t.id}`, provider: 'kodik', title: t.title, kind: t.kind, episodes: t.episodes, first: t.first, kodikLink: t.link }))
  if (isBalancerAvailable('alloha')) list.push({ key: 'alloha', provider: 'alloha', title: 'Alloha', kind: 'voice' })
  const others = animeVostEpisodes > 0 || !!anixart?.voices.length || !!yummy?.length
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
  // Студии YummyAnime: знакомым добавляем плееры, новые ставим в конец.
  for (const y of yummy ?? []) {
    const same = list.find((v) => v.kind === y.kind && voiceKey(v.title) === voiceKey(y.title))
    if (same) same.yummy = y.players
    else list.push({ key: `yummy:${y.kind}:${voiceKey(y.title)}`, provider: 'embed', title: y.title, kind: y.kind, episodes: y.episodes, yummy: y.players })
  }
  if (aniLibriaEpisodes === undefined && others && !list.some((v) => v.title === 'AniLibria')) list.push(aniLibria)
  return list
}

/* ─── Плееры одной студии: свой источник и запасные из YummyAnime ─── */

interface Host {
  /** '' — свой источник озвучки, иначе название плеера YummyAnime */
  id: string
  label: string
  player?: YummyPlayer
}

const OWN_LABEL: Partial<Record<Provider, string>> = { anilibria: 'Наш плеер', animevost: 'Наш плеер', anixart: 'Kodik', kodik: 'Kodik', alloha: 'Alloha' }

function hostsOf(voice: Voice): Host[] {
  const own = voice.provider === 'embed' ? undefined : OWN_LABEL[voice.provider]
  const list: Host[] = own ? [{ id: '', label: own }] : []
  for (const p of voice.yummy ?? []) {
    // Kodik у Anixart уже свой: второй такой же не показываем.
    if (p.name === own) continue
    list.push({ id: p.name, label: p.name, player: p })
  }
  return list
}

/** Больше стольких автоматических переключений на одной серии не делаем: дальше выбирает зритель. */
const MAX_AUTO_SWITCHES = 8

function sourceSlot(voice: Voice, host?: Host) {
  return `${voice.key}|${host?.id ?? ''}`
}

/**
 * Запасной источник для серии: сначала другие плееры той же озвучки, потом другие озвучки
 * того же вида (озвучка или субтитры), потом остальные. Пропускаем то, что уже пробовали,
 * и то, где этой серии заведомо нет.
 */
function nextSource(voices: Voice[], from: Voice, episode: number, tried: Set<string>): { voice: Voice; host: Host } | undefined {
  const order = [from, ...voices.filter((v) => v !== from && v.kind === from.kind), ...voices.filter((v) => v !== from && v.kind !== from.kind)]
  for (const voice of order) {
    if (!hasEpisode(voice, episode)) continue
    const hosts = hostsOf(voice)
    for (const host of hosts.length ? hosts : [{ id: '', label: voice.title }]) {
      if (tried.has(sourceSlot(voice, host))) continue
      if (host.player && !host.player.urls.get(episode)) continue
      return { voice, host }
    }
  }
}

/** Есть ли в озвучке эта серия (неизвестно, сколько серий, — считаем, что есть). */
function hasEpisode(voice: Voice, episode: number) {
  return (voice.first ?? 1) <= episode && (voice.episodes === undefined || voice.episodes >= episode)
}

const HOST_KEY = 'player-host'

function savedHost() {
  try {
    return sessionStorage.getItem(HOST_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveHost(id: string) {
  try {
    sessionStorage.setItem(HOST_KEY, id)
  } catch {
    // Без хранилища на следующей серии будет плеер по умолчанию.
  }
}

function HostPicker({ hosts, current, onChoose, searching }: { hosts: Host[]; current?: string; onChoose: (id: string) => void; searching?: boolean }) {
  return (
    <div className="hosts" role="group" aria-labelledby="hosts-label">
      <span className="hosts__label" id="hosts-label">
        Плеер
      </span>
      <div className="hosts__list">
        {hosts.map((h) => (
          <button key={h.id} type="button" className={`pill${h.id === current ? ' active' : ''}`} aria-pressed={h.id === current} onClick={() => onChoose(h.id)}>
            {h.label}
          </button>
        ))}
      </div>
      <span className="hosts__hint">{searching ? 'Ищем запасные плееры…' : 'Не грузится или тормозит? Выберите другой плеер'}</span>
    </div>
  )
}

const SOURCE_LABEL: Record<Provider, string> = {
  anilibria: 'Плеер сайта',
  animevost: 'Плеер сайта',
  anixart: 'Kodik',
  kodik: 'Kodik',
  alloha: 'Alloha',
  embed: 'YummyAnime',
}

type VoiceSort = 'episodes' | 'title'
type VoiceTab = Voice['kind']

/** Озвучки карточками, как на Senku: вкладки «Озвучка» и «Субтитры», поиск, у каждой студии свой значок. */
function VoicePicker({ voices, current, total, onChoose }: { voices: Voice[]; current?: string; total: number; onChoose: (key: string) => void }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<VoiceSort>('episodes')
  const active = voices.find((v) => v.key === current)
  const dubs = voices.filter((v) => v.kind === 'voice')
  const subs = voices.filter((v) => v.kind === 'subtitles')
  // Пока зритель сам не выбрал вкладку, открыта та, где играющая озвучка.
  const [picked, setTab] = useState<VoiceTab>()
  const tab = picked ?? active?.kind ?? (dubs.length ? 'voice' : 'subtitles')
  const tabbed = dubs.length > 0 && subs.length > 0
  const q = query.trim().toLowerCase()
  const shown = (tabbed ? (tab === 'voice' ? dubs : subs) : voices)
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
      {tabbed && (
        <div className="voices__tabs" role="group" aria-label="Озвучка или субтитры">
          {(
            [
              ['voice', 'Озвучка', dubs.length],
              ['subtitles', 'Субтитры', subs.length],
            ] as const
          ).map(([id, label, count]) => (
            <button key={id} type="button" className="voices__tab" aria-pressed={tab === id} onClick={() => setTab(id)}>
              {label} <span>{count}</span>
            </button>
          ))}
        </div>
      )}
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
        {shown.map((v) => {
          const on = v.key === current
          const share = v.episodes && total > 0 ? Math.min(1, v.episodes / total) : 0
          return (
            <li key={v.key}>
              <button type="button" className="voice" aria-pressed={on} onClick={() => onChoose(v.key)}>
                <VoiceLogo title={v.title} kind={v.kind} icon={v.icon} size={44} />
                <span className="voice__text">
                  <span className="voice__title">{v.title}</span>
                  <span className="voice__kind">
                    {v.kind === 'subtitles' ? 'Субтитры' : 'Озвучка'} · {SOURCE_LABEL[v.provider]}
                    {v.first && v.first > 1 && v.episodes
                      ? ` · серии ${v.first}–${v.episodes}`
                      : v.episodes
                        ? ` · ${total > 1 && v.episodes < total ? `${v.episodes} из ${total}` : `${v.episodes} эп.`}`
                        : ''}
                  </span>
                  {share > 0 && (
                    <span className="voice__bar" aria-hidden="true">
                      <span style={{ width: `${Math.round(share * 100)}%` }} />
                    </span>
                  )}
                </span>
                {on && (
                  <span className="voice__now">
                    <span className="voice__eq" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    Играет
                  </span>
                )}
              </button>
            </li>
          )
        })}
        {shown.length === 0 && <li className="muted side-empty">Ничего не нашлось</li>}
      </ul>
      {voices.length === 1 && <p className="muted voices__note">Других озвучек этого аниме пока нет.</p>}
    </section>
  )
}
