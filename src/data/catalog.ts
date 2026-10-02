export interface Anime {
  id: string
  title: string
  originalTitle?: string
  year?: number
  kind: string
  episodes?: number
  episodesAired?: number
  episodeMinutes?: number
  studio?: string
  season?: string
  genres: string[]
  ongoing: boolean
  /** анонс: ещё не вышло ни одной серии */
  upcoming?: boolean
  description: string
  score?: number
  posterUrl?: string
  posterFill: string
  trailerUrl?: string
}

/** Поля, которых хватает для карточки в сетке. */
export type AnimeCard = Pick<
  Anime,
  'id' | 'title' | 'year' | 'kind' | 'episodes' | 'ongoing' | 'score' | 'posterUrl' | 'posterFill'
>

// Демо-данные: показываются, если API Shikimori недоступно.
export const demoCatalog: Anime[] = [
  {
    id: 'frieren',
    title: 'Провожающая в последний путь Фрирен',
    originalTitle: 'Sousou no Frieren',
    year: 2023,
    kind: 'ТВ-сериал',
    episodes: 28,
    episodeMinutes: 24,
    studio: 'Madhouse',
    season: 'Осень 2023',
    genres: ['Фэнтези', 'Приключения', 'Драма'],
    ongoing: false,
    description:
      'Герои победили Короля демонов, и для эльфийки-мага Фрирен это лишь миг в её долгой жизни. Спустя годы она отправляется в новое путешествие, чтобы понять людей, с которыми шла рядом.',
    posterFill: '#1e2638',
  },
  {
    id: 'jujutsu-kaisen',
    title: 'Магическая битва',
    year: 2020,
    kind: 'ТВ-сериал',
    episodes: 24,
    genres: ['Сёнэн', 'Фэнтези'],
    ongoing: false,
    description:
      'Юдзи Итадори попадает в мир проклятий и магов, когда проглатывает палец легендарного проклятия Сукуны.',
    posterFill: '#2b2340',
  },
  {
    id: 'chainsaw-man',
    title: 'Человек-бензопила',
    year: 2022,
    kind: 'ТВ-сериал',
    episodes: 12,
    genres: ['Сёнэн', 'Экшен'],
    ongoing: false,
    description:
      'Дэндзи заключает контракт с демоном-бензопилой и становится охотником на демонов.',
    posterFill: '#1e3140',
  },
  {
    id: 'vinland-saga',
    title: 'Сага о Винланде',
    year: 2019,
    kind: 'ТВ-сериал',
    episodes: 24,
    genres: ['Приключения', 'Драма'],
    ongoing: false,
    description:
      'История Торфинна, сына великого воина, на фоне эпохи викингов.',
    posterFill: '#24332a',
  },
  {
    id: 'spy-family',
    title: 'Семья шпиона',
    year: 2022,
    kind: 'ТВ-сериал',
    genres: ['Комедия', 'Экшен'],
    ongoing: true,
    description:
      'Шпион, киллер и телепат притворяются обычной семьёй, не зная секретов друг друга.',
    posterFill: '#3a2430',
  },
  {
    id: 'demon-slayer',
    title: 'Клинок, рассекающий демонов',
    year: 2019,
    kind: 'ТВ-сериал',
    episodes: 26,
    genres: ['Сёнэн', 'Фэнтези'],
    ongoing: false,
    description:
      'Тандзиро становится охотником на демонов, чтобы спасти сестру и отомстить за семью.',
    posterFill: '#3a3122',
  },
  {
    id: 'cowboy-bebop',
    title: 'Ковбой Бибоп',
    year: 1998,
    kind: 'ТВ-сериал',
    episodes: 26,
    genres: ['Фантастика', 'Экшен'],
    ongoing: false,
    description:
      'Команда охотников за головами скитается по космосу на корабле «Бибоп».',
    posterFill: '#26283f',
  },
  {
    id: 'steins-gate',
    title: 'Врата Штейна',
    year: 2011,
    kind: 'ТВ-сериал',
    episodes: 24,
    genres: ['Фантастика', 'Триллер'],
    ongoing: false,
    description:
      'Самопровозглашённый безумный учёный случайно изобретает способ отправлять сообщения в прошлое.',
    posterFill: '#2b2340',
  },
  {
    id: 'attack-on-titan',
    title: 'Атака титанов',
    year: 2013,
    kind: 'ТВ-сериал',
    episodes: 25,
    genres: ['Сёнэн', 'Драма'],
    ongoing: false,
    description:
      'Человечество прячется за стенами от титанов, пока Эрен Йегер не решает изменить всё.',
    posterFill: '#1e3140',
  },
  {
    id: 'solo-leveling',
    title: 'Поднятие уровня в одиночку',
    year: 2024,
    kind: 'ТВ-сериал',
    genres: ['Сёнэн', 'Фэнтези'],
    ongoing: true,
    description:
      'Слабейший охотник Сон Джин-У получает возможность становиться сильнее без предела.',
    posterFill: '#24332a',
  },
  {
    id: 'one-piece',
    title: 'Ван-Пис',
    year: 1999,
    kind: 'ТВ-сериал',
    genres: ['Сёнэн', 'Приключения'],
    ongoing: true,
    description:
      'Монки Д. Луффи собирает команду, чтобы найти величайшее сокровище и стать королём пиратов.',
    posterFill: '#3a2430',
  },
  {
    id: 'your-name',
    title: 'Твоё имя',
    year: 2016,
    kind: 'Фильм',
    genres: ['Романтика', 'Драма'],
    ongoing: false,
    description:
      'Школьники Таки и Мицуха начинают загадочным образом меняться телами.',
    posterFill: '#26283f',
  },
]

export const demoGenres = ['Сёнэн', 'Фэнтези', 'Романтика', 'Комедия', 'Драма'].map((title, id) => ({ id: -(id + 1), title }))

export function getDemoAnime(id: string): Anime | undefined {
  return demoCatalog.find((a) => a.id === id)
}

/** Сколько серий можно выбрать в списке: для онгоинга только вышедшие. */
export function episodeCount(anime: Anime): number {
  if (anime.ongoing && anime.episodesAired) return anime.episodesAired
  return anime.episodes ?? anime.episodesAired ?? 1
}
