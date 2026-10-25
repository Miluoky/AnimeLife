import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '../api'
import { fetchSimilar } from '../api/shikimori'
import type { Anime } from '../data/catalog'
import { useAuth } from '../data/auth'
import { useMyList } from '../data/myList'
import { createLocalStore } from '../data/localStore'
import { watchLogStore } from '../data/watchLog'
import { toast } from '../data/toast'
import { enableTelegramNotify, isTelegramAccount, refreshTelegramNotify, useTelegramNotify } from '../data/telegramNotify'
import PosterCard from './PosterCard'
import { CloseIcon } from './Icons'
import './watch-return.css'

/** Когда гость закрыл предложение войти: снова не показываем. */
const nudgeStore = createLocalStore<number>('anime.loginNudge.v1', 0)

/**
 * Конец серии работает на возврат (план развития, неделя 2):
 * - гостю после второй просмотренной серии спокойно предлагаем войти через Telegram — прогресс уже сохранён
 *   в браузере и переедет в аккаунт;
 * - на последней вышедшей серии онгоинга — напоминание ботом в один тап (или вход, чтобы бот мог писать);
 * - досмотрел вышедший тайтл — три похожих, которые зритель ещё не начинал.
 */
export default function WatchReturn({ anime, current, total }: { anime: Anime; current: number; total: number }) {
  const { checking, user } = useAuth()
  const last = current >= total
  const waiting = last && anime.ongoing && !!anime.nextEpisodeAt
  const finished = last && !anime.ongoing && !anime.upcoming
  return (
    <>
      {!checking && !user && <LoginNudge waiting={waiting} />}
      {waiting && user && isTelegramAccount(user.$id) && <TelegramReminder />}
      {finished && <AfterFinish animeId={anime.id} />}
    </>
  )
}

function LoginNudge({ waiting }: { waiting: boolean }) {
  const [closedAt, setClosedAt] = useState(nudgeStore.get)
  // Одна запись журнала — одна серия за день: две и больше значат, что зритель уже смотрит, а не заглянул.
  const watched = watchLogStore.get().entries.length
  if (closedAt || (watched < 2 && !waiting)) return null
  return (
    <aside className="watch-return watch-return--nudge" aria-label="Сохранить прогресс">
      <div className="watch-return__text">
        <strong>{waiting ? 'Бот напишет, когда выйдет серия' : 'Прогресс сохранён в этом браузере'}</strong>
        <span className="muted">
          {waiting
            ? 'Войдите через Telegram: бот пришлёт новую серию, а список и история будут на всех устройствах.'
            : 'Войдите через Telegram в одно нажатие: история и список переедут в аккаунт и будут на телефоне и компьютере.'}
        </span>
      </div>
      <Link to="/account" className="btn btn--accent">
        Войти через Telegram
      </Link>
      <button
        type="button"
        className="icon-btn watch-return__close"
        aria-label="Не сейчас"
        onClick={() => {
          nudgeStore.set(Date.now())
          setClosedAt(Date.now())
        }}
      >
        <CloseIcon size={16} />
      </button>
    </aside>
  )
}

function TelegramReminder() {
  const state = useTelegramNotify()
  const [busy, setBusy] = useState(false)
  useEffect(() => void refreshTelegramNotify().catch(() => undefined), [])
  if (state !== 'off') return null
  return (
    <aside className="watch-return" aria-label="Напоминание о серии">
      <div className="watch-return__text">
        <strong>Напомнить в Telegram?</strong>
        <span className="muted">Бот @AnimeLifeAuth_bot напишет, как только выйдет новая серия тайтлов из «Смотрю».</span>
      </div>
      <button
        type="button"
        className="btn btn--accent"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          enableTelegramNotify()
            .then(() => toast('Готово: бот напишет о новых сериях'))
            .catch(() => toast('Не получилось включить, попробуйте в профиле'))
            .finally(() => setBusy(false))
        }}
      >
        Напоминать
      </button>
    </aside>
  )
}

function AfterFinish({ animeId }: { animeId: string }) {
  const list = useMyList()
  const similar = useAsync(() => fetchSimilar(animeId).catch(() => []), [animeId])
  const started = new Set(list.map((e) => e.anime.id))
  const picks = (similar.value ?? []).filter((a) => !started.has(a.id) && !a.upcoming).slice(0, 3)
  if (!picks.length) return null
  return (
    <section className="watch-return watch-return--similar" aria-label="Что посмотреть дальше">
      <h2 className="watch-return__title">Досмотрели? Вот похожее</h2>
      <div className="watch-return__grid">
        {picks.map((a) => (
          <PosterCard key={a.id} anime={a} />
        ))}
      </div>
    </section>
  )
}
