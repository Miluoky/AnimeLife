import { useSearchParams } from 'react-router-dom'
import { loadAllGenres, useAsync, type CatalogOrder, type CatalogQuery } from '../api'
import CatalogGrid from '../components/CatalogGrid'
import { usePageMeta } from '../data/pageMeta'

const orders: { id: CatalogOrder; title: string }[] = [
  { id: 'popularity', title: 'Популярные' },
  { id: 'ranked', title: 'С высоким рейтингом' },
  { id: 'aired_on', title: 'Новые' },
]

const statuses = [
  { id: 'ongoing', title: 'Онгоинг' },
  { id: 'released', title: 'Вышел' },
  { id: 'anons', title: 'Анонс' },
]

const kinds = [
  { id: 'tv', title: 'ТВ-сериал' },
  { id: 'movie', title: 'Фильм' },
  { id: 'ova', title: 'OVA' },
  { id: 'ona', title: 'ONA' },
  { id: 'special', title: 'Спешл' },
]

const thisYear = new Date().getFullYear()
const years = [
  ...Array.from({ length: thisYear - 2009 }, (_, i) => String(thisYear + 1 - i)).map((y) => ({ id: y, title: y })),
  { id: '2000_2009', title: '2000-е' },
  { id: '1990_1999', title: '1990-е' },
  { id: '1917_1989', title: 'До 1990' },
]

const scores = [
  { id: '8', title: 'от 8' },
  { id: '7', title: 'от 7' },
  { id: '6', title: 'от 6' },
]

interface FilterProps {
  label: string
  name: string
  value: string
  any: string
  options: { id: string | number; title: string }[]
  onChange: (name: string, value: string) => void
}

function Filter({ label, name, value, any, options, onChange }: FilterProps) {
  return (
    <label className={`filter${value ? ' filter--set' : ''}`}>
      <span className="filter__label">{label}</span>
      <select value={value} onChange={(e) => onChange(name, e.target.value)}>
        {any && <option value="">{any}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Каталог с фильтрами. Все фильтры живут в адресе, поэтому подборкой можно поделиться ссылкой. */
export default function Catalog() {
  usePageMeta('Каталог аниме')
  const [params, setParams] = useSearchParams()
  const genres = useAsync(loadAllGenres, [])

  const search = (params.get('q') ?? '').trim()
  const value = (name: string) => params.get(name) ?? ''

  function change(name: string, next: string) {
    const updated = new URLSearchParams(params)
    if (next) updated.set(name, next)
    else updated.delete(name)
    setParams(updated, { replace: true })
    // Новая подборка начинается сверху, иначе прокрутка сразу подгрузит вторую страницу.
    window.scrollTo({ top: 0 })
  }

  const query: CatalogQuery = {
    search: search || undefined,
    order: (value('order') as CatalogOrder) || 'popularity',
    status: (value('status') as CatalogQuery['status']) || undefined,
    kind: value('kind') || undefined,
    season: value('year') || undefined,
    score: Number(value('score')) || undefined,
    genre: Number(value('genre')) || undefined,
  }

  const filtersSet = ['order', 'status', 'kind', 'year', 'score', 'genre'].some((n) => params.has(n))

  return (
    <main className="container home">
      <section className="stack">
        <div className="section-head">
          <h1 className="page-title">{search ? `Поиск: «${search}»` : 'Каталог'}</h1>
          {search && (
            <button type="button" className="pill" onClick={() => change('q', '')}>
              Сбросить поиск
            </button>
          )}
        </div>

        <div className="filters" role="group" aria-label="Фильтры каталога">
          <Filter
            label="Сортировка"
            name="order"
            value={value('order')}
            any=""
            options={orders}
            onChange={change}
          />
          <Filter
            label="Жанр"
            name="genre"
            value={value('genre')}
            any="Любой"
            options={genres.value?.data ?? []}
            onChange={change}
          />
          <Filter label="Тип" name="kind" value={value('kind')} any="Любой" options={kinds} onChange={change} />
          <Filter label="Статус" name="status" value={value('status')} any="Любой" options={statuses} onChange={change} />
          <Filter label="Год" name="year" value={value('year')} any="Любой" options={years} onChange={change} />
          <Filter label="Оценка" name="score" value={value('score')} any="Любая" options={scores} onChange={change} />
          {filtersSet && (
            <button
              type="button"
              className="pill"
              onClick={() => setParams(search ? { q: search } : {}, { replace: true })}
            >
              Сбросить фильтры
            </button>
          )}
        </div>

        <CatalogGrid key={JSON.stringify(query)} query={query} />
      </section>
    </main>
  )
}
