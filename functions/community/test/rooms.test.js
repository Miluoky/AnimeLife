import assert from 'node:assert/strict'
import test from 'node:test'
import { pressedAt } from '../src/rooms.js'

test('момент нажатия берём из часов зрителя, если они не сбиты', () => {
  const now = 1_000_000
  assert.equal(pressedAt(now - 1500, now), now - 1500)
  assert.equal(pressedAt(now + 400, now), now + 400)
  assert.equal(pressedAt(undefined, now), now)
  assert.equal(pressedAt('abc', now), now)
  assert.equal(pressedAt(now - 60_000, now), now)
  assert.equal(pressedAt(now + 5000, now), now)
})
