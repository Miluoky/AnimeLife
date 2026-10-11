import './offline.css'

/** Плашка над нижним меню: без сети сайт показывает сохранённое, а когда сеть вернулась — говорит об этом. */
export default function OfflineNotice({ back }: { back: boolean }) {
  return (
    <div className={`offline-notice${back ? ' offline-notice--back' : ''}`} role="status" aria-live="polite">
      <span className="offline-notice__dot" aria-hidden="true" />
      {back ? 'Сеть вернулась' : 'Нет сети. Показываем то, что сохранилось на устройстве'}
    </div>
  )
}
