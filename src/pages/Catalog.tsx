import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { loadAllGenres, loadStudios, useAsync, type CatalogOrder, type CatalogQuery } from '../api'
import CatalogGrid from '../components/CatalogGrid'
import MultiPick from '../components/MultiPick'
import { useMyList } from '../data/myList'
import Pager from '../components/Pager'
import { usePageMeta } from '../data/pageMeta'
import { swapLayout } from '../data/keyboard'
import { CATALOG } from '../data/landings'
import { PAGE_SIZE, pageParam } from '../data/seo'
import './catalog.css'

const orders: { id: CatalogOrder; title: string }[] = [
  { id: 'popularity', title: 'Популярные' },
  { id: 'ranked', title: 'С высоким рейтингом' },
  { id: 'aired_on', title: 'Новые' },
  { id: 'name', title: 'По алфавиту' },
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

// Сезон уточняет год: «Лето 2024» — это season=summer_2024 у Shikimori.
const parts = [
  { id: 'winter', title: 'Зима' },
  { id: 'spring', title: 'Весна' },
  { id: 'summer', title: 'Лето' },
  { id: 'fall', title: 'Осень' },
]

const ages = [
  { id: 'g', title: '0+' },
  { id: 'pg', title: '6+' },
  { id: 'pg_13', title: '12+' },
  { id: 'r', title: '16+' },
  { id: 'r_plus', title: '18+' },
]

// Столько тайтлов из своего списка прячем, не больше: иначе адрес запроса станет слишком длинным.
const EXCLUDE_LIMIT = 300

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

/** Короткие фильтры — чипами: выбор виден сразу и меняется одним касанием. */
function ChipFilter({ label, name, value, any, options, onChange }: FilterProps) {
  const all = any ? [{ id: '', title: any }, ...options] : options
  return (
    <div className="chip-filter" role="group" aria-label={label}>
      {all.map((o) => {
        const on = String(o.id) === value
        return (
          <button
            key={o.id}
            type="button"
            className={`pill${on ? ' active' : ''}`}
            aria-pressed={on}
            onClick={() => onChange(name, String(o.id))}
          >
            {o.title}
          </button>
        )
      })}
    </div>
  )
}

/** Каталог с фильтрами. Все фильтры живут в адресе, поэтому подборкой можно поделиться ссылкой. */
export default function Catalog() {
  const [params, setParams] = useSearchParams()
  const genres = useAsync(loadAllGenres, [])
  const studios = useAsync(loadStudios, [])
  const myList = useMyList()

  const search = (params.get('q') ?? '').trim()
  // «yfhenj» вместо «наруто»: предложим тот же текст в другой раскладке, если ничего не нашлось.
  const other = search ? swapLayout(search) : undefined
  const value = (name: string) => params.get(name) ?? ''
  // Страница списка из адреса (?page=3): с неё начинается сетка, ниже ссылки на соседние страницы.
  const page = pageParam(params.get('page'))
  const [first, setFirst] = useState<[number, number]>()
  usePageMeta(
    search ? `Поиск: «${search}»` : `${CATALOG.title}${page > 1 ? `, страница ${page}` : ''}`,
    CATALOG.description,
  )
  useEffect(() => window.scrollTo(0, 0), [page])

  function change(name: string, next: string) {
    const updated = new URLSearchParams(params)
    updated.delete('page')
    if (next) updated.set(name, next)
    else updated.delete(name)
    setParams(updated, { replace: true })
    // Новая подборка начинается сверху, иначе прокрутка сразу подгрузит вторую страницу.
    window.scrollTo({ top: 0 })
  }

  const list = (name: string) => value(name).split(',').filter((v) => /^\d+$/.test(v))
  const year = value('year')
  // Сезон имеет смысл только для одного года, а не для десятилетия.
  const part = /^\d{4}$/.test(year) ? value('part') : ''
  const hideMine = value('hide') === 'mine'
  const query: CatalogQuery = {
    search: search || undefined,
    order: (value('order') as CatalogOrder) || 'popularity',
    status: (value('status') as CatalogQuery['status']) || undefined,
    kind: value('kind') || undefined,
    season: (part ? `${part}_${year}` : year) || undefined,
    score: Number(value('score')) || undefined,
    genre: list('genre').join(',') || undefined,
    // У Shikimori несколько студий значат «все сразу», поэтому выбирается одна.
    studio: list('studio')[0],
    rating: value('age') || undefined,
    excludeIds: hideMine
      ? myList
          .map((e) => e.anime.id)
          .filter((id) => /^\d+$/.test(id))
          .slice(0, EXCLUDE_LIMIT)
      : undefined,
  }

  const filtersSet = ['order', 'status', 'kind', 'year', 'part', 'score', 'genre', 'studio', 'age', 'hide'].some((n) => params.has(n))

  return (
    <main className="container home">
      <section className="stack">
        <div className="section-head">
          <h1 className="page-title">{search ? `Поиск: «${search}»` : CATALOG.h1}</h1>
          {search && (
            <button type="button" className="pill" onClick={() => change('q', '')}>
              Сбросить поиск
            </button>
          )}
        </div>

        <ChipFilter
          label="Сортировка"
          name="order"
          value={value('order') || 'popularity'}
          any=""
          options={orders}
          onChange={(name, v) => change(name, v === 'popularity' ? '' : v)}
        />
        <ChipFilter label="Статус" name="status" value={value('status')} any="Все" options={statuses} onChange={change} />

        <div className="filters" role="group" aria-label="Фильтры каталога">
          <MultiPick
            label="Жанры"
            any="Любые"
            options={genres.value?.data ?? []}
            value={list('genre')}
            onChange={(ids) => change('genre', ids.join(','))}
            searchable
          />
          <Filter label="Тип" name="kind" value={value('kind')} any="Любой" options={kinds} onChange={change} />
          <Filter label="Год" name="year" value={year} any="Любой" options={years} onChange={change} />
          {/^\d{4}$/.test(year) && (
            <Filter label="Сезон" name="part" value={part} any="Весь год" options={parts} onChange={change} />
          )}
          <Filter label="Оценка" name="score" value={value('score')} any="Любая" options={scores} onChange={change} />
          <Filter label="Возраст" name="age" value={value('age')} any="Любой" options={ages} onChange={change} />
          <Filter label="Студия" name="studio" value={list('studio')[0] ?? ''} any="Любая" options={studios.value ?? []} onChange={change} />
          {myList.length > 0 && (
            <label className={`filter filter--check${hideMine ? ' filter--set' : ''}`}>
              <span className="filter__label">Мой список</span>
              <span className="filter__check">
                <input type="checkbox" checked={hideMine} onChange={(e) => change('hide', e.target.checked ? 'mine' : '')} />
                Скрыть добавленные
              </span>
            </label>
          )}
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

        <CatalogGrid key={JSON.stringify(query) + page} query={query} start={page} onFirst={(n) => setFirst([page, n])} />
        {other && first?.[0] === page && first[1] === 0 && (
          <p className="muted">
            Возможно, вы искали{' '}
            <Link className="link-accent" to={`/catalog?q=${encodeURIComponent(other)}`}>
              «{other}»
            </Link>
            : похоже, текст набран не в той раскладке.
          </p>
        )}
        {first?.[0] === page && (
          <Pager
            page={page}
            hasNext={first[1] === PAGE_SIZE}
            href={(n) => {
              const next = new URLSearchParams(params)
              if (n > 1) next.set('page', String(n))
              else next.delete('page')
              const qs = next.toString()
              return qs ? `/catalog?${qs}` : '/catalog'
            }}
          />
        )}
      </section>
    </main>
  )
}
