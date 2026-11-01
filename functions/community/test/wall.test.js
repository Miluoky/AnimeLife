import assert from 'node:assert/strict'
import test from 'node:test'
import { socialActions } from '../src/social.js'

function fakeDb(
  users = {
    u1: { $id: 'u1', name: 'Мика' },
    u2: { $id: 'u2', name: 'Рэй' },
    u3: { $id: 'u3', name: 'Син' },
    admin: { $id: 'admin', name: 'Мод', labels: ['admin'] },
  },
) {
  const tables = {}
  let seq = 0
  const table = (name) => (tables[name] ??= new Map())

  const api = async (method, path, body) => {
    if (path.startsWith('/users/')) {
      const u = users[path.split('/')[2]]
      return u ? { status: 200, json: u } : { status: 404, json: {} }
    }
    const m = path.match(/^\/tablesdb\/anime\/tables\/([a-z_]+)\/rows(?:\/([^?]+))?(?:\?(.*))?$/)
    if (!m) throw new Error(`unexpected ${method} ${path}`)
    const [, name, id, qs] = m
    const rows = table(name)

    if (method === 'GET' && !id) {
      const queries = qs ? new URLSearchParams(qs).getAll('queries[]').map((q) => JSON.parse(q)) : []
      let found = [...rows.values()]
      for (const q of queries) {
        if (q.method === 'equal') found = found.filter((r) => q.values.includes(r[q.attribute]))
        if (q.method === 'greaterThan') found = found.filter((r) => r[q.attribute] > q.values[0])
        if (q.method === 'orderDesc') found = found.sort((a, b) => (b[q.attribute] ?? 0) - (a[q.attribute] ?? 0))
      }
      const limit = queries.find((q) => q.method === 'limit')?.values[0] ?? found.length
      return { status: 200, json: { total: found.length, rows: found.slice(0, limit) } }
    }

    if (method === 'GET') return rows.has(id) ? { status: 200, json: rows.get(id) } : { status: 404, json: {} }

    if (method === 'DELETE') {
      rows.delete(id)
      return { status: 204, json: {} }
    }

    if (method === 'POST') {
      const rowId = body.rowId === 'unique()' ? `w${++seq}` : body.rowId
      const row = { $id: rowId, ...body.data }
      rows.set(rowId, row)
      return { status: 201, json: row }
    }

    if (method === 'PUT') {
      const row = { $id: id, ...body.data }
      rows.set(id, row)
      return { status: 200, json: row }
    }

    if (method === 'PATCH') {
      const prev = rows.get(id) || {}
      const row = { ...prev, ...body.data }
      rows.set(id, row)
      return { status: 200, json: row }
    }

    throw new Error(`unexpected ${method} ${path}`)
  }

  return { api, tables, table }
}

const as = (userId) => ({ headers: userId ? { 'x-appwrite-user-id': userId } : {} })
const run = (db, action, userId, body = {}) => socialActions[action](db.api, as(userId), body)

test('wall-post: требует авторизации и проверяет валидность ID и длину текста', async () => {
  const db = fakeDb()

  // Гость не может писать
  await assert.rejects(run(db, 'wall-post', null, { profileId: 'u2', text: 'Привет' }), /Войдите/)

  // Невалидный ID профиля
  await assert.rejects(run(db, 'wall-post', 'u1', { profileId: 'bad!id', text: 'Привет' }), /не найдена/)

  // Слишком короткий текст
  await assert.rejects(run(db, 'wall-post', 'u1', { profileId: 'u2', text: ' ' }), /Текст записи: хотя бы 2 символа/)

  // Слишком длинный текст (> 500)
  const longText = 'а'.repeat(501)
  await assert.rejects(run(db, 'wall-post', 'u1', { profileId: 'u2', text: longText }), /длиннее 500/)
})

test('wall-post: успешное создание записи, сохранение автора, стилей и replyToName', async () => {
  const db = fakeDb()

  // Добавим в профиль u1 кастомный аватар и рамку
  db.table('profiles').set('u1', {
    $id: 'u1',
    summary: JSON.stringify({
      style: { avatarUrl: 'https://cdn.example.com/avatar.gif', frame: 'inferno' },
    }),
  })

  const res = await run(db, 'wall-post', 'u1', {
    profileId: 'u2',
    text: 'Отличный профиль и подборки!',
    replyToName: 'Рэй',
  })

  assert.ok(res.comment)
  assert.equal(res.comment.profileId, 'u2')
  assert.equal(res.comment.userId, 'u1')
  assert.equal(res.comment.name, 'Мика')
  assert.equal(res.comment.avatarUrl, 'https://cdn.example.com/avatar.gif')
  assert.equal(res.comment.frame, 'inferno')
  assert.equal(res.comment.text, 'Отличный профиль и подборки!')
  assert.equal(res.comment.replyToName, 'Рэй')
  assert.equal(res.comment.likes, 0)
  assert.equal(res.comment.hidden, false)
})

test('wall-post: автомодерация скрывает мат, возвращает held: мат', async () => {
  const db = fakeDb()

  const res = await run(db, 'wall-post', 'u1', {
    profileId: 'u2',
    text: 'Ну ты и хуйло нехороший человек',
  })

  assert.equal(res.comment.hidden, true)
  assert.equal(res.held, 'мат')
})

test('wall-post: антиспам, флуд и ограничение частоты публикаций', async () => {
  const db = fakeDb()

  // Повтор того же текста
  await run(db, 'wall-post', 'u1', { profileId: 'u2', text: 'Уникальное первое сообщение' })
  await assert.rejects(
    run(db, 'wall-post', 'u1', { profileId: 'u2', text: 'Уникальное первое сообщение' }),
    /Вы уже отправили такой же текст/,
  )

  // Флуд символами
  await assert.rejects(
    run(db, 'wall-post', 'u1', { profileId: 'u2', text: 'аааааааааааааааааааааааа' }),
    /Похоже на флуд/,
  )

  // Лимит 6 постов за 10 минут
  for (let i = 1; i <= 5; i++) {
    await run(db, 'wall-post', 'u1', { profileId: 'u2', text: `Сообщение номер ${i}` })
  }
  // 1-е было уникальное + 5 новых = 6 постов. 7-й должен вызвать лимит:
  await assert.rejects(
    run(db, 'wall-post', 'u1', { profileId: 'u2', text: 'Седьмое сообщение' }),
    /Слишком много записей/,
  )
})

test('wall-list: возвращает список, скрывает чужие пометки на проверке, передает liked', async () => {
  const db = fakeDb()

  // Публикуем 2 обычных и 1 скрытый комментарий
  const p1 = await run(db, 'wall-post', 'u1', { profileId: 'u2', text: 'Первый видимый' })
  const pHidden = await run(db, 'wall-post', 'u3', { profileId: 'u2', text: 'Тут хуйло и мат' })
  const p2 = await run(db, 'wall-post', 'u1', { profileId: 'u2', text: 'Второй видимый' })

  // Лайкаем первый комментарий от лица u1
  await run(db, 'wall-like', 'u1', { commentId: p1.comment.$id })

  // Гость видит только 2 видимых комментария
  const guestList = await run(db, 'wall-list', null, { profileId: 'u2' })
  assert.equal(guestList.comments.length, 2)
  assert.equal(guestList.comments[0].liked, false)
  assert.equal(guestList.comments[1].liked, false)

  // Автор скрытого (u3) видит свой скрытый комментарий
  const u3List = await run(db, 'wall-list', 'u3', { profileId: 'u2' })
  assert.equal(u3List.comments.length, 3)
  const hiddenComm = u3List.comments.find((c) => c.id === pHidden.comment.$id)
  assert.ok(hiddenComm)
  assert.equal(hiddenComm.hidden, true)

  // Владелец стены (u2) видит все комментарии, включая скрытый
  const u2List = await run(db, 'wall-list', 'u2', { profileId: 'u2' })
  assert.equal(u2List.comments.length, 3)

  // u1 видит отметку liked: true у p1
  const u1List = await run(db, 'wall-list', 'u1', { profileId: 'u2' })
  const c1 = u1List.comments.find((c) => c.id === p1.comment.$id)
  assert.ok(c1)
  assert.equal(c1.liked, true)
  assert.equal(c1.likes, 1)
})

test('wall-like: переключение лайка (включение / выключение) и множественные лайки', async () => {
  const db = fakeDb()

  const { comment } = await run(db, 'wall-post', 'u1', { profileId: 'u2', text: 'Крутая запись' })

  // Лайк от гостя запрещен
  await assert.rejects(run(db, 'wall-like', null, { commentId: comment.$id }), /Войдите/)

  // Лайк от u2
  const like1 = await run(db, 'wall-like', 'u2', { commentId: comment.$id })
  assert.deepEqual(like1, { liked: true, likes: 1 })

  // Повторный клик от u2 снимает лайк
  const unlike1 = await run(db, 'wall-like', 'u2', { commentId: comment.$id })
  assert.deepEqual(unlike1, { liked: false, likes: 0 })

  // Лайки от двух разных пользователей
  await run(db, 'wall-like', 'u2', { commentId: comment.$id })
  const like3 = await run(db, 'wall-like', 'u3', { commentId: comment.$id })
  assert.deepEqual(like3, { liked: true, likes: 2 })
})

test('wall-delete: автор, владелец стены и админ могут удалять; посторонний не может', async () => {
  const db = fakeDb()

  // 1. Автор удаляет свой комментарий
  const c1 = await run(db, 'wall-post', 'u1', { profileId: 'u2', text: 'Удалит автор' })
  await run(db, 'wall-like', 'u3', { commentId: c1.comment.$id })
  assert.equal(db.table('profile_wall').size, 1)

  const del1 = await run(db, 'wall-delete', 'u1', { commentId: c1.comment.$id })
  assert.deepEqual(del1, { ok: true })
  assert.equal(db.table('profile_wall').size, 0)
  assert.equal(db.table('profile_wall_likes').size, 0) // Лайки тоже очищены

  // 2. Владелец стены (u2) удаляет комментарий автора (u1)
  const c2 = await run(db, 'wall-post', 'u1', { profileId: 'u2', text: 'Удалит владелец стены' })
  const del2 = await run(db, 'wall-delete', 'u2', { commentId: c2.comment.$id })
  assert.deepEqual(del2, { ok: true })
  assert.equal(db.table('profile_wall').size, 0)

  // 3. Админ удаляет комментарий
  const c3 = await run(db, 'wall-post', 'u1', { profileId: 'u2', text: 'Удалит админ' })
  const del3 = await run(db, 'wall-delete', 'admin', { commentId: c3.comment.$id })
  assert.deepEqual(del3, { ok: true })
  assert.equal(db.table('profile_wall').size, 0)

  // 4. Посторонний зритель (u3) НЕ может удалить комментарий
  const c4 = await run(db, 'wall-post', 'u1', { profileId: 'u2', text: 'Чужой комментарий' })
  await assert.rejects(
    run(db, 'wall-delete', 'u3', { commentId: c4.comment.$id }),
    /Удалить запись может только автор, владелец стены или администратор/,
  )
  assert.equal(db.table('profile_wall').size, 1)
})
