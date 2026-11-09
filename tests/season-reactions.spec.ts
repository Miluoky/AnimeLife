import { expect, test } from '@playwright/test'
import { mergeEpisodeReactions, reactionKey, reactionsForAnime } from '../src/data/episodeReactions'
import { mergeSeasonPlans } from '../src/data/seasonPlan'

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'без браузера'))

test('сетка сезона объединяется по id тайтла', () => {
  const merged = mergeSeasonPlans(
    { winter_2026: [{ id: '1', title: 'A', episodes: 12 }] },
    { winter_2026: [{ id: '1', title: 'A', episodes: 13 }, { id: '2', title: 'B' }], spring_2026: [{ id: '3', title: 'C' }] },
  )
  expect(merged.winter_2026).toEqual([
    { id: '1', title: 'A', episodes: 13 },
    { id: '2', title: 'B' },
  ])
  expect(merged.spring_2026).toEqual([{ id: '3', title: 'C' }])
})

test('реакции серий мержатся и режутся по потолку', () => {
  const a = { [reactionKey('10', 1)]: 'vibe' as const }
  const b = { [reactionKey('10', 2)]: 'masterpiece' as const, bad: 'nope' as never }
  const merged = mergeEpisodeReactions(a, b)
  expect(merged[reactionKey('10', 1)]).toBe('vibe')
  expect(merged[reactionKey('10', 2)]).toBe('masterpiece')
  expect(merged.bad).toBeUndefined()
  expect(reactionsForAnime('10', merged).map((x) => x.label)).toEqual(['вайб', 'шедевр'])
})
