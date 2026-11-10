/**
 * Общий poller для Core live-эндпоинтов (rooms/chat/voice):
 * — пока вкладка скрыта, тики не планируются (пауза);
 * — при возврате — короткий backoff, потом обычный интервал.
 */

export type VisibilityPollOptions = {
  /** Интервал при видимой вкладке. */
  intervalMs: number
  /** true → остановить планирование. */
  stopped: () => boolean
  /** Пауза перед первым тиком после visibility=visible. */
  resumeBackoffMs?: number
}

const DEFAULT_RESUME_BACKOFF_MS = 1200

export function startVisibilityPoll(
  tick: () => void | Promise<void>,
  { intervalMs, stopped, resumeBackoffMs = DEFAULT_RESUME_BACKOFF_MS }: VisibilityPollOptions,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined

  const clear = () => {
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timer = undefined
    }
  }

  const run = async () => {
    if (stopped() || document.hidden) return
    await tick()
    if (!stopped() && !document.hidden) schedule(intervalMs)
  }

  const schedule = (delayMs: number) => {
    clear()
    if (stopped() || document.hidden) return
    timer = window.setTimeout(() => {
      timer = undefined
      void run()
    }, delayMs)
  }

  const onVis = () => {
    if (stopped()) return
    clear()
    if (document.hidden) return
    schedule(resumeBackoffMs)
  }

  void Promise.resolve(tick()).then(() => {
    if (!stopped() && !document.hidden) schedule(intervalMs)
  })
  document.addEventListener('visibilitychange', onVis)

  return () => {
    clear()
    document.removeEventListener('visibilitychange', onVis)
  }
}
