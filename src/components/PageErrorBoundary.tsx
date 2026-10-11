import { Component, type ReactNode } from 'react'

const RELOAD_KEY = 'chunk-reload-at'

/** Не загрузилась часть сайта: после обновления старых файлов на сервере уже нет (или пропала сеть). */
const isChunkError = (e: unknown) =>
  e instanceof Error && /dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(e.message)

/**
 * Перезагрузить страницу, чтобы взять свежую версию сайта. Не чаще раза в минуту:
 * если перезагрузка не помогла, показываем сообщение, а не крутимся по кругу.
 */
export function reloadOnce(): boolean {
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOAD_KEY) ?? 0) < 60_000) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // Без хранилища не можем защититься от бесконечных перезагрузок: оставляем кнопку.
    return false
  }
  window.location.reload()
  return true
}

/** Ошибка на странице не роняет весь сайт: шапка и меню остаются, вместо страницы — сообщение. */
export default class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    // Без сети перезагрузка не поможет: ждём, пока сеть вернётся, и тогда загружаем страницу заново.
    if (!navigator.onLine) window.addEventListener('online', () => window.location.reload(), { once: true })
    else if (isChunkError(error)) reloadOnce()
  }

  render() {
    if (!this.state.failed) return this.props.children
    if (!navigator.onLine)
      return (
        <main className="container empty-page" role="alert">
          <h1>Нет интернета</h1>
          <p className="muted">Этот раздел ещё не сохранился на устройстве. Страница откроется сама, когда сеть вернётся, а пока можно открыть то, что уже смотрели.</p>
          <a href="/my-list" className="btn btn--accent">
            Мой список
          </a>
        </main>
      )
    return (
      <main className="container empty-page" role="alert">
        <h1>Не получилось открыть страницу</h1>
        <p className="muted">Возможно, сайт обновился или пропала сеть. Обновите страницу, чтобы загрузить свежую версию.</p>
        <button type="button" className="btn btn--accent" onClick={() => window.location.reload()}>
          Обновить
        </button>
      </main>
    )
  }
}
