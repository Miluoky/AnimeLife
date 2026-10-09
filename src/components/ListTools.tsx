import './tracking.css'
import { useState, type FormEvent } from 'react'
import { useMyList } from '../data/myList'
import { toast } from '../data/toast'
import { markFlag } from '../data/flags'

/** Перенос списка: импорт из Shikimori и MyAnimeList, выгрузка для MAL и резервная копия. */
export default function ListTools() {
  const list = useMyList()
  const [nick, setNick] = useState('')
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()

  const run = async (what: string, job: () => Promise<{ total: number; added: number }>) => {
    setBusy(what)
    setError(undefined)
    try {
      const r = await job()
      markFlag('imported')
      toast(`Импортировано ${r.total}: новых ${r.added}, у остальных обновлён прогресс`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось импортировать')
    } finally {
      setBusy(undefined)
    }
  }

  const fromShiki = (e: FormEvent) => {
    e.preventDefault()
    void run('shiki', async () => (await import('../data/listImport')).importFromShikimori(nick))
  }

  return (
    <details className="list-tools">
      <summary>Импорт и экспорт списка</summary>
      <div className="list-tools__grid">
        <form className="stack list-tools__card" onSubmit={fromShiki}>
          <strong>Из Shikimori</strong>
          <span className="muted">Ник или ссылка на профиль. Список должен быть открытым.</span>
          <div className="chat__form">
            <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="ник" aria-label="Ник на Shikimori" />
            <button type="submit" className="btn btn--accent btn--small" disabled={!nick.trim() || !!busy}>
              {busy === 'shiki' ? 'Загружаем…' : 'Импорт'}
            </button>
          </div>
        </form>
        <label className="stack list-tools__card">
          <strong>Из MyAnimeList</strong>
          <span className="muted">
            Файл из «Export My List» на MAL (.xml или .xml.gz). Подойдёт и экспорт из AniList или Kitsu в формате MAL.
          </span>
          <span className="btn btn--ghost btn--small" aria-busy={busy === 'mal'}>
            {busy === 'mal' ? 'Загружаем…' : 'Выбрать файл'}
          </span>
          <input
            type="file"
            accept=".xml,.gz,application/xml,application/gzip"
            hidden
            disabled={!!busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void run('mal', async () => (await import('../data/listImport')).importFromMal(file))
            }}
          />
        </label>
        <div className="stack list-tools__card">
          <strong>Выгрузить</strong>
          <span className="muted">Файл для MyAnimeList, Shikimori и AniList или полная копия списка.</span>
          <div className="actions">
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={!list.length}
              onClick={async () => (await import('../data/listImport')).exportForMal(list)}
            >
              Для MAL (XML)
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={!list.length}
              onClick={async () => (await import('../data/listImport')).exportJson(list)}
            >
              Копия (JSON)
            </button>
          </div>
        </div>
      </div>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
    </details>
  )
}
