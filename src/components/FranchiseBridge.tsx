import { Link } from 'react-router-dom'
import { mangaProgressStore, type ReadProgress } from '../data/mangaProgress'
import { listStatuses, useMyListEntry } from '../data/myList'
import './franchise-bridge.css'

type MangaProps = {
  kind: 'manga'
  title: string
  href: string
  mangaId: string
  relation?: string
}

type AnimeProps = {
  kind: 'anime'
  title: string
  href: string
  animeId: string
  relation?: string
}

/** Компактный мост франшизы: со страницы аниме — к манге, со страницы манги — к аниме. */
export default function FranchiseBridge(props: MangaProps | AnimeProps) {
  if (props.kind === 'manga') return <MangaBridge {...props} />
  return <AnimeBridge {...props} />
}

function readLine(p: ReadProgress | undefined) {
  if (!p) return ''
  const head = p.num ? `Глава ${p.num}` : 'Есть закладка'
  const page = p.page && p.page > 1 ? `, стр. ${p.page}` : ''
  return `${head}${page}`
}

function MangaBridge({ title, href, mangaId, relation }: MangaProps) {
  const progress = mangaProgressStore.use()[mangaId]
  const line = readLine(progress)
  const continueTo = progress?.chapterId
    ? `/manga/${mangaId}/chapter/${progress.chapterId}?lang=${encodeURIComponent(progress.lang)}`
    : undefined
  return (
    <article className="franchise-bridge">
      <div className="franchise-bridge__text">
        <span className="franchise-bridge__label">Читать мангу</span>
        <Link to={href} className="franchise-bridge__title link-accent">
          {title}
        </Link>
        {(relation || line) && (
          <p className="muted">
            {relation}
            {relation && line ? ' · ' : ''}
            {line}
          </p>
        )}
      </div>
      <Link to={continueTo ?? href} className="btn btn--accent btn--small">
        {continueTo ? 'Продолжить' : 'Читать мангу'}
      </Link>
    </article>
  )
}

function AnimeBridge({ title, href, animeId, relation }: AnimeProps) {
  const entry = useMyListEntry(animeId)
  const status = entry ? listStatuses.find((s) => s.id === entry.status)?.title : undefined
  const watched = entry?.watched
  const progress = [status, watched ? `${watched} сер.` : ''].filter(Boolean).join(' · ')
  return (
    <article className="franchise-bridge">
      <div className="franchise-bridge__text">
        <span className="franchise-bridge__label">Смотреть аниме</span>
        <Link to={href} className="franchise-bridge__title link-accent">
          {title}
        </Link>
        {(relation || progress) && (
          <p className="muted">
            {relation}
            {relation && progress ? ' · ' : ''}
            {progress}
          </p>
        )}
      </div>
      <Link to={href} className="btn btn--accent btn--small">
        Смотреть аниме
      </Link>
    </article>
  )
}
