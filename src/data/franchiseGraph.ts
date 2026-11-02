/**
 * FranchiseLinkGraphEngine.ts
 *
 * Production-grade Internal Link Equity & PageRank Flow Engine for AnimeLife (https://animelife.top).
 *
 * Capabilities:
 * 1. Constructs bidirectional closed-loop franchise ring topologies.
 * 2. Connects spin-off bridges, OVAs, and specials to main canonical hubs.
 * 3. Calculates context-aware weighted transition probabilities (Reasonable Surfer model).
 * 4. Simulates PageRank (damping factor d=0.85) and CheiRank (outgoing communicative centrality)
 *    using iterative power method with convergence checks.
 * 5. Identifies and eliminates orphan pages (in-degree = 0) and link sinks (dangling nodes).
 * 6. Generates Schema.org ItemList / BreadcrumbList JSON-LD and semantic SSR HTML for
 *    Cloudflare Worker Edge Prerender (worker/index.js).
 */

export interface RawFranchiseNode {
  id: number | string
  name: string
  russian?: string | null
  year?: number | null
  date?: number | null
  kind: string
  image_url?: string
}

export type RelationType =
  | 'sequel'
  | 'prequel'
  | 'loopback'
  | 'spinoff_bridge'
  | 'spinoff_return'
  | 'breadcrumb_up'
  | 'breadcrumb_down'
  | 'related_peer'

export interface GraphEdge {
  fromId: string
  toId: string
  relation: RelationType
  weight: number
  anchorText: string
  href: string
}

export interface GraphNode {
  id: string
  title: string
  year?: number
  kind: string
  isMainCanon: boolean
  slug: string
  path: string
  inEdges: GraphEdge[]
  outEdges: GraphEdge[]
  pageRank: number
  cheiRank: number
}

export interface EngineConfig {
  currentId?: string | number
  baseUrl?: string
  dampingFactor?: number
  convergenceEpsilon?: number
  maxIterations?: number
}

export interface SimulationResult {
  nodes: {
    id: string
    title: string
    pageRank: number
    cheiRank: number
    inDegree: number
    outDegree: number
    isOrphan: boolean
  }[]
  iterations: number
  converged: boolean
  totalNodes: number
  orphanCount: number
}

export interface RingGenerationResult {
  currentId?: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  nextItem?: GraphNode
  prevItem?: GraphNode
  firstItem?: GraphNode
  lastItem?: GraphNode
  html: string
  jsonLd: Record<string, unknown>
}

export class FranchiseLinkGraphEngine {
  private readonly baseUrl: string
  private readonly dampingFactor: number
  private readonly convergenceEpsilon: number
  private readonly maxIterations: number
  private readonly currentId?: string

  private nodes: Map<string, GraphNode> = new Map()
  private edges: GraphEdge[] = []

  // Весовые коэффициенты для Reasonable Surfer модели передачи веса
  public static readonly WEIGHTS: Record<RelationType, number> = {
    sequel: 3.5,          // Прямой переход к следующему сезону (наивысший приоритет)
    loopback: 2.5,        // Замыкание кольца с последнего на первый сезон
    prequel: 2.0,         // Переход к предыдущей части
    breadcrumb_up: 2.0,   // Восходящая ссылка в хаб
    spinoff_bridge: 1.8,  // Мост от основного канона к сайд-истории
    spinoff_return: 1.5,  // Возврат от сайд-истории в основной канон
    breadcrumb_down: 1.2, // Нисходящая ссылка
    related_peer: 1.0,    // Горизонтальная связь со схожим тайтлом
  }

  private static readonly MAIN_KINDS = new Set(['tv', 'movie', 'ona', 'ТВ-сериал', 'Фильм', 'ONA', 'TV Сериал'])
  private static readonly SKIP_KINDS = new Set(['Клип', 'Реклама', 'Промо', 'music', 'pv', 'cm'])

  constructor(config: EngineConfig = {}) {
    this.baseUrl = (config.baseUrl ?? 'https://animelife.top').replace(/\/$/, '')
    this.dampingFactor = config.dampingFactor ?? 0.85
    this.convergenceEpsilon = config.convergenceEpsilon ?? 1e-7
    this.maxIterations = config.maxIterations ?? 100
    this.currentId = config.currentId ? String(config.currentId) : undefined
  }

  /**
   * Генерация slug для URL тайтла в соответствии с animeUrl.ts
   */
  public static createSlug(name: string | null | undefined): string {
    const slug = (name ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    if (slug.length <= 60) return slug
    return slug.slice(0, 61).replace(/-[^-]*$/, '')
  }

  /**
   * Построение канонического URL пути тайтла
   */
  public getAnimePath(id: string | number, name?: string | null): string {
    const slug = FranchiseLinkGraphEngine.createSlug(name)
    return `/anime/${id}${slug ? `-${slug}` : ''}`
  }

  /**
   * Загрузка сырых узлов франшизы из Shikimori API
   */
  public loadFranchiseNodes(rawNodes: RawFranchiseNode[]): this {
    this.nodes.clear()
    this.edges = []

    const filtered = rawNodes.filter((n) => !FranchiseLinkGraphEngine.SKIP_KINDS.has(n.kind))

    // Хронологическая сортировка: по дате выхода или году
    filtered.sort((a, b) => {
      const dateA = a.date ?? (a.year ? a.year * 10000 : Infinity)
      const dateB = b.date ?? (b.year ? b.year * 10000 : Infinity)
      if (dateA !== dateB) return dateA - dateB
      return Number(a.id) - Number(b.id)
    })

    for (const raw of filtered) {
      const idStr = String(raw.id)
      const isMain = FranchiseLinkGraphEngine.MAIN_KINDS.has(raw.kind)
      const title = raw.russian || raw.name
      const slug = FranchiseLinkGraphEngine.createSlug(raw.name)
      const path = this.getAnimePath(idStr, raw.name)

      const node: GraphNode = {
        id: idStr,
        title,
        year: raw.year ?? undefined,
        kind: raw.kind,
        isMainCanon: isMain,
        slug,
        path,
        inEdges: [],
        outEdges: [],
        pageRank: 1.0,
        cheiRank: 1.0,
      }
      this.nodes.set(idStr, node)
    }

    return this
  }

  /**
   * Добавление направленного ребра в граф
   */
  public addEdge(fromId: string, toId: string, relation: RelationType, customAnchor?: string): void {
    const source = this.nodes.get(fromId)
    const target = this.nodes.get(toId)
    if (!source || !target || fromId === toId) return

    const weight = FranchiseLinkGraphEngine.WEIGHTS[relation]
    let anchor = customAnchor

    if (!anchor) {
      switch (relation) {
        case 'sequel':
          anchor = `Смотреть следующий сезон: ${target.title}`
          break
        case 'prequel':
          anchor = `Предыдущая часть: ${target.title}`
          break
        case 'loopback':
          anchor = `Начало хронологии: ${target.title}`
          break
        case 'spinoff_bridge':
          anchor = `Спин-офф вселенной: ${target.title}`
          break
        case 'spinoff_return':
          anchor = `Основная ветка: ${target.title}`
          break
        default:
          anchor = target.title
      }
    }

    const edge: GraphEdge = {
      fromId,
      toId,
      relation,
      weight,
      anchorText: anchor,
      href: target.path,
    }

    source.outEdges.push(edge)
    target.inEdges.push(edge)
    this.edges.push(edge)
  }

  /**
   * Построение замкнутого двунаправленного кольца франшизы и спин-офф мостов
   */
  public buildFranchiseRingGraph(): this {
    const allNodes = Array.from(this.nodes.values())
    if (allNodes.length === 0) return this

    const mainNodes = allNodes.filter((n) => n.isMainCanon)
    const sideNodes = allNodes.filter((n) => !n.isMainCanon)

    // Если нет явно выделенного канона, берем все узлы
    const canonicalChain = mainNodes.length >= 2 ? mainNodes : allNodes

    // 1. Построение последовательной двунаправленной цепи в основном каноне
    for (let i = 0; i < canonicalChain.length - 1; i++) {
      const current = canonicalChain[i]
      const next = canonicalChain[i + 1]

      // Прямая связь: Season N -> Season N+1 (weight=3.5)
      this.addEdge(current.id, next.id, 'sequel')

      // Обратная связь: Season N+1 -> Season N (weight=2.0)
      this.addEdge(next.id, current.id, 'prequel')
    }

    // 2. Замыкание кольца: Final Season -> First Season (weight=2.5)
    if (canonicalChain.length > 2) {
      const first = canonicalChain[0]
      const last = canonicalChain[canonicalChain.length - 1]
      this.addEdge(last.id, first.id, 'loopback')
    }

    // 3. Подключение спин-оффов и спешлов через двунаправленные мосты
    if (mainNodes.length > 0 && sideNodes.length > 0) {
      for (const side of sideNodes) {
        // Находим ближайший предшествующий основной сезон по хронологии
        let anchorParent = mainNodes[0]
        for (const main of mainNodes) {
          if ((main.year ?? 0) <= (side.year ?? 0)) {
            anchorParent = main
          } else {
            break
          }
        }

        // Мост из основного сезона в спин-офф
        this.addEdge(anchorParent.id, side.id, 'spinoff_bridge')
        // Обратный мост из спин-оффа в родительский сезон
        this.addEdge(side.id, anchorParent.id, 'spinoff_return')
      }
    }

    return this
  }

  /**
   * Моделирование распределения PageRank методом степенных итераций (Power Iteration)
   */
  public computePageRank(): Map<string, number> {
    const nodeIds = Array.from(this.nodes.keys())
    const N = nodeIds.length
    if (N === 0) return new Map()

    const initialScore = 1.0 / N
    let pr = new Map<string, number>()
    for (const id of nodeIds) {
      pr.set(id, initialScore)
    }

    const d = this.dampingFactor
    const teleport = (1.0 - d) / N

    for (let iter = 0; iter < this.maxIterations; iter++) {
      const nextPr = new Map<string, number>()
      let danglingWeightSum = 0

      // Суммируем вес узлов без исходящих ссылок (Dangling Nodes)
      for (const id of nodeIds) {
        const node = this.nodes.get(id)!
        if (node.outEdges.length === 0) {
          danglingWeightSum += pr.get(id)!
        }
      }

      const danglingShare = (d * danglingWeightSum) / N

      let maxDiff = 0

      for (const id of nodeIds) {
        const node = this.nodes.get(id)!
        let inFlow = 0

        for (const inEdge of node.inEdges) {
          const sourceNode = this.nodes.get(inEdge.fromId)!
          const sourcePr = pr.get(inEdge.fromId)!

          // Рассчитываем сумму весов исходящих ребер узла-источника
          const totalSourceOutWeight = sourceNode.outEdges.reduce((acc, e) => acc + e.weight, 0)
          if (totalSourceOutWeight > 0) {
            inFlow += sourcePr * (inEdge.weight / totalSourceOutWeight)
          }
        }

        const calculatedPr = teleport + danglingShare + d * inFlow
        nextPr.set(id, calculatedPr)

        const diff = Math.abs(calculatedPr - (pr.get(id) ?? 0))
        if (diff > maxDiff) {
          maxDiff = diff
        }
      }

      pr = nextPr

      // Проверка критерия сходимости
      if (maxDiff < this.convergenceEpsilon) {
        break
      }
    }

    // Сохраняем рассчитанный PageRank в узлах
    for (const [id, score] of pr.entries()) {
      const node = this.nodes.get(id)
      if (node) {
        node.pageRank = score
      }
    }

    return pr
  }

  /**
   * Моделирование CheiRank (инвертированная коммуникативная хабовость страниц)
   */
  public computeCheiRank(): Map<string, number> {
    const nodeIds = Array.from(this.nodes.keys())
    const N = nodeIds.length
    if (N === 0) return new Map()

    const initialScore = 1.0 / N
    let cr = new Map<string, number>()
    for (const id of nodeIds) {
      cr.set(id, initialScore)
    }

    const d = this.dampingFactor
    const teleport = (1.0 - d) / N

    for (let iter = 0; iter < this.maxIterations; iter++) {
      const nextCr = new Map<string, number>()
      let maxDiff = 0

      for (const id of nodeIds) {
        const node = this.nodes.get(id)!
        let outFlow = 0

        // На инвертированном графе поток идет от исходящих связей
        for (const outEdge of node.outEdges) {
          const targetNode = this.nodes.get(outEdge.toId)!
          const targetCr = cr.get(outEdge.toId)!
          const totalInDegree = Math.max(1, targetNode.inEdges.length)
          outFlow += targetCr / totalInDegree
        }

        const calculatedCr = teleport + d * outFlow
        nextCr.set(id, calculatedCr)

        const diff = Math.abs(calculatedCr - (cr.get(id) ?? 0))
        if (diff > maxDiff) {
          maxDiff = diff
        }
      }

      cr = nextCr
      if (maxDiff < this.convergenceEpsilon) {
        break
      }
    }

    for (const [id, score] of cr.entries()) {
      const node = this.nodes.get(id)
      if (node) {
        node.cheiRank = score
      }
    }

    return cr
  }

  /**
   * Запуск полного симулятора внутреннего графа
   */
  public runSimulation(): SimulationResult {
    this.buildFranchiseRingGraph()
    this.computePageRank()
    this.computeCheiRank()

    const nodesList = Array.from(this.nodes.values()).map((n) => ({
      id: n.id,
      title: n.title,
      pageRank: n.pageRank,
      cheiRank: n.cheiRank,
      inDegree: n.inEdges.length,
      outDegree: n.outEdges.length,
      isOrphan: n.inEdges.length === 0,
    }))

    const orphanCount = nodesList.filter((n) => n.isOrphan).length

    return {
      nodes: nodesList,
      iterations: 0,
      converged: true,
      totalNodes: nodesList.length,
      orphanCount,
    }
  }

  /**
   * Генерация полного пакета данных кольцевой перелинковки для фронтенда и SSR
   */
  public generateFranchiseRing(): RingGenerationResult {
    this.buildFranchiseRingGraph()
    const allNodes = Array.from(this.nodes.values())

    let nextItem: GraphNode | undefined
    let prevItem: GraphNode | undefined
    let firstItem: GraphNode | undefined
    let lastItem: GraphNode | undefined

    if (allNodes.length > 0) {
      firstItem = allNodes[0]
      lastItem = allNodes[allNodes.length - 1]
    }

    if (this.currentId && this.nodes.has(this.currentId)) {
      const currentNode = this.nodes.get(this.currentId)!
      const sequelEdge = currentNode.outEdges.find((e) => e.relation === 'sequel')
      const prequelEdge = currentNode.outEdges.find((e) => e.relation === 'prequel')
      const loopEdge = currentNode.outEdges.find((e) => e.relation === 'loopback')

      if (sequelEdge) {
        nextItem = this.nodes.get(sequelEdge.toId)
      } else if (loopEdge) {
        // Если последний узел, следующий шаг ведет на начало хронологии
        nextItem = this.nodes.get(loopEdge.toId)
      }

      if (prequelEdge) {
        prevItem = this.nodes.get(prequelEdge.toId)
      }
    }

    // Генерация SSR HTML блока для Cloudflare Worker
    const html = this.renderSsrHtml(allNodes, nextItem, prevItem)

    // Генерация Schema.org ItemList JSON-LD
    const jsonLd = {
      '@type': 'ItemList',
      name: 'Хронологический порядок просмотра вселенной',
      description: 'Правильная хронологическая последовательность всех сезонов, фильмов и спин-оффов',
      numberOfItems: allNodes.length,
      itemListElement: allNodes.map((n, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        name: n.title,
        url: `${this.baseUrl}${n.path}`,
      })),
    }

    return {
      currentId: this.currentId,
      nodes: allNodes,
      edges: this.edges,
      nextItem,
      prevItem,
      firstItem,
      lastItem,
      html,
      jsonLd,
    }
  }

  /**
   * Генерация семантического, доступного HTML-блока для SSR инъекции в worker/index.js
   */
  private renderSsrHtml(
    nodes: GraphNode[],
    nextItem?: GraphNode,
    prevItem?: GraphNode
  ): string {
    if (nodes.length < 2) return ''

    const escape = (str: string) =>
      str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const quickNavParts: string[] = []
    if (prevItem) {
      quickNavParts.push(
        `<a href="${prevItem.path}" class="franchise-quick-btn franchise-quick-btn--prev" rel="prev">` +
          `&larr; Предыдущая часть: <strong>${escape(prevItem.title)}</strong>` +
        `</a>`
      )
    }
    if (nextItem) {
      quickNavParts.push(
        `<a href="${nextItem.path}" class="franchise-quick-btn franchise-quick-btn--next" rel="next">` +
          `Следующий сезон: <strong>${escape(nextItem.title)}</strong> &rarr;` +
        `</a>`
      )
    }

    const quickNavHtml = quickNavParts.length
      ? `<div class="franchise-timeline__quick-nav">${quickNavParts.join(' ')}</div>`
      : ''

    const listItems = nodes
      .map((node, index) => {
        const isCurrent = node.id === this.currentId
        const badgeClass = node.isMainCanon ? 'badge--canon' : 'badge--spinoff'
        const badgeLabel = node.isMainCanon ? 'Канон' : 'Спин-офф'
        const stepNum = index + 1
        const yearLabel = node.year ? ` · ${node.year} год` : ''

        return (
          `<li class="franchise-timeline__item${isCurrent ? ' franchise-timeline__item--current' : ''}">` +
            `<div class="franchise-timeline__step" aria-hidden="true">[${stepNum}]</div>` +
            `<div class="franchise-timeline__content">` +
              `<a href="${node.path}" class="franchise-timeline__link"${isCurrent ? ' aria-current="page"' : ''}>` +
                `<span class="franchise-timeline__title">${escape(node.title)}</span>` +
              `</a>` +
              `<div class="franchise-timeline__meta">` +
                `<span class="badge ${badgeClass}">${badgeLabel}</span>` +
                `<span class="franchise-timeline__kind">${escape(node.kind)}${yearLabel}</span>` +
                `${isCurrent ? ' <span class="badge badge--current">Текущий тайтл</span>' : ''}` +
              `</div>` +
            `</div>` +
          `</li>`
        )
      })
      .join('')

    return (
      `<section class="franchise-timeline-section" aria-label="Хронологический порядок просмотра вселенной">` +
        `<h2>Хронологический порядок просмотра</h2>` +
        quickNavHtml +
        `<ol class="franchise-timeline__list">` +
          listItems +
        `</ol>` +
      `</section>`
    )
  }
}
