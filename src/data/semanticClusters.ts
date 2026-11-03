/**
 * Semantic Keyword & Intent Clusters for AnimeLife 2.0
 * 
 * Maps anime genres, themes, voiceover studios, chronologies, and tropes
 * to high-converting low-frequency (LF) and mid-frequency (MF) Russian search clusters:
 * - «смотреть онлайн бесплатно»
 * - «в хорошем качестве 1080p»
 * - «в озвучке [Студия]»
 * - «все серии подряд»
 * - «порядок просмотра и хронология»
 * 
 * Implements circular cross-linking (кольцевая перелинковка) to eliminate orphan pages
 * and distribute internal PageRank evenly across deep landing pages.
 */

export type SearchIntent =
  | 'watch_free'
  | 'quality_hd'
  | 'dubbing_studio'
  | 'binge_watch'
  | 'chronology_order'
  | 'trope_discovery'

export interface SemanticClusterItem {
  id: string
  intent: SearchIntent
  anchorText: string
  targetPath: string
  title: string
  description: string
  keywords: string[]
  badge: string
  category: 'voice' | 'chronology' | 'trope' | 'genre' | 'theme'
}

/** Standard query suffix templates for generating LF/MF search phrases */
export const INTENT_PHRASE_TEMPLATES: Record<SearchIntent, string[]> = {
  watch_free: [
    'смотреть онлайн бесплатно',
    'все серии подряд онлайн',
    'смотреть без рекламы',
    'в хорошем плеере бесплатно',
  ],
  quality_hd: [
    'в хорошем качестве 1080p',
    'Full HD 1080p смотреть',
    'в оригинале с русскими субтитрами HD',
    'высокое качество видео 60fps',
  ],
  dubbing_studio: [
    'в русской озвучке [Студия]',
    'дубляж [Студия] все серии',
    'в переводе [Студия] онлайн',
    'смотреть в профессиональном дубляже',
  ],
  binge_watch: [
    'все серии подряд без остановки',
    'целиком весь сезон онлайн',
    'марафон сериала все эпизоды',
    'смотреть залпом в хорошем качестве',
  ],
  chronology_order: [
    'порядок просмотра всех сезонов',
    'хронология сюжета по годам',
    'в каком порядке смотреть фильмы и овы',
    'полная хронологическая цепочка',
  ],
  trope_discovery: [
    'лучшие аниме про [Троп]',
    'топ тайтлов с тропом [Троп]',
    'аниме где [Троп] смотреть онлайн',
    'подборка аниме по теме [Троп]',
  ],
}

/**
 * Curated master ring of high-converting semantic clusters for circular cross-linking.
 */
export const SEMANTIC_CLUSTERS_RING: SemanticClusterItem[] = [
  // Voice Studios
  {
    id: 'voice-anilibria',
    intent: 'dubbing_studio',
    anchorText: 'Аниме в озвучке AniLibria',
    targetPath: '/voice/anilibria',
    title: 'Озвучка AniLibria: все релизы онлайн',
    description: 'Культовые многоголосые переводы онгоингов и завершенных тайтлов от Люпина, Сильв и команды.',
    keywords: ['аниме анилибрия', 'смотреть anilibria онлайн', 'озвучка люпин', 'анилибрия 1080p'],
    badge: 'Студия озвучки',
    category: 'voice',
  },
  {
    id: 'voice-studio-band',
    intent: 'dubbing_studio',
    anchorText: 'Дубляж Студийная Банда',
    targetPath: '/voice/studio-band',
    title: 'Студийная Банда — профессиональный дубляж',
    description: 'Официальные голоса топовых аниме с безупречным актерским кастом и локализацией песен.',
    keywords: ['студийная банда дубляж', 'смотреть studio band', 'студийная банда все серии'],
    badge: 'Дубляж',
    category: 'voice',
  },
  {
    id: 'voice-anidub',
    intent: 'dubbing_studio',
    anchorText: 'Озвучка AniDUB (Jam & Cuba77)',
    targetPath: '/voice/anidub',
    title: 'AniDUB: классическая озвучка аниме',
    description: 'Легендарные голоса Анкора, Джема и Кубы, на которых выросло поколение анимешников.',
    keywords: ['анидаб онлайн', 'anidub озвучка jam', 'анидаб все серии подряд'],
    badge: 'Студия озвучки',
    category: 'voice',
  },
  {
    id: 'voice-dream-cast',
    intent: 'dubbing_studio',
    anchorText: 'Релизы Dream Cast онлайн',
    targetPath: '/voice/dream-cast',
    title: 'Dream Cast: скоростная многоголосая озвучка',
    description: 'Быстрые и качественные релизы новинок сезона с ярким звуковым оформлением.',
    keywords: ['дрим каст аниме', 'dream cast онлайн', 'озвучка dreamcast'],
    badge: 'Студия озвучки',
    category: 'voice',
  },
  {
    id: 'voice-reanimedia',
    intent: 'dubbing_studio',
    anchorText: 'Золотой дубляж Реанимедиа',
    targetPath: '/voice/reanimedia',
    title: 'Реанимедиа: эталонный дубляж шедевров',
    description: 'Лицензионный дубляж классики Хаяо Миядзаки, Макото Синкая и культовых сериалов.',
    keywords: ['реанимедиа дубляж', 'смотреть реанимедиа', 'reanimedia онлайн'],
    badge: 'Классика дубляжа',
    category: 'voice',
  },

  // Chronologies
  {
    id: 'chronology-fate',
    intent: 'chronology_order',
    anchorText: 'Хронология вселенной Fate',
    targetPath: '/chronology/fate',
    title: 'В каком порядке смотреть Fate (Судьба)',
    description: 'Полный гид: Fate/Zero, Unlimited Blade Works, Heaven’s Feel и спин-оффы без спойлеров.',
    keywords: ['порядок просмотра фейт', 'хронология fate', 'fate stay night с чего начать'],
    badge: 'Хронология',
    category: 'chronology',
  },
  {
    id: 'chronology-monogatari',
    intent: 'chronology_order',
    anchorText: 'Порядок просмотра Monogatari',
    targetPath: '/chronology/monogatari',
    title: 'Хронология историй Monogatari Series',
    description: 'Разбор порядка ранобэ vs трансляции: Bakemonogatari, Kizumonogatari и финальный сезон.',
    keywords: ['моногатари порядок просмотра', 'хронология историй серия', 'monogatari series order'],
    badge: 'Хронология',
    category: 'chronology',
  },
  {
    id: 'chronology-jojo',
    intent: 'chronology_order',
    anchorText: 'Хронология JoJo’s Bizarre Adventure',
    targetPath: '/chronology/jojo',
    title: 'Невероятные приключения ДжоДжо: все части',
    description: 'Поколения семьи Джостаров от Phantom Blood до Stone Ocean и Steel Ball Run.',
    keywords: ['джоджо порядок просмотра', 'хронология jojo', 'джоджо все части по порядку'],
    badge: 'Хронология',
    category: 'chronology',
  },
  {
    id: 'chronology-attack-on-titan',
    intent: 'chronology_order',
    anchorText: 'Порядок серий Атаки Титанов',
    targetPath: '/chronology/attack-on-titan',
    title: 'Атака Титанов: все сезоны, фильмы и OVA',
    description: 'Сюжетная линия Эрена Йегера, хронология спецвыпусков и предыстория Леви.',
    keywords: ['атака титанов порядок просмотра', 'атака титанов овы хронология', 'shingeki no kyojin order'],
    badge: 'Хронология',
    category: 'chronology',
  },
  {
    id: 'chronology-steins-gate',
    intent: 'chronology_order',
    anchorText: 'Порядок просмотра Врат Штейна',
    targetPath: '/chronology/steins-gate',
    title: 'Steins;Gate: мировые линии альфа и бета',
    description: 'Как правильно смотреть оригинальный сериал, серию 23β, Steins;Gate 0 и полнометражку.',
    keywords: ['врата штейна порядок просмотра', 'steins gate хронология линий', 'врата штейна 0 когда смотреть'],
    badge: 'Хронология',
    category: 'chronology',
  },

  // Tropes & Micro-genres
  {
    id: 'trope-op-from-start',
    intent: 'trope_discovery',
    anchorText: 'Аниме с имбовым ГГ с 1 серии',
    targetPath: '/trope/op-from-start',
    title: 'ГГ невероятно силен с самого начала',
    description: 'Герой превосходит всех окружающих и решает конфликты сокрушительной мощью.',
    keywords: ['аниме имба гг с первой серии', 'сильный гг с начала', 'гг всех побеждает'],
    badge: 'Троп',
    category: 'trope',
  },
  {
    id: 'trope-mc-hides-strength',
    intent: 'trope_discovery',
    anchorText: 'Аниме где ГГ скрывает свою силу',
    targetPath: '/trope/mc-hides-strength',
    title: 'ГГ притворяется слабым и скрывает силу',
    description: 'Главный герой маскируется под слабака, но в критический момент шокирует врагов.',
    keywords: ['гг скрывает силу аниме', 'притворяется слабым', 'тайная сила главного героя'],
    badge: 'Троп',
    category: 'trope',
  },
  {
    id: 'trope-reborn-as-monster',
    intent: 'trope_discovery',
    anchorText: 'Перерождение в монстра или предмет',
    targetPath: '/trope/reborn-as-monster',
    title: 'Реинкарнация в монстра, слизь или паука',
    description: 'Необычные исэкаи с эволюцией персонажа от низшего существа до повелителя мира.',
    keywords: ['аниме перерождение в монстра', 'переродился слизью пауком', 'эволюция монстра исэкай'],
    badge: 'Троп',
    category: 'trope',
  },
  {
    id: 'trope-enemies-to-lovers',
    intent: 'trope_discovery',
    anchorText: 'От врагов к любви (Enemies to Lovers)',
    targetPath: '/trope/enemies-to-lovers',
    title: 'Романтика от ненависти до страсти',
    description: 'Противостояние непримиримых соперников, которое постепенно перерастает в искренние чувства.',
    keywords: ['от врагов к любви аниме', 'ненависть перерастает в любовь', 'романтика соперников'],
    badge: 'Троп',
    category: 'trope',
  },
  {
    id: 'trope-isekai-cheat-skills',
    intent: 'trope_discovery',
    anchorText: 'Исэкай с читерскими навыками',
    targetPath: '/trope/isekai-cheat-skills',
    title: 'Попадание в другой мир с чит-способностями',
    description: 'Неограниченная магия, система прокачки и статусные окна в фэнтезийном королевстве.',
    keywords: ['исэкай чит навыки', 'аниме попаданец читер', 'другой мир система уровней'],
    badge: 'Троп',
    category: 'trope',
  },
  {
    id: 'trope-revenge-betrayal',
    intent: 'trope_discovery',
    anchorText: 'Преданный герой и жестокая месть',
    targetPath: '/trope/revenge-betrayal',
    title: 'Предательство соратников и путь отмщения',
    description: 'Героя бросили умирать в бездне, но он вернулся с темной силой, чтобы наказать обидчиков.',
    keywords: ['аниме про месть и предательство', 'героя предали он вернулся', 'темное возмездие'],
    badge: 'Троп',
    category: 'trope',
  },

  // High-Intent Genres & Themes
  {
    id: 'genre-action-hd',
    intent: 'watch_free',
    anchorText: 'Экшен-аниме в 1080p Full HD',
    targetPath: '/genre/action',
    title: 'Смотреть боевые экшен-аниме бесплатно',
    description: 'Динамичные поединки, сверхзвуковые скорости и эпические битвы без рекламы.',
    keywords: ['экшен аниме смотреть онлайн', 'боевые аниме 1080p', 'схватки и драки аниме'],
    badge: 'Жанр',
    category: 'genre',
  },
  {
    id: 'theme-isekai-free',
    intent: 'binge_watch',
    anchorText: 'Все аниме про исэкай подряд',
    targetPath: '/theme/isekai',
    title: 'Исэкай и попаданцы: смотреть все серии',
    description: 'Большая подборка историй о перемещении в параллельные миры и магические измерения.',
    keywords: ['аниме про попаданцев смотреть', 'исэкай все серии онлайн', 'другой мир аниме'],
    badge: 'Тема',
    category: 'theme',
  },
  {
    id: 'genre-fantasy-all',
    intent: 'quality_hd',
    anchorText: 'Фэнтези аниме в высоком качестве',
    targetPath: '/genre/fantasy',
    title: 'Магия, драконы и эпическое фэнтези',
    description: 'Лучшие волшебные миры, гильдии авантюристов и спасение сказочных королевств.',
    keywords: ['фэнтези аниме hd', 'смотреть магия аниме', 'гильдии авантюристов онлайн'],
    badge: 'Жанр',
    category: 'genre',
  },
  {
    id: 'theme-survival-binge',
    intent: 'binge_watch',
    anchorText: 'Аниме про выживание и смертельные игры',
    targetPath: '/theme/survival',
    title: 'Игры на выживание: высокое напряжение',
    description: 'Смертельные правила, борьба за жизнь каждую секунду и неожиданные повороты сюжета.',
    keywords: ['аниме на выживание', 'смертельные игры аниме', 'королевская битва онлайн'],
    badge: 'Тема',
    category: 'theme',
  },
]

/**
 * Circular cross-linking (кольцевая перелинковка) algorithm.
 * 
 * Takes the current page path or cluster ID, locates it in the closed ring,
 * and yields the next `count` subsequent items in modular order.
 * If the current item is not in the ring, a deterministic hash selects an entry point.
 * 
 * Guarantees:
 * 1. Every single landing page has exactly `count` outbound context links.
 * 2. Every single target page receives equal inbound links across the ring.
 * 3. 0 dead-end pages (тупиковых страниц), maximizing Google PageRank & Yandex TIC circulation.
 */
export function getCircularLinks(currentPathOrId: string, count = 4): SemanticClusterItem[] {
  const total = SEMANTIC_CLUSTERS_RING.length
  if (total === 0) return []

  const normalized = currentPathOrId.toLowerCase().replace(/^\/+|\/+$/g, '')

  let index = SEMANTIC_CLUSTERS_RING.findIndex(
    (item) => item.id.toLowerCase() === normalized || item.targetPath.toLowerCase().replace(/^\/+|\/+$/g, '') === normalized
  )

  // Fallback: deterministic FNV-1a hash to select entry index
  if (index === -1) {
    let hash = 0x811c9dc5
    for (let i = 0; i < normalized.length; i++) {
      hash = Math.imul(hash ^ normalized.charCodeAt(i), 0x01000193) >>> 0
    }
    index = hash % total
  }

  const result: SemanticClusterItem[] = []
  for (let step = 1; step <= Math.min(count, total - 1); step++) {
    const nextIndex = (index + step) % total
    result.push(SEMANTIC_CLUSTERS_RING[nextIndex])
  }

  return result
}

/**
 * Filter clusters by search intent type
 */
export function getClustersByIntent(intent: SearchIntent): SemanticClusterItem[] {
  return SEMANTIC_CLUSTERS_RING.filter((item) => item.intent === intent)
}

/**
 * Filter clusters by category
 */
export function getClustersByCategory(
  category: 'voice' | 'chronology' | 'trope' | 'genre' | 'theme'
): SemanticClusterItem[] {
  return SEMANTIC_CLUSTERS_RING.filter((item) => item.category === category)
}
