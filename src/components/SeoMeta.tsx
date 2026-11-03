import { useEffect, useId, useMemo } from 'react'

export interface SeoBreadcrumbItem {
  name: string
  url: string
  position?: number
}

export interface SeoFaqItem {
  question?: string
  q?: string
  answer?: string
  a?: string
}

export interface SeoRatingData {
  ratingValue?: number | string
  value?: number | string
  bestRating?: number | string
  worstRating?: number | string
  ratingCount?: number | string
  votes?: number | string
  reviewCount?: number | string
}

export interface SeoMetaProps {
  /** Optional explicit instance ID in the shared registry */
  id?: string
  /** Schema.org TVSeries object */
  series?: Record<string, any> | null
  /** Schema.org Movie object */
  movie?: Record<string, any> | null
  /** Schema.org TVEpisode object */
  episode?: Record<string, any> | null
  /** Schema.org VideoObject */
  video?: Record<string, any> | null
  /** Schema.org BreadcrumbList or array of breadcrumb items */
  breadcrumbs?: Record<string, any> | SeoBreadcrumbItem[] | null
  /** Schema.org FAQPage or array of questions and answers */
  faq?: Record<string, any> | SeoFaqItem[] | null
  /** Schema.org AggregateRating or rating metrics */
  rating?: Record<string, any> | SeoRatingData | null
  /** Generic array of Schema.org objects */
  items?: Array<Record<string, any> | null | undefined>
  /** Raw schema or array of schemas */
  schema?: Record<string, any> | Array<Record<string, any>> | null
}

const ORIGIN = 'https://animelife.top'
const SCRIPT_ID = 'app-jsonld'

// Global shared registry for coordinating schemas across multiple components
const schemaRegistry = new Map<string, Record<string, any>[]>()
let isApplyingFromObserver = false
let domObserver: MutationObserver | null = null

function cleanSchemaNode(item: Record<string, any>): Record<string, any> {
  const copy = { ...item }
  // When inside @graph, @context is declared at top level
  delete copy['@context']
  return copy
}

function normalizeBreadcrumbs(
  breadcrumbs: Record<string, any> | SeoBreadcrumbItem[]
): Record<string, any> {
  if ('@type' in breadcrumbs && breadcrumbs['@type'] === 'BreadcrumbList') {
    return cleanSchemaNode(breadcrumbs)
  }
  const items = Array.isArray(breadcrumbs) ? breadcrumbs : []
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => {
      const fullUrl = c.url.startsWith('http')
        ? c.url
        : `${ORIGIN}${c.url.startsWith('/') ? '' : '/'}${c.url}`
      return {
        '@type': 'ListItem',
        position: c.position || i + 1,
        name: c.name,
        item: fullUrl,
      }
    }),
  }
}

function normalizeFaq(
  faq: Record<string, any> | SeoFaqItem[]
): Record<string, any> {
  if ('@type' in faq && faq['@type'] === 'FAQPage') {
    return cleanSchemaNode(faq)
  }
  const items = Array.isArray(faq) ? faq : []
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q || item.question || '',
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a || item.answer || '',
      },
    })),
  }
}

function normalizeRating(
  rating: Record<string, any> | SeoRatingData,
  targetName?: string,
  targetUrl?: string
): Record<string, any> {
  if ('@type' in rating && rating['@type'] === 'AggregateRating') {
    return cleanSchemaNode(rating)
  }
  const r = rating as SeoRatingData
  const node: Record<string, any> = {
    '@type': 'AggregateRating',
    ratingValue: String(r.ratingValue ?? r.value ?? '0'),
    bestRating: String(r.bestRating ?? '10'),
    worstRating: String(r.worstRating ?? '1'),
    ratingCount: Number(r.ratingCount ?? r.votes ?? 1),
  }
  if (r.reviewCount !== undefined) {
    node.reviewCount = Number(r.reviewCount)
  }
  if (targetName) {
    node.itemReviewed = {
      '@type': 'Thing',
      name: targetName,
      url: targetUrl || ORIGIN,
    }
  }
  return node
}

/**
 * Builds a single coherent Schema.org @graph root container.
 */
export function buildSeoGraph(
  items: Array<Record<string, any> | null | undefined>
): Record<string, any> | null {
  const filtered = items.filter(
    (item): item is Record<string, any> => Boolean(item && typeof item === 'object')
  )
  if (filtered.length === 0) return null

  // Ensure individual items inside @graph do not have nested @context
  const graphNodes = filtered.map(cleanSchemaNode)

  return {
    '@context': 'https://schema.org',
    '@graph': graphNodes,
  }
}

function syncHeadScript() {
  if (typeof document === 'undefined') return

  const allItems: Record<string, any>[] = []
  for (const items of schemaRegistry.values()) {
    for (const item of items) {
      if (item && typeof item === 'object') {
        allItems.push(item)
      }
    }
  }

  let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null

  if (allItems.length === 0) {
    if (script && script.dataset.managedBySeoMeta) {
      script.remove()
    }
    return
  }

  const graphPayload = buildSeoGraph(allItems)
  if (!graphPayload) return

  const serialized = JSON.stringify(graphPayload, null, 2).replace(/</g, '\\u003c')

  isApplyingFromObserver = true
  try {
    if (!script) {
      script = document.createElement('script')
      script.id = SCRIPT_ID
      script.type = 'application/ld+json'
      script.dataset.managedBySeoMeta = 'true'
      document.head.appendChild(script)
    } else {
      script.dataset.managedBySeoMeta = 'true'
    }

    if (script.textContent !== serialized) {
      script.textContent = serialized
    }
  } finally {
    isApplyingFromObserver = false
  }

  ensureObserver()
}

function ensureObserver() {
  if (typeof document === 'undefined' || domObserver) return

  domObserver = new MutationObserver((mutations) => {
    if (isApplyingFromObserver) return

    let needsResync = false

    for (const mutation of mutations) {
      // Check if script tag was removed by another component's unmount cleanup
      if (mutation.type === 'childList') {
        for (const removed of Array.from(mutation.removedNodes)) {
          if (removed instanceof HTMLElement && removed.id === SCRIPT_ID) {
            if (schemaRegistry.size > 0) {
              needsResync = true
            }
          }
        }
        for (const added of Array.from(mutation.addedNodes)) {
          if (added instanceof HTMLElement && added.id === SCRIPT_ID && !added.dataset.managedBySeoMeta) {
            // An external component created its own script; absorb it
            try {
              const text = added.textContent || ''
              if (text.trim()) {
                const parsed = JSON.parse(text)
                const extItems = Array.isArray(parsed?.['@graph'])
                  ? parsed['@graph']
                  : [parsed]
                schemaRegistry.set('__external_clobber_guard__', extItems.filter(Boolean))
                needsResync = true
              }
            } catch {
              // Ignore invalid JSON from external scripts
            }
          }
        }
      }

      // Check if an external caller directly replaced textContent
      if (mutation.type === 'characterData' || (mutation.target instanceof HTMLElement && mutation.target.id === SCRIPT_ID)) {
        const el = document.getElementById(SCRIPT_ID)
        if (el && !el.dataset.managedBySeoMeta) {
          needsResync = true
        }
      }
    }

    if (needsResync) {
      syncHeadScript()
    }
  })

  domObserver.observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  })
}

/**
 * Hook to manage Schema.org schemas in the unified @graph registry.
 */
export function useSeoMeta(
  props: SeoMetaProps | Array<Record<string, any> | null | undefined>,
  explicitId?: string
) {
  const generatedId = useId()
  const registryId = explicitId || (typeof props === 'object' && !Array.isArray(props) && props.id ? props.id : generatedId)

  const items = useMemo(() => {
    if (Array.isArray(props)) {
      return props.filter((p): p is Record<string, any> => Boolean(p))
    }

    const collected: Record<string, any>[] = []

    // 1. Primary entity (TVSeries or Movie)
    let primaryTargetName: string | undefined
    let primaryTargetUrl: string | undefined

    if (props.series) {
      const s = cleanSchemaNode(props.series)
      s['@type'] = s['@type'] || 'TVSeries'
      primaryTargetName = s.name
      primaryTargetUrl = s.url
      collected.push(s)
    }

    if (props.movie) {
      const m = cleanSchemaNode(props.movie)
      m['@type'] = m['@type'] || 'Movie'
      primaryTargetName = m.name
      primaryTargetUrl = m.url
      collected.push(m)
    }

    // 2. Episode
    if (props.episode) {
      const ep = cleanSchemaNode(props.episode)
      ep['@type'] = ep['@type'] || 'TVEpisode'
      collected.push(ep)
    }

    // 3. Video
    if (props.video) {
      const v = cleanSchemaNode(props.video)
      v['@type'] = v['@type'] || 'VideoObject'
      collected.push(v)
    }

    // 4. Breadcrumbs
    if (props.breadcrumbs) {
      collected.push(normalizeBreadcrumbs(props.breadcrumbs))
    }

    // 5. FAQ
    if (props.faq) {
      collected.push(normalizeFaq(props.faq))
    }

    // 6. AggregateRating
    if (props.rating) {
      const r = normalizeRating(props.rating, primaryTargetName, primaryTargetUrl)
      // If primary entity exists and doesn't have aggregateRating, also enrich it
      if (props.series && !props.series.aggregateRating && collected[0]) {
        collected[0].aggregateRating = { ...r }
      } else if (props.movie && !props.movie.aggregateRating && collected[0]) {
        collected[0].aggregateRating = { ...r }
      }
      collected.push(r)
    }

    // 7. Generic items
    if (props.items) {
      for (const item of props.items) {
        if (item) collected.push(cleanSchemaNode(item))
      }
    }

    // 8. Raw schema
    if (props.schema) {
      if (Array.isArray(props.schema)) {
        for (const item of props.schema) {
          if (item) collected.push(cleanSchemaNode(item))
        }
      } else {
        collected.push(cleanSchemaNode(props.schema))
      }
    }

    return collected
  }, [props])

  useEffect(() => {
    if (items.length > 0) {
      schemaRegistry.set(registryId, items)
    } else {
      schemaRegistry.delete(registryId)
    }
    syncHeadScript()

    return () => {
      schemaRegistry.delete(registryId)
      syncHeadScript()
    }
  }, [registryId, items])
}

/**
 * Unified Schema.org component that injects a merged @graph JSON-LD into document.head.
 * Multiple instances automatically combine into a single root @graph without script clobbering.
 */
export default function SeoMeta(props: SeoMetaProps) {
  useSeoMeta(props, props.id)
  return null
}
