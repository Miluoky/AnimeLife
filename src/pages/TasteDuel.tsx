import { useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMyList } from '../data/myList'
import { usePageMeta } from '../data/pageMeta'
import { tasteStore } from '../data/taste'
import { toast } from '../data/toast'
import {
  duelPairs,
  loadDuel,
  makeDuelCode,
  matchPercent,
  packDuel,
  pickDuelTitles,
  saveDuel,
  unpackDuel,
  type DuelBoard,
  type DuelTitle,
} from '../data/tasteDuel'
import './taste-duel.css'

const NEED = 5

function useDuelPool(): DuelTitle[] {
  const list = useMyList()
  const taste = tasteStore.use()
  return useMemo(() => {
    const out: DuelTitle[] = []
    const seen = new Set<string>()
    for (const e of list) {
      if (!e.anime.title || seen.has(e.anime.id)) continue
      seen.add(e.anime.id)
      out.push({
        id: e.anime.id,
        title: e.anime.title,
        posterUrl: e.anime.posterSmall || e.anime.posterUrl,
        posterFill: e.anime.posterFill,
        year: e.anime.year,
      })
    }
    for (const t of taste.liked) {
      if (!t.title || seen.has(t.id)) continue
      seen.add(t.id)
      out.push({ id: t.id, title: t.title })
    }
    return out
  }, [list, taste])
}

function phaseOf(board: DuelBoard, asSecond: boolean): 'a' | 'handoff' | 'b' | 'result' {
  const n = board.titles.length
  const aN = board.a?.length ?? 0
  const bN = board.b?.length ?? 0
  if (aN >= n && bN >= n) return 'result'
  if (aN < n) return 'a'
  if (bN > 0 || asSecond) return 'b'
  return 'handoff'
}

function boardFromRoute(isShare: boolean, pack: string, code?: string): DuelBoard | undefined {
  if (isShare) return pack ? unpackDuel(pack) : undefined
  return code ? loadDuel(code) : undefined
}

/** На общей ссылке второй игрок начинает сразу, если первый уже ответил. */
function prefersSecond(board: DuelBoard | undefined): boolean {
  if (!board) return false
  const n = board.titles.length
  const aDone = (board.a?.length ?? 0) >= n
  const bDone = (board.b?.length ?? 0) >= n
  return aDone && !bDone
}

function Shell({ children }: { children: ReactNode }) {
  return <main className="container duel-page">{children}</main>
}

function Head({ kicker, title, text }: { kicker: string; title: string; text?: string }) {
  return (
    <header className="duel-head">
      <p className="duel-kicker">{kicker}</p>
      <h1 className="page-title">{title}</h1>
      {text && <p className="soft">{text}</p>}
    </header>
  )
}

function Cover({ item }: { item: DuelTitle }) {
  const fill = item.posterFill || '#1e2638'
  return (
    <span className="duel-cover" style={{ background: fill }}>
      {item.posterUrl ? <img src={item.posterUrl} alt="" /> : item.title.slice(0, 1)}
    </span>
  )
}

function PairCard({ item, onPick }: { item: DuelTitle; onPick: () => void }) {
  return (
    <button type="button" className="duel-side" onClick={onPick}>
      <Cover item={item} />
      <b>{item.title}</b>
      {item.year ? <span className="muted">{item.year}</span> : null}
      <span className="duel-pick">Ближе</span>
    </button>
  )
}

function publicUrl(path: string) {
  const root = `${location.origin}${import.meta.env.BASE_URL}`.replace(/\/?$/, '/')
  return `${root}${path.replace(/^\//, '')}`
}

async function copyCode(code: string, board: DuelBoard) {
  const hasA = (board.a?.length ?? 0) > 0
  if (!hasA) saveDuel(code, board)
  const url = hasA ? publicUrl(`/duel/share?p=${encodeURIComponent(packDuel(board))}`) : publicUrl(`/duel/${code}`)
  try {
    await navigator.clipboard.writeText(url)
    toast(hasA ? 'Ссылка скопирована. Второй игрок откроет её в любом браузере.' : 'Ссылка скопирована.')
  } catch {
    toast(hasA ? 'Не удалось скопировать ссылку' : `Код ${code}`)
  }
}

/** «Дуэль вкуса»: пятёрка из списка и вкуса, двое по очереди выбирают, что ближе. */
export default function TasteDuel() {
  usePageMeta('Дуэль вкуса', 'Сравните вкус вдвоём: пять тайтлов, каждый выбирает что ближе, в конце — процент совпадения.')
  const { code: raw } = useParams()
  const code = raw ? raw.toUpperCase() : undefined
  const { pathname } = useLocation()
  const isShare = pathname.replace(/\/+$/, '') === '/duel/share'
  const [params] = useSearchParams()
  const pack = isShare ? (params.get('p') ?? '') : ''
  const routeKey = isShare ? `s:${pack}` : `c:${code ?? ''}`
  const nav = useNavigate()
  const pool = useDuelPool()
  const [picked, setPicked] = useState<DuelTitle[]>([])
  const [routeKeySeen, setRouteKeySeen] = useState(routeKey)
  const [board, setBoard] = useState<DuelBoard | undefined>(() => boardFromRoute(isShare, pack, code))
  const [asSecond, setAsSecond] = useState(() => isShare && prefersSecond(boardFromRoute(isShare, pack, code)))

  if (routeKeySeen !== routeKey) {
    const next = boardFromRoute(isShare, pack, code)
    setRouteKeySeen(routeKey)
    setBoard(next)
    setAsSecond(isShare && prefersSecond(next))
  }

  const start = () => {
    if (picked.length !== NEED) return
    const next = makeDuelCode()
    saveDuel(next, { titles: picked })
    nav(`/duel/${next}`)
  }

  if (isShare && !board) {
    return (
      <Shell>
        <Head kicker="Дуэль вкуса" title="Ссылка не открылась" text="В адресе нет дуэли или данные повреждены." />
        <Link to="/duel" className="btn btn--ghost">
          Собрать свою пятёрку
        </Link>
      </Shell>
    )
  }

  if (!isShare && !code) {
    return (
      <Setup
        pool={pool}
        picked={picked}
        onAdd={(t) => {
          if (picked.some((x) => x.id === t.id)) return
          if (picked.length >= NEED) {
            toast('В дуэли пять тайтлов — уберите один, чтобы заменить')
            return
          }
          setPicked([...picked, t])
        }}
        onRemove={(id) => setPicked(picked.filter((t) => t.id !== id))}
        onGenerate={() => {
          if (pool.length < NEED) {
            toast('Нужно хотя бы пять тайтлов в списке или во вкусе')
            return
          }
          setPicked(pickDuelTitles(pool, NEED))
        }}
        onStart={start}
      />
    )
  }

  if (!board) {
    return (
      <Shell>
        <Head
          kicker="Дуэль вкуса"
          title="Код не найден"
          text="Короткого кода здесь нет. Попросите ссылку для второго игрока — она открывается в любом браузере."
        />
        <Link to="/duel" className="btn btn--ghost">
          Собрать свою пятёрку
        </Link>
      </Shell>
    )
  }

  const phase = phaseOf(board, asSecond)
  const pairs = duelPairs(board.titles)

  const choose = (side: 0 | 1) => {
    const who = phase === 'b' ? 'b' : 'a'
    const prev = board[who] ?? []
    if (prev.length >= pairs.length) return
    const next: DuelBoard = { ...board, [who]: [...prev, side] }
    if (code && !isShare) saveDuel(code, next)
    setBoard(next)
  }

  if (phase === 'result' && board.a && board.b) {
    const pct = matchPercent(board.a, board.b)
    const same = board.a.filter((v, i) => v === board.b?.[i]).length
    return (
      <Shell>
        <Head kicker={code && !isShare ? `Код ${code}` : 'Общая дуэль'} title="Дуэль вкуса" />
        <p className="duel-match" role="status">
          <span>Совпадение</span>
          <strong>{pct}%</strong>
        </p>
        <p className="soft duel-note">
          Совпали выборы: {same} из {pairs.length}
        </p>
        <ul className="duel-breakdown">
          {pairs.map((pair, i) => {
            const agree = board.a?.[i] === board.b?.[i]
            const left = pair[board.a?.[i] ?? 0].title
            const right = pair[board.b?.[i] ?? 0].title
            return (
              <li key={`${pair[0].id}-${pair[1].id}-${i}`} className={agree ? 'is-same' : undefined}>
                {agree ? `Оба выбрали «${left}»` : `Игрок 1: «${left}» · Игрок 2: «${right}»`}
              </li>
            )
          })}
        </ul>
        <div className="actions">
          <button
            type="button"
            className="btn btn--accent"
            onClick={() => {
              const next = { titles: board.titles }
              if (code && !isShare) saveDuel(code, next)
              setBoard(next)
              setAsSecond(false)
            }}
          >
            Ещё раз
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => nav('/duel')}>
            Другая пятёрка
          </button>
        </div>
      </Shell>
    )
  }

  if (phase === 'handoff') {
    return (
      <Shell>
        <Head
          kicker="Игрок 1 ответил"
          title="Передайте телефон"
          text="Ответы первого скрыты. Второй выбирает, что ближе, в тех же парах — на этом экране или по ссылке в любом браузере."
        />
        {code ? (
          <p className="duel-code">
            Код <b>{code}</b>
          </p>
        ) : null}
        <div className="actions">
          <button type="button" className="btn btn--accent" onClick={() => setAsSecond(true)}>
            Я игрок 2
          </button>
          {code ? (
            <button type="button" className="btn btn--ghost" onClick={() => void copyCode(code, board)}>
              Скопировать ссылку
            </button>
          ) : null}
        </div>
        <p className="muted duel-note">Ссылка открывает дуэль для второго игрока в любом браузере.</p>
      </Shell>
    )
  }

  const who = phase === 'b' ? 'b' : 'a'
  const step = board[who]?.length ?? 0
  const pair = pairs[step]
  if (!pair) return null

  return (
    <Shell>
      <Head
        kicker={`Игрок ${who === 'a' ? '1' : '2'} · пара ${step + 1} из ${pairs.length}`}
        title="Что ближе?"
        text="Выберите тайтл, который вам нравится больше."
      />
      {code && !isShare ? (
        <p className="duel-code">
          Код <b>{code}</b>
        </p>
      ) : null}
      <div className="duel-pair">
        <PairCard item={pair[0]} onPick={() => choose(0)} />
        <span className="duel-or">или</span>
        <PairCard item={pair[1]} onPick={() => choose(1)} />
      </div>
    </Shell>
  )
}

function Setup({
  pool,
  picked,
  onAdd,
  onRemove,
  onGenerate,
  onStart,
}: {
  pool: DuelTitle[]
  picked: DuelTitle[]
  onAdd: (t: DuelTitle) => void
  onRemove: (id: string) => void
  onGenerate: () => void
  onStart: () => void
}) {
  const rest = pool.filter((t) => !picked.some((p) => p.id === t.id))
  return (
    <Shell>
      <Head
        kicker="Дуэль вкуса"
        title="Пятёрка на двоих"
        text="Тайтлы из вашего списка и отмеченных при знакомстве. Каждый по очереди выбирает, что ближе. В конце — совпадение в процентах."
      />
      {pool.length < NEED ? (
        <div className="empty-state">
          <p>Для дуэли нужно пять тайтлов. Сейчас в списке и во вкусе {pool.length}.</p>
          <Link to="/my-list" className="btn btn--ghost">
            Мой список
          </Link>
        </div>
      ) : (
        <>
          <p className="duel-note">
            Выбрано {picked.length} из {NEED}
          </p>
          <ul className="duel-lineup" aria-label="Пятёрка">
            {picked.map((t) => (
              <li key={t.id}>
                <button type="button" className="pill active" onClick={() => onRemove(t.id)}>
                  {t.title} ×
                </button>
              </li>
            ))}
            {Array.from({ length: NEED - picked.length }, (_, i) => (
              <li key={`slot-${i}`}>
                <span className="pill duel-slot">пусто</span>
              </li>
            ))}
          </ul>
          {rest.length > 0 && (
            <ul className="duel-pool" aria-label="Откуда собрать пятёрку">
              {rest.map((t) => (
                <li key={t.id}>
                  <button type="button" className="pill" onClick={() => onAdd(t)}>
                    {t.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="actions">
            <button type="button" className="btn btn--ghost" onClick={onGenerate}>
              Собрать пятёрку
            </button>
            <button type="button" className="btn btn--accent" disabled={picked.length !== NEED} onClick={onStart}>
              Начать дуэль
            </button>
          </div>
          <p className="muted duel-note">
            Играете по очереди на этом экране. После первого игрока скопируйте ссылку — второй откроет её в любом браузере.
          </p>
        </>
      )}
    </Shell>
  )
}
