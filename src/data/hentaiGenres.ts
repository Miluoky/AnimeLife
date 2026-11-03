export interface HentaiTag {
  id: string
  name: string
  slug: string
  shikiGenreId?: number
}

export const HENTAI_TAGS: HentaiTag[] = [
  { id: 'vanilla', name: 'Ваниль', slug: 'vanilla' },
  { id: 'uncensored', name: 'Без цензуры', slug: 'uncensored' },
  { id: 'romance', name: 'Романтика', slug: 'romance', shikiGenreId: 22 },
  { id: 'school', name: 'Школа / Студентки', slug: 'school', shikiGenreId: 23 },
  { id: 'milf', name: 'Милфы / Зрелые', slug: 'milf' },
  { id: 'maid', name: 'Горничные', slug: 'maid' },
  { id: 'fantasy', name: 'Фэнтези', slug: 'fantasy', shikiGenreId: 10 },
  { id: 'demons', name: 'Демоны / Суккубы', slug: 'demons', shikiGenreId: 6 },
  { id: 'tentacles', name: 'Тентакли', slug: 'tentacles' },
  { id: 'elves', name: 'Эльфийки', slug: 'elves' },
  { id: 'tsundere', name: 'Цундере', slug: 'tsundere' },
  { id: 'harem', name: 'Гарем', slug: 'harem', shikiGenreId: 35 },
  { id: '3d', name: '3D Анимация', slug: '3d' },
  { id: 'yuri', name: 'Юри', slug: 'yuri', shikiGenreId: 26 },
  { id: 'yaoi', name: 'Яой', slug: 'yaoi', shikiGenreId: 28 },
  { id: 'incest', name: 'Инцест', slug: 'incest' },
  { id: 'bdsm', name: 'БДСМ', slug: 'bdsm' },
  { id: 'office', name: 'Секретарши / Офис', slug: 'office' },
  { id: 'cosplay', name: 'Косплей', slug: 'cosplay' },
  { id: 'monster', name: 'Монстродевы', slug: 'monster' },
  { id: 'futanari', name: 'Футанари', slug: 'futanari' },
  { id: 'cheerleader', name: 'Чирлидерши', slug: 'cheerleader' },
  { id: 'comedy', name: 'Комедия', slug: 'comedy', shikiGenreId: 4 },
  { id: 'supernatural', name: 'Сверхъестественное', slug: 'supernatural', shikiGenreId: 37 },
]

export const HENTAI_STUDIOS = [
  'PoRO',
  'Bunnywalker',
  'Pink Pineapple',
  'Mary Jane',
  'Seven',
  'MS Pictures',
  'Collaboration Works',
  'Discovery',
  'Queen Bee',
  'T-Rex',
  'Natural High',
  'Office Takeout',
  'Green Bunny',
  'Arms',
  'Mousou Senka',
]

export const HENTAI_SORTS = [
  { id: 'popularity', title: 'По популярности' },
  { id: 'ranked', title: 'По оценкам' },
  { id: 'aired_on', title: 'По дате выхода' },
  { id: 'name', title: 'По названию' },
] as const

export const HENTAI_YEARS = [
  { id: '2025_2026', title: '2025–2026' },
  { id: '2023_2024', title: '2023–2024' },
  { id: '2020_2022', title: '2020–2022' },
  { id: '2015_2019', title: '2015–2019' },
  { id: '2010_2014', title: '2010–2014' },
  { id: '2000_2009', title: '2000–2009' },
  { id: '1990_1999', title: '1990-е' },
]
