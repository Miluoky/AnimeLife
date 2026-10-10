import { Suspense, lazy } from 'react'
import { Link } from 'react-router-dom'
import { usePageMeta } from '../data/pageMeta'
import { CatalogShelf } from '../components/HomeShelves'
import { SparkIcon } from '../components/Icons'
import type { CatalogQuery } from '../api'
import './top.css'

interface Collection {
  title: string
  subtitle: string
  query: Omit<CatalogQuery, 'page' | 'limit'>
  /** та же подборка в каталоге, с фильтрами */
  catalog: string
}

/** Подборки на вечер: каждая — запрос к каталогу Shikimori, «Все» ведёт в каталог с теми же фильтрами. */
const COLLECTIONS: Collection[] = [
  {
    title: 'С чего начать знакомство с аниме',
    subtitle: 'Популярные сериалы с оценкой от 8: их смотрели миллионы',
    query: { kind: 'tv', score: 8, order: 'popularity' },
    catalog: '/catalog?kind=tv&score=8',
  },
  {
    title: 'Шедевры в полном метре',
    subtitle: 'Аниме-фильмы с самыми высокими оценками',
    query: { kind: 'movie', order: 'ranked' },
    catalog: '/catalog?kind=movie&order=ranked',
  },
  {
    title: 'Лучшие онгоинги',
    subtitle: 'Выходят прямо сейчас и уже нравятся зрителям',
    query: { status: 'ongoing', order: 'ranked' },
    catalog: '/catalog?status=ongoing&order=ranked',
  },
  {
    title: 'Психологические триллеры',
    subtitle: 'Напряжение, загадки и игры разума',
    query: { genre: '40,41', order: 'ranked' },
    catalog: '/catalog?genre=40%2C41&order=ranked',
  },
  {
    title: 'Комедии без романтики',
    subtitle: 'Просто посмеяться, без любовных линий',
    query: { genre: '4,!22', order: 'popularity', score: 7 },
    catalog: '/catalog?genre=4&nogenre=22&score=7',
  },
  {
    title: 'Фэнтези-приключения',
    subtitle: 'Другие миры, магия и долгие походы',
    query: { genre: '10,2', order: 'ranked' },
    catalog: '/catalog?genre=10%2C2&order=ranked',
  },
  {
    title: 'Сэйнэн',
    subtitle: 'Взрослые истории: сложные герои и серьёзные темы',
    query: { genre: '42', order: 'ranked' },
    catalog: '/catalog?genre=42&order=ranked',
  },
  {
    title: 'Классика 90-х',
    subtitle: 'То, с чего многие начинали',
    query: { season: '1990_1999', order: 'ranked' },
    catalog: '/catalog?year=1990_1999&order=ranked',
  },
  {
    title: 'Лучшее из нулевых',
    subtitle: 'Тайтлы 2000-х, которые до сих пор советуют',
    query: { season: '2000_2009', order: 'ranked' },
    catalog: '/catalog?year=2000_2009&order=ranked',
  },
]

// Подборки зрителей тянут SDK Appwrite: отдельной частью, готовые полки показываются сразу.
const UserCollectionsShelf = lazy(() => import('./UserCollections').then((m) => ({ default: m.UserCollectionsShelf })))

export default function Collections() {
  usePageMeta('Подборки аниме', 'Подборки аниме на вечер: с чего начать, лучшие фильмы, психологические триллеры, комедии, фэнтези, классика 90-х и 2000-х.')
  return (
    <main className="container top-page">
      <header className="top-head">
        <span className="top-head__icon" aria-hidden="true">
          <SparkIcon size={24} />
        </span>
        <div>
          <h1 className="page-title">Подборки</h1>
          <p className="muted top-head__lead">
            Готовые списки на вечер. Не нашли своё? Загляните в <Link to="/top" className="link-accent">Топ-100</Link> или{' '}
            <Link to="/random" className="link-accent">случайный выбор</Link>.
          </p>
        </div>
      </header>
      <Suspense fallback={null}>
        <UserCollectionsShelf />
      </Suspense>
      {COLLECTIONS.map((c) => (
        <CatalogShelf key={c.title} title={c.title} subtitle={c.subtitle} icon={<SparkIcon size={18} />} query={c.query} more={c.catalog} />
      ))}
    </main>
  )
}
