import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cleanCommunityChat,
  communityChatDelete,
  communityChatModAction,
  communityChatModList,
  communityChatReport,
  communityChatSend,
} from '../src/communityChat.js'

function fakeApi({ user = { $id: 'user1', name: 'Мика' }, recent = [], rows = [], reportRows = [] } = {}) {
  const calls = []
  let currentUser = user
  const api = async (method, path, body) => {
    calls.push({ method, path, body })
    if (path.startsWith('/users/')) return currentUser ? { status: 200, json: currentUser } : { status: 404, json: {} }
    if (path.includes('/community_chat_reports/rows?')) {
      const params = new URLSearchParams(path.slice(path.indexOf('?') + 1))
      const queries = params.getAll('queries[]').map((query) => JSON.parse(query))
      let found = [...reportRows]
      for (const query of queries) {
        const value = query.values?.[0]
        if (query.method === 'equal') found = found.filter((row) => row[query.attribute] === value)
        if (query.method === 'greaterThan') found = found.filter((row) => row[query.attribute] > value)
      }
      return { status: 200, json: { rows: found.slice(0, queries.find((query) => query.method === 'limit')?.values[0] ?? found.length) } }
    }
    if (path.includes('/community_chat_reports/rows/')) {
      const id = path.split('/').at(-1)
      const row = reportRows.find((item) => item.$id === id)
      if (method === 'GET') return row ? { status: 200, json: row } : { status: 404, json: {} }
      if (method === 'PUT') {
        const created = { $id: id, ...body.data }
        reportRows.push(created)
        return { status: 200, json: created }
      }
      if (method === 'DELETE') {
        reportRows.splice(0, reportRows.length, ...reportRows.filter((item) => item.$id !== id))
        return { status: 204, json: {} }
      }
    }
    if (method === 'GET' && path.includes('/community_chat/rows?')) {
      const params = new URLSearchParams(path.slice(path.indexOf('?') + 1))
      const queries = params.getAll('queries[]').map((query) => JSON.parse(query))
      if (queries.some((query) => query.method === 'greaterThan')) return { status: 200, json: { rows: [...recent] } }
      const lessThan = queries.find((query) => query.method === 'lessThan')
      const found = lessThan ? rows.filter((row) => row[lessThan.attribute] < lessThan.values[0]) : rows
      return { status: 200, json: { rows: [...found] } }
    }
    if (method === 'POST' && path.endsWith('/community_chat/rows')) {
      const created = { $id: 'message1', ...body.data }
      rows.push(created)
      return { status: 201, json: created }
    }
    if (path.includes('/community_chat/rows/')) {
      const id = path.split('/').at(-1)
      const row = rows.find((item) => item.$id === id)
      if (method === 'GET') return row ? { status: 200, json: row } : { status: 404, json: {} }
      if (method === 'PATCH') {
        if (!row) return { status: 404, json: {} }
        Object.assign(row, body.data)
        return { status: 200, json: row }
      }
      if (method === 'DELETE') {
        rows.splice(0, rows.length, ...rows.filter((item) => item.$id !== id))
        return { status: 204, json: {} }
      }
    }
    throw new Error(`Unexpected request: ${method} ${path}`)
  }
  return { api, calls, rows, reportRows, setUser: (next) => (currentUser = next) }
}

const request = { headers: { 'x-appwrite-user-id': 'user1' } }

test('chat send uses authenticated identity and normalizes message text', async () => {
  const fake = fakeApi()
  const result = await communityChatSend(fake.api, request, { text: '  Привет,   мир!  ', name: 'Подделка' })
  assert.equal(result.message.userId, 'user1')
  assert.equal(result.message.name, 'Мика')
  assert.equal(result.message.text, 'Привет, мир!')
  assert.equal(fake.calls.filter((call) => call.method === 'POST').length, 1)
})

test('chat send requires an account', async () => {
  const fake = fakeApi({ user: null })
  await assert.rejects(communityChatSend(fake.api, { headers: {} }, { text: 'Привет' }), /Войдите/)
  assert.equal(fake.calls.some((call) => call.method === 'POST'), false)
})

test('chat send rejects oversized messages and rate limits bursts', async () => {
  const tooLong = fakeApi()
  await assert.rejects(communityChatSend(tooLong.api, request, { text: 'x'.repeat(501) }), /500 символов/)
  assert.equal(tooLong.calls.some((call) => call.method === 'POST'), false)

  const limited = fakeApi({ recent: Array.from({ length: 5 }, () => ({})) })
  await assert.rejects(communityChatSend(limited.api, request, { text: 'Ещё сообщение' }), /подождите/)
  assert.equal(limited.calls.some((call) => call.method === 'POST'), false)
})

test('chat delete allows the author and moderator only', async () => {
  const message = { $id: 'message1', userId: 'user1' }
  const author = fakeApi({ rows: [message], reportRows: [{ $id: 'report1', messageId: message.$id }] })
  await communityChatDelete(author.api, request, { messageId: message.$id })
  assert.equal(author.rows.length, 0)
  assert.equal(author.reportRows.length, 0)

  const stranger = fakeApi({ user: { $id: 'user2', name: 'Зритель' }, rows: [message] })
  await assert.rejects(communityChatDelete(stranger.api, { headers: { 'x-appwrite-user-id': 'user2' } }, { messageId: message.$id }), /только его автор или модератор/)
  assert.equal(stranger.calls.some((call) => call.method === 'DELETE'), false)

  const moderator = fakeApi({ user: { $id: 'admin', labels: ['admin'] }, rows: [message] })
  await communityChatDelete(moderator.api, { headers: { 'x-appwrite-user-id': 'admin' } }, { messageId: message.$id })
  assert.equal(moderator.rows.length, 0)
})

test('chat reports are unique, reject self-reports, and hide after three users report', async () => {
  const message = { $id: 'message1', userId: 'author', hidden: false, moderated: false, reports: 0 }
  const fake = fakeApi({ user: { $id: 'author', name: 'Автор' }, rows: [message] })
  await assert.rejects(
    communityChatReport(fake.api, { headers: { 'x-appwrite-user-id': 'author' } }, { messageId: message.$id }),
    /На своё сообщение/,
  )

  for (const id of ['reporter1', 'reporter2', 'reporter3']) {
    fake.setUser({ $id: id, name: id })
    const result = await communityChatReport(fake.api, { headers: { 'x-appwrite-user-id': id } }, { messageId: message.$id })
    assert.equal(result.hidden, id === 'reporter3')
  }
  assert.equal(message.reports, 3)
  assert.equal(message.hidden, true)

  fake.setUser({ $id: 'reporter3', name: 'reporter3' })
  const duplicate = await communityChatReport(fake.api, { headers: { 'x-appwrite-user-id': 'reporter3' } }, { messageId: message.$id })
  assert.equal(duplicate.already, true)
  assert.equal(fake.reportRows.length, 3)
})

test('chat moderation is admin-only and can restore a hidden message', async () => {
  const message = { $id: 'message1', userId: 'author', text: 'Hello', hidden: true, reports: 3 }
  const fake = fakeApi({ rows: [message] })
  await assert.rejects(communityChatModList(fake.api, request), /права модератора/)

  fake.setUser({ $id: 'admin', labels: ['admin'] })
  const queue = await communityChatModList(fake.api, { headers: { 'x-appwrite-user-id': 'admin' } })
  assert.equal(queue.messages[0].$id, message.$id)
  const result = await communityChatModAction(
    fake.api,
    { headers: { 'x-appwrite-user-id': 'admin' } },
    { messageId: message.$id, decision: 'show' },
  )
  assert.equal(result.message.hidden, false)
  assert.equal(result.message.moderated, true)
})

test('scheduled cleanup deletes chat messages older than seven days', async () => {
  const now = 30 * 24 * 60 * 60 * 1000
  const day = 24 * 60 * 60 * 1000
  const fake = fakeApi({
    rows: [
      { $id: 'old1', at: now - 8 * day },
      { $id: 'old2', at: now - 9 * day },
      { $id: 'recent', at: now - day },
    ],
    reportRows: [{ $id: 'old-report', messageId: 'old1' }],
  })
  assert.equal(await cleanCommunityChat(fake.api, now), 2)
  assert.deepEqual(fake.rows.map((row) => row.$id), ['recent'])
  assert.equal(fake.reportRows.length, 0)
})