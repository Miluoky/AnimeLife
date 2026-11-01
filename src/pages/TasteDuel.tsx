import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMyList } from '../data/myList'
import { usePageMeta } from '../data/pageMeta'
import { tasteStore } from '../data/taste'
import { toast } from '../data/toast'
import {
  duelPairs,
  loadDuel,
  makeDuelCode,
  matchPercent,
  pickDuelTitles,
  saveDuel,
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

async function copyCode(code: string) {
  const url = `${location.origin}${import.meta.env.BASE_URL}duel/${code}`
  try {
    await navigator.clipboard.writeText(url)
    toast('Ссылка скопирована. Она открывается в этом браузере.')
  } catch {
    toast(`Код ${code}`)
  }
}

/** «Дуэль вкуса»: пятёрка из списка и вкуса, двое по очереди выбирают, что ближе. */
export default function TasteDuel() {
  usePageMeta('Дуэль вкуса', 'Сравните вкус вдвоём: пять тайтлов, каждый выбирает что ближе, в конце — процент совпадения.')
  const { code: raw } = useParams()
  const code = raw ? raw.toUpperCase() : undefined
  const nav = useNavigate()
  const pool = useDuelPool()
  const [picked, setPicked] = useState<DuelTitle[]>([])
  const [board, setBoard] = useState<DuelBoard | undefined>(() => (code ? loadDuel(code) : undefined))
  const [asSecond, setAsSecond] = useState(false)

  useEffect(() => {
    setBoard(code ? loadDuel(code) : undefined)
    setAsSecond(false)
  }, [code])

  const start = () => {
    if (picked.length !== NEED) return
    const next = makeDuelCode()
    saveDuel(next, { titles: picked })
    nav(`/duel/${next}`)
  }

  if (!code) {
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
        <Head kicker="Дуэль вкуса" title="Код не найден" text="Дуэль хранится в этом сеансе браузера. В другой вкладке или на другом устройстве кода нет." />
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
    saveDuel(code, next)
    setBoard(next)
  }

  if (phase === 'result' && board.a && board.b) {
    const pct = matchPercent(board.a, board.b)
    const same = board.a.filter((v, i) => v === board.b?.[i]).length
    return (
      <Shell>
        <Head kicker={`Код ${code}`} title="Дуэль вкуса" />
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
              saveDuel(code, next)
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
          text="Ответы первого скрыты. Второй выбирает, что ближе, в тех же парах."
        />
        <p className="duel-code">
          Код <b>{code}</b>
        </p>
        <div className="actions">
          <button type="button" className="btn btn--accent" onClick={() => setAsSecond(true)}>
            Я игрок 2
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => void copyCode(code)}>
            Скопировать ссылку
          </button>
        </div>
        <p className="muted duel-note">Ссылка открывает эту дуэль в текущем сеансе браузера.</p>
      </Shell>
    )
  }

  const who = phase === 'b' ? 'b' : 'a'
  const step = (board[who]?.length ?? 0)
  const pair = pairs[step]
  if (!pair) return null

  return (
    <Shell>
      <Head
        kicker={`Игрок ${who === 'a' ? '1' : '2'} · пара ${step + 1} из ${pairs.length}`}
        title="Что ближе?"
        text="Выберите тайтл, который вам нравится больше."
      />
      <p className="duel-code">
        Код <b>{code}</b>
      </p>
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
          <p className="muted duel-note">Играете по очереди на этом экране. После первого игрока можно передать телефон или скопировать код — он живёт в этом сеансе браузера.</p>
        </>
      )}
    </Shell>
  )
}
