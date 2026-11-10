import { useId, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import VoiceLogo from './VoiceLogo'
import type { CatalogOrder } from '../api'

export interface VoiceStudioStats {
  releases: number
  founded: number
  rating: string
  type: string
}

export interface VoiceStudio {
  slug: string
  name: string
  russianName: string
  shortName: string
  badge: string
  description: string
  bio: string
  team: string[]
  stats: VoiceStudioStats
  popularTitles: string[]
  aliases: string[]
}

export const VOICE_STUDIOS: VoiceStudio[] = [
  {
    slug: 'anilibria',
    name: 'AniLibria',
    russianName: 'АниЛибрия',
    shortName: 'AL',
    badge: 'Многоголосый закадр',
    description: 'Культовое объединение закадрового озвучивания и дубляжа: скоростные релизы онгоингов, фирменный мастеринг и золотой состав актёров.',
    bio: 'AniLibria Project — крупнейшее некоммерческое объединение любителей анимации в СНГ, основанное в 2011 году. Студия славится непревзойденной скоростью выпуска серий, сохранением оригинальной звуковой дорожки и локализацией надписей.',
    team: ['Lupin', 'Silv', 'Itashi', 'De_Hi', 'Sharon', 'Hekomi', 'Cleo-chan', 'Crowley', 'Namiko', 'Amikiri'],
    stats: { releases: 1540, founded: 2011, rating: '4.9/5', type: 'MVO / DVO' },
    popularTitles: ['Магическая битва', 'Атака титанов', 'Клинок, рассекающий демонов', 'Поднятие уровня в одиночку'],
    aliases: ['anilibria', 'анилибрия', 'ани-либрия', 'aniliberty'],
  },
  {
    slug: 'studio-band',
    name: 'Студийная Банда',
    russianName: 'Студийная Банда',
    shortName: 'SB',
    badge: 'Профессиональный дубляж',
    description: 'Официальные голоса топовых блокбастеров аниме. Безупречный кастинг профессиональных актеров театра и кино, полная локализация опенингов.',
    bio: 'Студийная Банда (Studio Band) — признанные мастера дубляжа в русскоязычном пространстве. Команда привлекает профессиональных актёров дубляжа и музыкантов для аутентичной адаптации японских тайтлов.',
    team: ['Александр Скиданов', 'Вероника Саркисова', 'Анна Мосолова', 'Влад Токарев', 'BalFor', 'Татьяна Борзова', 'Георгий Кармрян'],
    stats: { releases: 420, founded: 2017, rating: '5.0/5', type: 'Полный дубляж' },
    popularTitles: ['Клинок, рассекающий демонов', 'Человек-бензопила', 'Моя геройская академия', 'Семья шпиона'],
    aliases: ['studio-band', 'studioband', 'студийная банда', 'студийнаябанда'],
  },
  {
    slug: 'anidub',
    name: 'AniDUB',
    russianName: 'АниДАБ',
    shortName: 'AD',
    badge: 'Легенда фандаба',
    description: 'Легендарное объединение, на голосах которого выросло целое поколение зрителей. Неподражаемый юмор Анкорда и культовый дуэт Jam & Cuba77.',
    bio: 'AniDUB основан в 2008 году и стал флагманом русского аниме-сообщества. Именно с релизов AniDUB для миллионов зрителей началось знакомство с Наруто, Хвостом Феи, Тетрадью Смерти и Гуррен-Лаганном.',
    team: ['Анкорд', 'Jam', 'Cuba77', 'Торвальдур', 'Trina_D', 'Гарик', 'MezIdA'],
    stats: { releases: 2280, founded: 2008, rating: '4.8/5', type: 'MVO / DVO' },
    popularTitles: ['Хвост Феи', 'Наруто', 'Гуррен-Лаганн', 'Блич', 'Врата Штейна'],
    aliases: ['anidub', 'анидаб', 'анкорд'],
  },
  {
    slug: 'shiza-project',
    name: 'SHIZA Project',
    russianName: 'ШИЗА Проджект',
    shortName: 'SP',
    badge: 'Многоголосая озвучка',
    description: 'Душевные и выверенные переводы с особым вниманием к деталям первоисточника, юмору и японскому колориту.',
    bio: 'SHIZA Project — одна из старейших творческих групп русского фандаба, начавшая путь в 2008 году. Их озвучка отличается академической вычиткой субтитров и мягким, гармоничным сведением звука.',
    team: ['Михаил Глушковский', 'Дьявол', 'Лира', 'Тёмка', 'Chikipibarum', 'Say', 'Valery'],
    stats: { releases: 980, founded: 2008, rating: '4.7/5', type: 'MVO' },
    popularTitles: ['Этот замечательный мир!', 'Гинтама', 'Бездомный бог', 'Токийский гуль'],
    aliases: ['shiza-project', 'shizaproject', 'шиза', 'shiza'],
  },
  {
    slug: 'dream-cast',
    name: 'Dream Cast',
    russianName: 'Дрим Каст',
    shortName: 'DC',
    badge: 'Скоростной даб',
    description: 'Быстрые и драйвовые релизы онгоингов. Сочные эмоции, качественный звук и молодой энергичный каст.',
    bio: 'Dream Cast динамично завоевал популярность благодаря оперативности и современному подходу к звуку. Команда регулярно входит в топы по скорости выпуска свежих серий сезона.',
    team: ['Rain.Death', 'Connie', 'Sharon', 'White', 'Kari', 'Ray', 'Nika Lenina'],
    stats: { releases: 810, founded: 2016, rating: '4.8/5', type: 'MVO' },
    popularTitles: ['Реинкарнация безработного', 'Доктор Стоун', 'О моём перерождении в слизь'],
    aliases: ['dream-cast', 'dreamcast', 'дрим каст', 'дримкаст'],
  },
  {
    slug: 'kansai',
    name: 'Kansai Studio',
    russianName: 'Кансай',
    shortName: 'KS',
    badge: 'Студийный дубляж',
    description: 'Кинематографическое сведение звука, актеры театров и профессиональные дикторы радиовещания.',
    bio: 'Kansai Studio знаменита филигранной укладкой текста и кинематографическим балансом речи. Озвучка Kansai создает ощущение полноценного кинотеатрального релиза.',
    team: ['Дмитрий Зубарев', 'Екатерина Дмитрова', 'Сергей Пономарев', 'Александр Байсаров', 'Полина Ртищева'],
    stats: { releases: 480, founded: 2010, rating: '4.9/5', type: 'Дубляж / MVO' },
    popularTitles: ['Психопаспорт', 'Паразит: Учение о жизни', 'Вайолет Эвергарден'],
    aliases: ['kansai', 'kansai-studio', 'кансай'],
  },
  {
    slug: 'reanimedia',
    name: 'Реанимедиа',
    russianName: 'Реанимедиа',
    shortName: 'RM',
    badge: 'Лицензионный дубляж',
    description: 'Золотой фонд дубляжа японской анимации. Лицензионная классика Хаяо Миядзаки, Макото Синкая и культовых сериалов.',
    bio: 'Компания «Реанимедиа» — первопроходец официального лицензионного кинопроката аниме в России. Дубляж Реанимедиа признан эталоном отечественной школы дубляжа зарубежной анимации.',
    team: ['Александр Фильченко', 'Влад Копп', 'Николай Быстров', 'Валерий Сторожик', 'Людмила Ильина'],
    stats: { releases: 170, founded: 2006, rating: '5.0/5', type: 'Полный дубляж' },
    popularTitles: ['Гуррен-Лаганн', 'Волчица и пряности', 'Меланхолия Харухи Судзумии', 'Твоё имя'],
    aliases: ['reanimedia', 're-anime', 'реанимедиа', 'reanime'],
  },
  {
    slug: 'amber',
    name: 'Amber',
    russianName: 'Эмбер',
    shortName: 'AB',
    badge: 'Командная озвучка',
    description: 'Творческое объединение с чистым ламповым звуком и регулярными переводами романтики, фэнтези и повседневности.',
    bio: 'Amber объединяет молодых талантливых дабберов, которые делают упор на естественную интонацию и эмоциональную искренность персонажей.',
    team: ['Amber Voice Team', 'Ksenia', 'Alex', 'Dron', 'Lana'],
    stats: { releases: 290, founded: 2019, rating: '4.7/5', type: 'MVO' },
    popularTitles: ['Хоримия', 'Эта фарфоровая кукла влюбилась', 'Ангел по соседству'],
    aliases: ['amber', 'эмбер'],
  },
  {
    slug: 'flarrow-films',
    name: 'Flarrow Films',
    russianName: 'Флэрроу Филмс',
    shortName: 'FF',
    badge: 'Профессиональная озвучка',
    description: 'Студия дубляжа и озвучивания с участием звезд российского кинематографического дубляжа.',
    bio: 'Flarrow Films создает дубляжи мирового уровня с привлечением топовых актеров кино. Их работы отличаются высоким качеством звуковой дорожки и точностью перевода.',
    team: ['Flarrow Cast', 'Данил Щебланов', 'Михаил Тихонов', 'Иван Жарков'],
    stats: { releases: 340, founded: 2018, rating: '4.9/5', type: 'Дубляж / MVO' },
    popularTitles: ['Аркейн', 'Киберпанк: Бегущие по краю', 'Ванпанчмен'],
    aliases: ['flarrow-films', 'flarrow', 'флэрроу'],
  },
  {
    slug: 'animevost',
    name: 'AnimeVost',
    russianName: 'АнимеВост',
    shortName: 'AV',
    badge: 'Оперативный закадр',
    description: 'Самая масштабная база озвученных тайтлов в Рунете: синхронный двухголосый и многоголосый закадр с рекордной скоростью выхода.',
    bio: 'AnimeVost перевел практически всё аниме, выходившее за последние пятнадцать лет. Тысячи завершенных сериалов и фильмов доступны зрителям благодаря их неустанной работе.',
    team: ['Vost Team', 'Гамлетка Цезаревна', 'Heavy', 'DVO Team'],
    stats: { releases: 3650, founded: 2012, rating: '4.6/5', type: 'DVO / MVO' },
    popularTitles: ['Ван-Пис', 'Чёрный клевер', 'Сказка о хвосте феи', 'Боруто'],
    aliases: ['animevost', 'vost', 'анимевост', 'вост'],
  },
]

export function getAllVoiceStudios(): VoiceStudio[] {
  return VOICE_STUDIOS
}

export function getVoiceStudioBySlug(slug: string): VoiceStudio | undefined {
  const normSlug = (slug || '').toLowerCase().trim()
  if (!normSlug) return undefined
  return VOICE_STUDIOS.find(
    (s) => s.slug === normSlug || s.aliases.some((a) => a === normSlug),
  )
}

export const GENRE_FILTER_OPTIONS: { id: string; title: string }[] = [
  { id: '', title: 'Все жанры' },
  { id: '1', title: 'Экшен' },
  { id: '2', title: 'Приключения' },
  { id: '4', title: 'Комедия' },
  { id: '8', title: 'Драма' },
  { id: '10', title: 'Фэнтези' },
  { id: '22', title: 'Романтика' },
  { id: '24', title: 'Фантастика' },
  { id: '7', title: 'Детектив' },
  { id: '14', title: 'Ужасы' },
  { id: '41', title: 'Триллер' },
  { id: '40', title: 'Психологическое' },
  { id: '36', title: 'Повседневность' },
  { id: '37', title: 'Сверхъестественное' },
  { id: '23', title: 'Школа' },
  { id: '30', title: 'Спорт' },
  { id: '18', title: 'Меха' },
  { id: '27', title: 'Сёнен' },
  { id: '42', title: 'Сэйнэн' },
]

export const STATUS_FILTER_OPTIONS: { id: '' | 'ongoing' | 'released' | 'anons'; title: string }[] = [
  { id: '', title: 'Все статусы' },
  { id: 'ongoing', title: 'Онгоинги' },
  { id: 'released', title: 'Вышедшие' },
  { id: 'anons', title: 'Анонсы' },
]

export const ORDER_OPTIONS: { id: CatalogOrder; title: string }[] = [
  { id: 'popularity', title: 'По популярности' },
  { id: 'ranked', title: 'По рейтингу' },
  { id: 'aired_on', title: 'По дате выхода' },
  { id: 'name', title: 'По названию' },
]

export interface VoiceoverFilterProps {
  selectedStudio?: string
  selectedGenre?: string
  selectedStatus?: 'ongoing' | 'released' | 'anons' | ''
  selectedOrder?: CatalogOrder
  searchQuery?: string
  onStudioChange?: (slug: string) => void
  onGenreChange?: (genreId: string) => void
  onStatusChange?: (status: 'ongoing' | 'released' | 'anons' | '') => void
  onOrderChange?: (order: CatalogOrder) => void
  onSearchChange?: (query: string) => void
  onReset?: () => void
  showStudioSelector?: boolean
  linkStudioChips?: boolean
  className?: string
}

export default function VoiceoverFilter({
  selectedStudio = '',
  selectedGenre = '',
  selectedStatus = '',
  selectedOrder = 'popularity',
  searchQuery = '',
  onStudioChange,
  onGenreChange,
  onStatusChange,
  onOrderChange,
  onSearchChange,
  onReset,
  showStudioSelector = true,
  linkStudioChips = false,
  className = '',
}: VoiceoverFilterProps) {
  const genreId = useId()
  const statusId = useId()
  const orderId = useId()

  const hasActiveFilters = Boolean(
    selectedGenre || selectedStatus || (selectedOrder && selectedOrder !== 'popularity') || searchQuery,
  )

  const filterContainerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: '16px',
    padding: '16px',
    margin: '12px 0 24px',
    boxShadow: '0 8px 32px rgb(0 0 0 / 0.25)',
  }

  const chipsScrollStyle: CSSProperties = {
    display: 'flex',
    gap: '8px',
    overflowX: 'auto',
    paddingBottom: '6px',
    scrollbarWidth: 'thin',
    WebkitOverflowScrolling: 'touch',
  }

  const controlsRowStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
  }

  const selectWrapStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: '1 1 180px',
    minWidth: '140px',
  }

  const labelStyle: CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }

  const selectStyle: CSSProperties = {
    height: '42px',
    padding: '0 12px',
    borderRadius: '8px',
    border: '1px solid var(--line)',
    background: 'var(--surface-2)',
    color: 'var(--text)',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
    cursor: 'pointer',
    transition: 'border-color 0.2s ease',
  }

  const inputStyle: CSSProperties = {
    ...selectStyle,
    cursor: 'text',
  }

  return (
    <div className={`voiceover-filter ${className}`} style={filterContainerStyle} role="search" aria-label="Фильтры озвучки">
      {showStudioSelector && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={labelStyle}>Студии озвучки</span>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{VOICE_STUDIOS.length} команд</span>
          </div>
          <div style={chipsScrollStyle}>
            {VOICE_STUDIOS.map((studio) => {
              const isSelected = selectedStudio === studio.slug
              const chipStyle: CSSProperties = {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px 6px 8px',
                borderRadius: '999px',
                fontSize: '13px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                border: isSelected ? '1px solid var(--accent)' : '1px solid var(--line)',
                background: isSelected ? 'color-mix(in srgb, var(--accent) 18%, var(--surface-2))' : 'var(--surface-2)',
                color: isSelected ? '#fff' : 'var(--text-soft)',
                boxShadow: isSelected ? 'var(--glow-accent)' : 'none',
              }

              if (linkStudioChips) {
                return (
                  <Link key={studio.slug} to={`/voice/${studio.slug}`} style={chipStyle} title={studio.name}>
                    <VoiceLogo title={studio.name} size={22} />
                    <span>{studio.name}</span>
                  </Link>
                )
              }

              return (
                <button
                  key={studio.slug}
                  type="button"
                  style={chipStyle}
                  onClick={() => onStudioChange?.(studio.slug)}
                  aria-pressed={isSelected}
                  title={studio.name}
                >
                  <VoiceLogo title={studio.name} size={22} />
                  <span>{studio.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div style={controlsRowStyle}>
        {/* Genre Filter */}
        <div style={selectWrapStyle}>
          <label htmlFor={genreId} style={labelStyle}>
            Жанр
          </label>
          <select
            id={genreId}
            value={selectedGenre}
            onChange={(e) => onGenreChange?.(e.target.value)}
            style={selectStyle}
          >
            {GENRE_FILTER_OPTIONS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div style={selectWrapStyle}>
          <label htmlFor={statusId} style={labelStyle}>
            Статус
          </label>
          <select
            id={statusId}
            value={selectedStatus}
            onChange={(e) => onStatusChange?.(e.target.value as 'ongoing' | 'released' | 'anons' | '')}
            style={selectStyle}
          >
            {STATUS_FILTER_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>

        {/* Sort Order */}
        <div style={selectWrapStyle}>
          <label htmlFor={orderId} style={labelStyle}>
            Сортировка
          </label>
          <select
            id={orderId}
            value={selectedOrder}
            onChange={(e) => onOrderChange?.(e.target.value as CatalogOrder)}
            style={selectStyle}
          >
            {ORDER_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </div>

        {/* Search Query Input */}
        {onSearchChange && (
          <div style={selectWrapStyle}>
            <label style={labelStyle}>Поиск тайтла</label>
            <input
              type="text"
              placeholder="Название аниме…"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              style={inputStyle}
            />
          </div>
        )}

        {/* Reset button */}
        {hasActiveFilters && onReset && (
          <div style={{ alignSelf: 'flex-end', paddingBottom: '2px' }}>
            <button
              type="button"
              onClick={onReset}
              className="btn btn--ghost"
              style={{
                height: '42px',
                padding: '0 16px',
                fontSize: '13px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Сбросить все фильтры"
            >
              <span>✕</span>
              <span>Сбросить</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
