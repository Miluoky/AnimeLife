/**
 * Curated Anime Franchise Chronologies & Watch Orders
 * 
 * Provides verified chronological orders, release orders, and beginner recommendations
 * for the top 20 most complex and searched anime universes in the CIS region.
 * 
 * Targets low-frequency and mid-frequency queries:
 * «в каком порядке смотреть [франшиза]», «хронология [франшиза] все сезоны и фильмы»
 */

export type FranchiseItemType = 'TV' | 'Movie' | 'OVA' | 'ONA' | 'Special'
export type ItemImportance = 'essential' | 'recommended' | 'optional' | 'spin-off' | 'alternate'

export interface FranchiseItem {
  id: string // Anime ID or slug for linking
  title: string
  originalTitle: string
  year: number
  type: FranchiseItemType
  episodes: string | number
  chronologicalOrder: number // 1-based order in story timeline
  releaseOrder: number // 1-based order in release timeline
  importance: ItemImportance
  timelineNote: string // e.g., "1994 г., 4-я Война Святого Грааля"
  synopsis: string
  searchQuery: string // Fallback search query for catalog
}

export interface WatchOrderGuide {
  id: 'chronological' | 'release' | 'recommended'
  title: string
  description: string
  pros: string
  cons?: string
}

export interface Franchise {
  id: string // slug, e.g. "fate"
  title: string
  originalTitle: string
  badge: string
  description: string
  beginnerTip: string
  faq: Array<{ question: string; answer: string }>
  items: FranchiseItem[]
  watchOrders: WatchOrderGuide[]
}

export const ANIME_FRANCHISES: Franchise[] = [
  // 1. FATE SERIES
  {
    id: 'fate',
    title: 'Судьба (Fate Series)',
    originalTitle: 'Fate / stay night & Type-Moon Universe',
    badge: 'Культовая мультивселенная',
    description:
      'Мультивселенная Type-Moon о битвах магов и призванных героических душ за исполнение любого желания через Святой Грааль. Из-за множества альтернативных веток оригинальной визуальной новеллы и независимых спин-оффов просмотр вызывает больше всего вопросов у новичков.',
    beginnerTip:
      'Идеальная точка входа — трилогия веток ufotable: начните с сериала «Fate/stay night: Unlimited Blade Works» (2014), затем посмотрите трилогию фильмов «Heaven’s Feel», и только после этого приквел «Fate/Zero» для раскрытия всех тайн без порчи интриги.',
    watchOrders: [
      {
        id: 'recommended',
        title: 'Рекомендованный порядок (Ufotable / Наслаждение интригой)',
        description: 'Сначала основные руты Stay Night, затем приквел Fate/Zero. Позволяет избежать тяжелых спойлеров к финалу оригинальной истории.',
        pros: 'Максимальный эмоциональный эффект и отсутствие сюжетных спойлеров.',
      },
      {
        id: 'chronological',
        title: 'Хронологический порядок (По времени событий)',
        description: 'Начинается с 4-й Войны Грааля (Fate/Zero), затем переходит к 5-й Войне Грааля (ветки Stay Night).',
        pros: 'События выстроены в строгой временной причинно-следственной связи.',
        cons: 'Fate/Zero сразу раскрывает главные твисты и тайны происхождения персонажей Heaven’s Feel.',
      },
      {
        id: 'release',
        title: 'Порядок выхода экранизаций',
        description: 'От классической адаптации студии Deen 2006 года до современных фильмов.',
        pros: 'Отражает эволюцию графики от винтажной анимации до пика студии ufotable.',
      },
    ],
    faq: [
      {
        question: 'Обязательно ли смотреть версию 2006 года от Studio Deen?',
        answer: 'Нет, сериал 2006 года экранизирует ветку «Fate», но страдает от устаревшей анимации и спойлеров из других веток. Новички могут смело начинать с Unlimited Blade Works (2014) от ufotable.',
      },
      {
        question: 'Что такое ветки (руты) Stay Night?',
        answer: 'Это три альтернативных варианта развития 5-й Войны Грааля: Fate (Сэйбер), Unlimited Blade Works (Рин) и Heaven’s Feel (Сакура). Они дополняют друг друга и показывают разные грани героев.',
      },
      {
        question: 'Как связаны Fate/Apocrypha и Fate/Grand Order с основным сюжетом?',
        answer: 'Это полностью самостоятельные параллельные вселенные с собственными правилами Грааля. Их можно смотреть в любое время независимо от основной ветки.',
      },
    ],
    items: [
      {
        id: '10087',
        title: 'Судьба/Начало (Сезон 1-2)',
        originalTitle: 'Fate/Zero',
        year: 2011,
        type: 'TV',
        episodes: 25,
        chronologicalOrder: 1,
        releaseOrder: 2,
        importance: 'essential',
        timelineNote: '1994 г. — 4-я Война Святого Грааля',
        synopsis: 'Приквел: Кирицугу Эмия участвует в беспощадной битве за Грааль, сформировавшей судьбы Фуюки.',
        searchQuery: 'Fate/Zero',
      },
      {
        id: '356',
        title: 'Судьба: Ночь схватки (Классика Deen)',
        originalTitle: 'Fate/stay night (2006)',
        year: 2006,
        type: 'TV',
        episodes: 24,
        chronologicalOrder: 2,
        releaseOrder: 1,
        importance: 'optional',
        timelineNote: '2004 г. — 5-я Война Грааля (Рут Сэйбер)',
        synopsis: 'Первое знакомство Сиро Эмии с Сэйбер и первые дни 5-й битвы за Грааль.',
        searchQuery: 'Fate stay night 2006',
      },
      {
        id: '22297',
        title: 'Судьба/Ночь схватки: Бесконечный клинок краев',
        originalTitle: 'Fate/stay night: Unlimited Blade Works',
        year: 2014,
        type: 'TV',
        episodes: 26,
        chronologicalOrder: 3,
        releaseOrder: 3,
        importance: 'essential',
        timelineNote: '2004 г. — 5-я Война Грааля (Рут Рин Тосаки)',
        synopsis: 'Шедевр ufotable: Сиро и Рин сражаются плечом к плечу, сталкиваясь с загадочным лучником Арчером.',
        searchQuery: 'Fate stay night Unlimited Blade Works',
      },
      {
        id: '25537',
        title: 'Судьба/Ночь схватки: Прикосновение небес (Трилогия)',
        originalTitle: "Fate/stay night: Heaven's Feel I-III",
        year: 2017,
        type: 'Movie',
        episodes: '3 фильма',
        chronologicalOrder: 4,
        releaseOrder: 4,
        importance: 'essential',
        timelineNote: '2004 г. — 5-я Война Грааля (Темный рут Сакуры)',
        synopsis: 'Самая мрачная и масштабная ветка, раскрывающая истинную природу оскверненного Грааля.',
        searchQuery: "Fate stay night Heaven's Feel",
      },
      {
        id: '38959',
        title: 'Досье лорда Эль-Меллоя II',
        originalTitle: "Lord El-Melloi II's Case Files",
        year: 2019,
        type: 'TV',
        episodes: 13,
        chronologicalOrder: 5,
        releaseOrder: 6,
        importance: 'recommended',
        timelineNote: 'Между Zero и Stay Night — Часовая Башня',
        synopsis: 'Взрослый Вейвер Вельвет расследует мистические тайны магов в Лондоне.',
        searchQuery: 'Lord El-Melloi II',
      },
      {
        id: '34349',
        title: 'Судьба/Апокриф',
        originalTitle: 'Fate/Apocrypha',
        year: 2017,
        type: 'TV',
        episodes: 25,
        chronologicalOrder: 6,
        releaseOrder: 5,
        importance: 'spin-off',
        timelineNote: 'Альтернативная ветка — Великая Война 7 на 7',
        synopsis: 'Битва двух фракций: Черные против Красных с участием Жанны д’Арк как Рулера.',
        searchQuery: 'Fate Apocrypha',
      },
    ],
  },

  // 2. MONOGATARI SERIES
  {
    id: 'monogatari',
    title: 'Цикл историй (Monogatari Series)',
    originalTitle: 'Monogatari Series (NisiOisiN)',
    badge: 'Стилистический шедевр',
    description:
      'Авангардная серия студии Shaft по ранобэ Нисио Исина о Коёми Арараги, бывшем вампире, который помогает девушкам избавиться от паранормальных сущностей (странностей), порожденных их психологическими травмами.',
    beginnerTip:
      'Смотрите строго по порядку выхода оригинального ранобэ (Light Novel Order): трилогию фильмов «Kizumonogatari» рекомендуется смотреть сразу после «Bakemonogatari», а не ждать окончания второго сезона.',
    watchOrders: [
      {
        id: 'recommended',
        title: 'Порядок ранобэ Нисио Исина (Лучший выбор)',
        description: 'Bakemonogatari → Kizumonogatari (1-3) → Nisemonogatari → Nekomonogatari: Kuro → Вторая серия историй.',
        pros: 'Оптимальное раскрытие характеров Синобу и Арараги в полном соответствии с замыслом автора.',
      },
      {
        id: 'release',
        title: 'Порядок выхода серий на ТВ',
        description: 'Сериалы по мере выхода, фильмы Kizumonogatari после Owarimonogatari S1 из-за задержки производства.',
        pros: 'Точно повторяет опыт зрителей онгоинга в Японии.',
        cons: 'История Киссшот и превращения Арараги долго остается белым пятном.',
      },
      {
        id: 'chronological',
        title: 'Внутренняя сюжетная хронология',
        description: 'События по дням календаря: Kizumonogatari (весенние каникулы) → Nekomonogatari: Kuro → Bakemonogatari.',
        pros: 'Интересно для повторного пересмотра хардкорными фанатами.',
        cons: 'Полностью ломает художественный темп и психологическую тайну для новичка.',
      },
    ],
    faq: [
      {
        question: 'Где смотреть Kizumonogatari?',
        answer: 'Трилогию фильмов Кизумоногатари (Железная, Горячая и Холодная кровь) смотрите сразу после завершения Bakemonogatari.',
      },
      {
        question: 'Что за надписи мелькают на экране в доли секунды?',
        answer: 'Это фирменный прием режиссера Акиюки Симбо. Они передают поток мыслей Арараги из ранобэ. Ставить каждую на паузу не обязательно.',
      },
    ],
    items: [
      {
        id: '5081',
        title: 'Истории монстров',
        originalTitle: 'Bakemonogatari',
        year: 2009,
        type: 'TV',
        episodes: 15,
        chronologicalOrder: 3,
        releaseOrder: 1,
        importance: 'essential',
        timelineNote: 'Май — июнь: встреча с Хитаги Сэндзёгахарой',
        synopsis: 'Основа серии: Арараги спасает падающую с лестницы девушку, чье тело ничего не весит.',
        searchQuery: 'Bakemonogatari',
      },
      {
        id: '9260',
        title: 'Истории ран I, II, III (Трилогия фильмов)',
        originalTitle: 'Kizumonogatari: Tekketsu / Nekketsu / Reiketsu',
        year: 2016,
        type: 'Movie',
        episodes: '3 фильма',
        chronologicalOrder: 1,
        releaseOrder: 7,
        importance: 'essential',
        timelineNote: 'Весенние каникулы: встреча с вампиршей Киссшот',
        synopsis: 'Приквел всей саги: как Арараги потерял человечность и стал бессмертным полувампиром.',
        searchQuery: 'Kizumonogatari',
      },
      {
        id: '11597',
        title: 'Истории подделок',
        originalTitle: 'Nisemonogatari',
        year: 2012,
        type: 'TV',
        episodes: 11,
        chronologicalOrder: 4,
        releaseOrder: 2,
        importance: 'essential',
        timelineNote: 'Летние каникулы: огненные сестры Карэн и Цукихи',
        synopsis: 'История о фальшивках, пчелах-фениксах и испытаниях семьи Арараги.',
        searchQuery: 'Nisemonogatari',
      },
      {
        id: '15689',
        title: 'История кошки (Черная)',
        originalTitle: 'Nekomonogatari: Kuro',
        year: 2012,
        type: 'TV',
        episodes: 4,
        chronologicalOrder: 2,
        releaseOrder: 3,
        importance: 'essential',
        timelineNote: 'Золотая неделя: первая одержимость Цубасы Ханекавы',
        synopsis: 'История проклятия кошки-странности и скрытой боли идеальной старосты.',
        searchQuery: 'Nekomonogatari Kuro',
      },
      {
        id: '17074',
        title: 'Цикл историй: Второй сезон',
        originalTitle: 'Monogatari Series: Second Season',
        year: 2013,
        type: 'TV',
        episodes: 26,
        chronologicalOrder: 5,
        releaseOrder: 4,
        importance: 'essential',
        timelineNote: 'Осень: Тигр, Медуза, Синобу Тайм и Коичи',
        synopsis: 'Кульминация историй героинь, раскрытие истинных мотивов Кайки Дэйсю и взросление.',
        searchQuery: 'Monogatari Series Second Season',
      },
      {
        id: '21881',
        title: 'История финала (Сезон 1-2)',
        originalTitle: 'Owarimonogatari',
        year: 2015,
        type: 'TV',
        episodes: 20,
        chronologicalOrder: 6,
        releaseOrder: 6,
        importance: 'essential',
        timelineNote: 'Зима: тайна Оги Осино и выпускной класс',
        synopsis: 'Финальная арка противостояния Арараги с его собственными подавленными грехами.',
        searchQuery: 'Owarimonogatari',
      },
    ],
  },

  // 3. STEINS;GATE
  {
    id: 'steins-gate',
    title: 'Врата Штейна (Steins;Gate)',
    originalTitle: 'Steins;Gate Universe',
    badge: 'Научная фантастика #1',
    description:
      'Легендарная история Ринтаро Окабэ (Хооин Кёма), случайно превратившего микроволновку в машину времени, способную отправлять текстовые D-mail в прошлое. Сериал славится гениальным переплетением мировых линий Альфа и Бета.',
    beginnerTip:
      'Первый просмотр обязательно ведите в порядке выхода: серии 1–24 оригинального сезона, затем полнометражный фильм. Спецэпизод 23β и сезон Steins;Gate 0 смотрите только после полного финала первого сезона!',
    watchOrders: [
      {
        id: 'recommended',
        title: 'Порядок выхода (Каноничный и лучший для первого раза)',
        description: 'Steins;Gate (1–24 серии) → OVA 25 → Фильм Дежавю → Серия 23β → Steins;Gate 0.',
        pros: 'Дарит триумфальный катарсис оригинального финала без преждевременной депрессии Врат Штейна 0.',
      },
      {
        id: 'chronological',
        title: 'Хронологический разрыв (Мировая линия Бета)',
        description: 'Серии 1–22 первого сезона → Серия 23β → Steins;Gate 0 целиком → Серии 23–24 оригинального сезона.',
        pros: 'Идеально визуализирует бесконечный путь страданий Окабэ ради достижения линии Steins Gate.',
        cons: 'Резко обрывает динамику перед кульминацией оригинального сезона на 23 эпизода мрака.',
      },
    ],
    faq: [
      {
        question: 'Что такое серия 23β (Divide By Zero)?',
        answer: 'Это альтернативная версия 23-й серии, где Окабэ сдается после первой неудачи спасти Курису. Она служит прямым прологом к событиям Steins;Gate 0.',
      },
      {
        question: 'Каноничен ли фильм «Дежавю»?',
        answer: 'Фильм создан как фанатское продолжение счастливой концовки. В играх линии SciADV он считается полуканоном, но горячо любим за химию Курису и Окабэ.',
      },
    ],
    items: [
      {
        id: '9253',
        title: 'Врата Штейна',
        originalTitle: 'Steins;Gate',
        year: 2011,
        type: 'TV',
        episodes: 24,
        chronologicalOrder: 1,
        releaseOrder: 1,
        importance: 'essential',
        timelineNote: 'Лето 2010 года — Акихабара, Лаборатория Гаджетов Будущего',
        synopsis: 'Эксперименты с временем приводят к охоте организации SERN и трагедии, повторяющейся снова и снова.',
        searchQuery: 'Steins Gate',
      },
      {
        id: '10863',
        title: 'Врата Штейна: Эгоистичная пориомания (OVA 25)',
        originalTitle: 'Steins;Gate: Oukoubakko no Poriomania',
        year: 2012,
        type: 'OVA',
        episodes: 1,
        chronologicalOrder: 5,
        releaseOrder: 2,
        importance: 'recommended',
        timelineNote: 'Поездка в США к Курису Макисэ',
        synopsis: 'Теплый комедийный эпилог первого сезона о визите команды лаборатории в Америку.',
        searchQuery: 'Steins Gate OVA',
      },
      {
        id: '11577',
        title: 'Врата Штейна: Зона загрузки дежавю',
        originalTitle: 'Steins;Gate Movie: Fuka Ryouiki no Déjà vu',
        year: 2013,
        type: 'Movie',
        episodes: 1,
        chronologicalOrder: 6,
        releaseOrder: 3,
        importance: 'recommended',
        timelineNote: 'Осень 2010 — спасение Окабэ из небытия',
        synopsis: 'Теперь спасать исчезающего из реальности Окабэ приходится самой Курису через скачки во времени.',
        searchQuery: 'Steins Gate Movie',
      },
      {
        id: '32188',
        title: 'Врата Штейна: Разделитель на ноль (Серия 23β)',
        originalTitle: 'Steins;Gate: Kyoukaimenjou no Missing Link',
        year: 2015,
        type: 'Special',
        episodes: 1,
        chronologicalOrder: 2,
        releaseOrder: 4,
        importance: 'essential',
        timelineNote: 'Точка бифуркации мировой линии Бета',
        synopsis: 'Окабэ не получает видеопослание из будущего и отказывается от второй попытки. Начало драмы SG 0.',
        searchQuery: 'Steins Gate 23 beta',
      },
      {
        id: '30484',
        title: 'Врата Штейна 0',
        originalTitle: 'Steins;Gate 0',
        year: 2018,
        type: 'TV',
        episodes: 23,
        chronologicalOrder: 3,
        releaseOrder: 5,
        importance: 'essential',
        timelineNote: '2010–2025 гг. — Третья мировая война и ИИ «Амадей»',
        synopsis: 'История сломленного Окабэ, который находит способ отправить сообщение в прошлое сквозь десятилетия.',
        searchQuery: 'Steins Gate 0',
      },
    ],
  },

  // 4. JOJO'S BIZARRE ADVENTURE
  {
    id: 'jojo',
    title: 'Невероятные приключения ДжоДжо (JoJo)',
    originalTitle: "JoJo's Bizarre Adventure (Hirohiko Araki)",
    badge: 'Эпопея поколений',
    description:
      'Сага поколений семьи Джостаров, каждое из которых носит прозвище ДжоДжо и сражается со злом с помощью дыхания Хамон и духовных проекций — Стендов. Каждая часть имеет уникального главного героя, тон и жанр.',
    beginnerTip:
      'Смотрите строго по порядку частей от 1 к 6: части нельзя пропускать, так как наследие Дио и кровная связь Джостаров связывают все эпохи воедино.',
    watchOrders: [
      {
        id: 'chronological',
        title: 'Порядок поколений (Каноничный порядок)',
        description: 'Части 1–6 идут в строгой хронологии времени: от викторианской Англии XIX века до Флориды 2011 года.',
        pros: 'Единственно верный способ прочувствовать грандиозность семейной саги.',
      },
    ],
    faq: [
      {
        question: 'Можно ли пропустить 1-ю часть (Phantom Blood)?',
        answer: 'Категорически не рекомендуется. Хотя 1-я часть медленнее и короче остальных, она закладывает фундамент вечной вражды рода Джостаров и Дио Брандо.',
      },
      {
        question: 'Когда появляются Стенды?',
        answer: 'Стенды появляются начиная с 3-й части (Stardust Crusaders). Первые две части посвящены боевому искусству дыхания Хамон.',
      },
    ],
    items: [
      {
        id: '14719',
        title: 'ДжоДжо: Призрачная кровь / Боевое стремление (Части 1 и 2)',
        originalTitle: "JoJo's Bizarre Adventure (2012)",
        year: 2012,
        type: 'TV',
        episodes: 26,
        chronologicalOrder: 1,
        releaseOrder: 1,
        importance: 'essential',
        timelineNote: '1880-е (Джонатан) и 1938 г. (Джозеф)',
        synopsis: 'Каменная маска, коварство Дио и битва молодого Джозефа Джостара против Людей из Колонн.',
        searchQuery: 'JoJo 2012',
      },
      {
        id: '20899',
        title: 'ДжоДжо: Рыцари звездной пыли (Часть 3)',
        originalTitle: "JoJo's Bizarre Adventure: Stardust Crusaders",
        year: 2014,
        type: 'TV',
        episodes: 48,
        chronologicalOrder: 2,
        releaseOrder: 2,
        importance: 'essential',
        timelineNote: '1987 г. — Путешествие в Египет (Дзётаро Куджо)',
        synopsis: 'Возрождение Дио, дебют Стендов и 50-дневный поход в Каир ради спасения Холли.',
        searchQuery: 'JoJo Stardust Crusaders',
      },
      {
        id: '31425',
        title: 'ДжоДжо: Несокрушимый алмаз (Часть 4)',
        originalTitle: "JoJo's Bizarre Adventure: Diamond is Unbreakable",
        year: 2016,
        type: 'TV',
        episodes: 39,
        chronologicalOrder: 3,
        releaseOrder: 3,
        importance: 'essential',
        timelineNote: '1999 г. — Город Морио (Дзёскэ Хигасиката)',
        synopsis: 'Городской детектив в Морио: поиски серийного убийцы Ёсикагэ Киры с фетишем на женские руки.',
        searchQuery: 'JoJo Diamond is Unbreakable',
      },
      {
        id: '37991',
        title: 'ДжоДжо: Золотой ветер (Часть 5)',
        originalTitle: "JoJo's Bizarre Adventure: Golden Wind",
        year: 2018,
        type: 'TV',
        episodes: 39,
        chronologicalOrder: 4,
        releaseOrder: 4,
        importance: 'essential',
        timelineNote: '2001 г. — Италия, Неаполь (Джорно Джованна)',
        synopsis: 'Сын Дио мечтает стать Gang-Star и захватить контроль над итальянской мафией Пассионе.',
        searchQuery: 'JoJo Golden Wind',
      },
      {
        id: '48661',
        title: 'ДжоДжо: Каменный океан (Часть 6)',
        originalTitle: "JoJo's Bizarre Adventure: Stone Ocean",
        year: 2021,
        type: 'ONA',
        episodes: 38,
        chronologicalOrder: 5,
        releaseOrder: 5,
        importance: 'essential',
        timelineNote: '2011 г. — Тюрьма Green Dolphin Street (Джолин Куджо)',
        synopsis: 'Дочь Дзётаро попадает в тюрьму и сталкивается со священником Пуччи, стремящимся переписать вселенную.',
        searchQuery: 'JoJo Stone Ocean',
      },
    ],
  },

  // 5. ATTACK ON TITAN
  {
    id: 'attack-on-titan',
    title: 'Атака титанов (Attack on Titan)',
    originalTitle: 'Shingeki no Kyojin',
    badge: 'Глобальный феномен',
    description:
      'Мрачная постапокалиптическая драма о выживании человечества за тремя исполинскими стенами от плотоядных титанов, перерастающая в геополитический конфликт цивилизаций и философскую дилемму о цене свободы.',
    beginnerTip:
      'Смотрите сезоны с 1 по 4 по порядку. Обратите особое внимание на 2-серийную OVA «Выбор без сожалений» (история капитана Леви), которую лучше всего смотреть между 1 и 2 сезонами.',
    watchOrders: [
      {
        id: 'recommended',
        title: 'Сюжетный порядок с ключевыми OVA',
        description: 'Сезон 1 → Дневник Ильзе & Выбор без сожалений (Леви) → Сезон 2 → Сезон 3 → Финал (Part 1, 2, Специальные эпизоды).',
        pros: 'Дает полную картину мира и раскрывает характер Леви до трагических событий 3 сезона.',
      },
    ],
    faq: [
      {
        question: 'Что такое финальные специальные эпизоды (The Final Chapters)?',
        answer: 'Это завершение саги в формате двух часовых фильмов (Special 1 и Special 2), адаптирующих кульминацию манги («Гул Земли»).',
      },
    ],
    items: [
      {
        id: '16498',
        title: 'Атака титанов (Сезон 1)',
        originalTitle: 'Shingeki no Kyojin',
        year: 2013,
        type: 'TV',
        episodes: 25,
        chronologicalOrder: 1,
        releaseOrder: 1,
        importance: 'essential',
        timelineNote: 'Падение стены Мария и вступление в Разведкорпус',
        synopsis: 'Эрен Йегер клянется истребить всех титанов после гибели матери и нападения Колосса.',
        searchQuery: 'Attack on Titan Season 1',
      },
      {
        id: '25781',
        title: 'Атака титанов: Выбор без сожалений (OVA Леви)',
        originalTitle: 'Shingeki no Kyojin: Kuinaki Sentaku',
        year: 2014,
        type: 'OVA',
        episodes: 2,
        chronologicalOrder: 2,
        releaseOrder: 2,
        importance: 'recommended',
        timelineNote: 'Подземный город — прошлое Леви Аккермана и Эрвина',
        synopsis: 'История о том, как уличный головорез Леви стал сильнейшим бойцом человечества.',
        searchQuery: 'Attack on Titan No Regrets',
      },
      {
        id: '25777',
        title: 'Атака титанов (Сезон 2)',
        originalTitle: 'Shingeki no Kyojin Season 2',
        year: 2017,
        type: 'TV',
        episodes: 12,
        chronologicalOrder: 3,
        releaseOrder: 3,
        importance: 'essential',
        timelineNote: 'Прорыв стены Роза и предательство среди своих',
        synopsis: 'Шокирующее раскрытие личностей Бронированного и Колоссального титанов.',
        searchQuery: 'Attack on Titan Season 2',
      },
      {
        id: '35760',
        title: 'Атака титанов (Сезон 3: Части 1 и 2)',
        originalTitle: 'Shingeki no Kyojin Season 3',
        year: 2018,
        type: 'TV',
        episodes: 22,
        chronologicalOrder: 4,
        releaseOrder: 4,
        importance: 'essential',
        timelineNote: 'Дворцовый переворот и Битва за Сигансину',
        synopsis: 'Возвращение стены Мария, тайна подвала Гриши Йегера и правда об океане.',
        searchQuery: 'Attack on Titan Season 3',
      },
      {
        id: '40028',
        title: 'Атака титанов: Финал (Все части)',
        originalTitle: 'Shingeki no Kyojin: The Final Season',
        year: 2020,
        type: 'TV',
        episodes: 28,
        chronologicalOrder: 5,
        releaseOrder: 5,
        importance: 'essential',
        timelineNote: 'Марли, остров Парадиз и Гул Земли',
        synopsis: 'Эрен объявляет войну всему миру ради спасения соотечественников. Финальный бой друзей.',
        searchQuery: 'Attack on Titan Final Season',
      },
    ],
  },

  // 6. SWORD ART ONLINE
  {
    id: 'sao',
    title: 'Мастера Меча Онлайн (Sword Art Online)',
    originalTitle: 'Sword Art Online (Reki Kawahara)',
    badge: 'Родоначальник эпохи VRMMO',
    description:
      'История Кирито и Асуны, застрявших в смертельной игре полного погружения Sword Art Online, где гибель в виртуальном мире означает смерть в реальности, перерастающая в исследование этики искусственного интеллекта и виртуального мира.',
    beginnerTip:
      'Смотрите строго хронологически: Сезон 1 → Сезон 2 → Фильм «Порядковый ранг» (Ordinal Scale — он 100% каноничен!) → Сезон 3 «Алисизация». Фильмы Progressive показывают детальную зачистку первых этажей Айнкрада.',
    watchOrders: [
      {
        id: 'chronological',
        title: 'Каноничный хронологический порядок',
        description: 'Айнкрад (S1) → Танец фей → Призрачная пуля (S2) → Розарий матери → Порядковый ранг → Алисизация.',
        pros: 'Не пропускает ключевой фильм Ordinal Scale, без которого технологии Алисизации непонятны.',
      },
    ],
    faq: [
      {
        question: 'Обязательно ли смотреть фильм Ordinal Scale перед Алисизацией?',
        answer: 'Да! Персонажи и технологии дополненной реальности из Ordinal Scale напрямую переходят в сюжет «Алисизации».',
      },
    ],
    items: [
      {
        id: '11757',
        title: 'Мастера Меча Онлайн (Сезон 1)',
        originalTitle: 'Sword Art Online',
        year: 2012,
        type: 'TV',
        episodes: 25,
        chronologicalOrder: 1,
        releaseOrder: 1,
        importance: 'essential',
        timelineNote: '2022–2024 гг. — Айнкрад и ALfheim Online',
        synopsis: '10 000 игроков заперты в парящей крепости Айнкрад без права на ошибку.',
        searchQuery: 'Sword Art Online Season 1',
      },
      {
        id: '21881',
        title: 'Мастера Меча Онлайн II',
        originalTitle: 'Sword Art Online II',
        year: 2014,
        type: 'TV',
        episodes: 24,
        chronologicalOrder: 2,
        releaseOrder: 2,
        importance: 'essential',
        timelineNote: 'Gun Gale Online и трагедия Юки Конно',
        synopsis: 'Кирито расследует убийства Дес Гана в мире пушек GGO и знакомится со снайпером Синон.',
        searchQuery: 'Sword Art Online Season 2',
      },
      {
        id: '31765',
        title: 'Мастера Меча Онлайн: Порядковый ранг',
        originalTitle: 'Sword Art Online Movie: Ordinal Scale',
        year: 2017,
        type: 'Movie',
        episodes: 1,
        chronologicalOrder: 3,
        releaseOrder: 3,
        importance: 'essential',
        timelineNote: 'Устройство «Аугма» и дополненная реальность в Токио',
        synopsis: 'Борьба за выживание переносится на улицы реального Токио с помощью AR-игры Ordinal Scale.',
        searchQuery: 'Sword Art Online Ordinal Scale',
      },
      {
        id: '36474',
        title: 'Мастера Меча Онлайн: Алисизация (Все части)',
        originalTitle: 'Sword Art Online: Alicization',
        year: 2018,
        type: 'TV',
        episodes: 47,
        chronologicalOrder: 4,
        releaseOrder: 4,
        importance: 'essential',
        timelineNote: 'Проект «Алисизация» — мир «Андерворлд»',
        synopsis: 'Кирито попадает в виртуальный мир с душевными ИИ Bottom-Up и вместе с Юдзио идет к вершине Центрального Собора.',
        searchQuery: 'Sword Art Online Alicization',
      },
    ],
  },

  // 7. BLEACH
  {
    id: 'bleach',
    title: 'Блич (Bleach)',
    originalTitle: 'Bleach (Tite Kubo)',
    badge: 'Король сёнэна',
    description:
      'История Ичиго Куросаки, пятнадцатилетнего школьника, случайно получившего силу синигами (проводника душ) от Рукии Кучики. Вместе с друзьями он защищает мир живых и Общество Душ от Пустых, заговоров арранкаров и вторжения квинси.',
    beginnerTip:
      'Главный совет новичкам: пропускайте филлерные арки (Баунто, Новый капитан Сюсукэ Амагай, Восстание Дзанпакто), чтобы не терять динамику основного сюжета перед аркой Тысячелетней кровавой войны!',
    watchOrders: [
      {
        id: 'recommended',
        title: 'Канон без филлеров (Самый динамичный)',
        description: 'Общество Душ (1–63) → Уэко Мундо и Аранкары (110–310) → Подчиняющие души (343–366) → Тысячелетняя кровавая война.',
        pros: 'Экономит более 160 эпизодов затянутых независимых филлеров.',
      },
    ],
    faq: [
      {
        question: 'Нужно ли смотреть фильмы Блич?',
        answer: 'Фильмы не влияют на основной канон, но первый фильм «Memories of Nobody» признан автором как полуканон, а Долина Криков упоминается в финальной арке.',
      },
    ],
    items: [
      {
        id: '269',
        title: 'Блич: Классический сериал',
        originalTitle: 'Bleach (2004-2012)',
        year: 2004,
        type: 'TV',
        episodes: 366,
        chronologicalOrder: 1,
        releaseOrder: 1,
        importance: 'essential',
        timelineNote: 'Спасение Рукии, предательство Айдзена и победа над Эспадой',
        synopsis: 'Путь Ичиго от временного синигами Каракуры до спасения Общества Душ от плана Соскэ Айдзена.',
        searchQuery: 'Bleach',
      },
      {
        id: '41467',
        title: 'Блич: Тысячелетняя кровавая война',
        originalTitle: 'Bleach: Sennen Kessen-hen',
        year: 2022,
        type: 'TV',
        episodes: 39,
        chronologicalOrder: 2,
        releaseOrder: 2,
        importance: 'essential',
        timelineNote: 'Вторжение Ванденрейха и битва против Яхве',
        synopsis: 'Финальная война синигами и квинси в безупречной кинематографичной анимации нового поколения.',
        searchQuery: 'Bleach Thousand Year Blood War',
      },
    ],
  },

  // 8. NEON GENESIS EVANGELION
  {
    id: 'evangelion',
    title: 'Евангелион (Neon Genesis Evangelion)',
    originalTitle: 'Shin Seiki Evangelion (Hideaki Anno)',
    badge: 'Психологический апофеоз',
    description:
      'Шедевр Хидэаки Анно о 14-летнем Синдзи Икари, вынужденном пилотировать гигантского биоробота Евангелион против таинственных Ангелов. Деконструкция жанра меха, переполненная религиозным символизмом и психоанализом одиночества.',
    beginnerTip:
      'Классический просмотр: сериал 1995 года (26 серий) → фильм «Конец Евангелиона» (The End of Evangelion). Тетралогия Ребилдов (1.11, 2.22, 3.33, 3.0+1.0) — это новое переосмысление финала, которое стоит смотреть после классики.',
    watchOrders: [
      {
        id: 'recommended',
        title: 'Классика + Завершение Анно',
        description: 'Сериал 1995 (эп. 1–26) → The End of Evangelion → Фильмы Rebuild of Evangelion (1.11 – 3.0+1.0).',
        pros: 'Дает глубочайшее понимание личностной трансформации автора от депрессии к катарсису.',
      },
    ],
    faq: [
      {
        question: 'Заменяет ли The End of Evangelion 25 и 26 серии?',
        answer: 'Серии 25–26 показывают Комплементацию человечества изнутри сознания Синдзи, а The End of Evangelion показывает те же события в реальном физическом мире.',
      },
    ],
    items: [
      {
        id: '30',
        title: 'Евангелион нового поколения',
        originalTitle: 'Neon Genesis Evangelion',
        year: 1995,
        type: 'TV',
        episodes: 26,
        chronologicalOrder: 1,
        releaseOrder: 1,
        importance: 'essential',
        timelineNote: '2015 г. — Токио-3, база NERV',
        synopsis: 'Синдзи пилотирует Еву-01, борясь с ненавистью к отцу, паническими атаками и поиском своего «Я».',
        searchQuery: 'Neon Genesis Evangelion',
      },
      {
        id: '32',
        title: 'Конец Евангелиона',
        originalTitle: 'The End of Evangelion',
        year: 1997,
        type: 'Movie',
        episodes: 1,
        chronologicalOrder: 2,
        releaseOrder: 2,
        importance: 'essential',
        timelineNote: 'Третий удар и Комплементация человечества',
        synopsis: 'Апокалиптический финал оригинального сериала, изменивший историю всей мировой анимации.',
        searchQuery: 'The End of Evangelion',
      },
      {
        id: '2759',
        title: 'Евангелион по-новому (Ребилды 1.11 — 3.0+1.0)',
        originalTitle: 'Rebuild of Evangelion',
        year: 2007,
        type: 'Movie',
        episodes: '4 фильма',
        chronologicalOrder: 3,
        releaseOrder: 3,
        importance: 'recommended',
        timelineNote: 'Новая временная петля и финальное прощание',
        synopsis: 'Тетралогия переосмысления с альтернативным сюжетом, новыми героинями и светлым катарсисом.',
        searchQuery: 'Rebuild of Evangelion',
      },
    ],
  },

  // 9. FULLMETAL ALCHEMIST
  {
    id: 'fma',
    title: 'Стальной алхимик (Fullmetal Alchemist)',
    originalTitle: 'Hagane no Renkinjutsushi (Hiromu Arakawa)',
    badge: 'Топ-1 рейтинг всех времен',
    description:
      'Братья Эдвард и Альфонс Элрики нарушают главное табу алхимии — человеческую трансформацию, чтобы воскресить умершую мать. Потеряв тело и руку с ногой, братья ищут Философский камень, раскрывая грандиозный заговор в верхушке армии Аместриса.',
    beginnerTip:
      'Если у вас есть время только на одну версию — смотрите «Стальной алхимик: Братство» (Fullmetal Alchemist: Brotherhood, 2009). Это точная и законченная экранизация оригинальной манги Хирому Аракавы.',
    watchOrders: [
      {
        id: 'recommended',
        title: 'Fullmetal Alchemist: Brotherhood (Канон манги)',
        description: '64 серии Brotherhood от начала до триумфального финала.',
        pros: 'Один из самых безупречных сценариев в истории аниме с завершенными арками всех персонажей.',
      },
      {
        id: 'release',
        title: 'Оригинальный сериал 2003 года + Завоеватель Шамбалы',
        description: 'Сериал 2003 года обогнал мангу и пошел по собственному драматическому и темному пути.',
        pros: 'Более глубокое развитие ранних арок (Нина Такер, Хьюз).',
      },
    ],
    faq: [
      {
        question: 'Связаны ли сюжетно сериал 2003 года и Братство 2009 года?',
        answer: 'Нет, это две независимые версии одной завязки. Сериал 2003 года придумал собственный финал, а Братство точно следует манге.',
      },
    ],
    items: [
      {
        id: '5114',
        title: 'Стальной алхимик: Братство',
        originalTitle: 'Fullmetal Alchemist: Brotherhood',
        year: 2009,
        type: 'TV',
        episodes: 64,
        chronologicalOrder: 1,
        releaseOrder: 2,
        importance: 'essential',
        timelineNote: 'Каноничная история братьев Элриков',
        synopsis: 'Поиски Философского камня ведут к раскрытию плана Отца — создателя всех семи гомункулов.',
        searchQuery: 'Fullmetal Alchemist Brotherhood',
      },
      {
        id: '121',
        title: 'Стальной алхимик (2003)',
        originalTitle: 'Fullmetal Alchemist',
        year: 2003,
        type: 'TV',
        episodes: 51,
        chronologicalOrder: 2,
        releaseOrder: 1,
        importance: 'alternate',
        timelineNote: 'Альтернативная авторская ветка студии Bones',
        synopsis: 'Мрачная версия событий с фильмом-завершением «Завоеватель Шамбалы».',
        searchQuery: 'Fullmetal Alchemist 2003',
      },
    ],
  },

  // 10. TOARU / RAILDEX UNIVERSE
  {
    id: 'toaru',
    title: 'Вселенная Тоару / Рейлган (Toaru Series)',
    originalTitle: 'A Certain Magical Index & Scientific Railgun',
    badge: 'Наука против Магии',
    description:
      'Академгород — футуристический научный мегаполис эсперов, развивающих сверхспособности с помощью науки. Параллельно с ним существует тайный мир христианской и языческой магии. История переплетает судьбы Томы Камидзё (невезучего парня с силой стирать любую способность) и Микото Мисаки (третьего сильнейшего эспера города).',
    beginnerTip:
      'Многие фанаты начинают с «Некоего научного Рейлгана» (Railgun), так как у него более высокий темп и качественная анимация от студии J.C.Staff, а затем переходят к «Индексу волшебства» (Index).',
    watchOrders: [
      {
        id: 'recommended',
        title: 'Смешанный хронологический порядок',
        description: 'Railgun S1 → Index S1 → Railgun S (лучшая арка Сестер) → Index S2 → Accelerator → Railgun T → Index S3.',
        pros: 'Арка «Сестры» в Railgun S производит в 10 раз более мощный эффект, чем в сжатой версии Индекса.',
      },
    ],
    faq: [
      {
        question: 'Что такое Рейлган и Индекс?',
        answer: 'Индекс (Index) — флагманская линия о войне науки и магии с Томой. Рейлган (Railgun) — спин-офф о жизни Микото Мисаки и темной изнанке Академгорода.',
      },
    ],
    items: [
      {
        id: '6213',
        title: 'Некий научный Рейлган (Сезон 1-3)',
        originalTitle: 'Toaru Kagaku no Railgun',
        year: 2009,
        type: 'TV',
        episodes: 73,
        chronologicalOrder: 1,
        releaseOrder: 2,
        importance: 'essential',
        timelineNote: 'Лето — жизнь Академгорода глазами Микото Мисаки',
        synopsis: 'Электромагнитная пушка Микото расследует инциденты Level Upper и заговор клонирования.',
        searchQuery: 'Toaru Kagaku no Railgun',
      },
      {
        id: '4654',
        title: 'Некий магический Индекс (Сезоны 1-3)',
        originalTitle: 'Toaru Majutsu no Index',
        year: 2008,
        type: 'TV',
        episodes: 74,
        chronologicalOrder: 2,
        releaseOrder: 1,
        importance: 'essential',
        timelineNote: 'Правая рука Томы — Imagine Breaker',
        synopsis: 'Тома спасает монахиню Индекс, в памяти которой запечатаны 103 000 запретных гримуара.',
        searchQuery: 'Toaru Majutsu no Index',
      },
    ],
  },
]

/**
 * Fast lookup helper for franchise by ID or slug.
 */
export function getFranchiseById(id: string): Franchise | undefined {
  const clean = id.toLowerCase().trim()
  return ANIME_FRANCHISES.find((f) => f.id === clean)
}

/**
 * Returns all registered franchise guides.
 */
export function getAllFranchises(): Franchise[] {
  return ANIME_FRANCHISES
}

/**
 * Check if a franchise exists by slug.
 */
export function isFranchiseSupported(id: string): boolean {
  return ANIME_FRANCHISES.some((f) => f.id === id.toLowerCase().trim())
}
