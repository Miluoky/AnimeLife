import { DB, UserError, hash, listRows, query } from './util.js'

/**
 * Списки и профили.
 *   list-init  создать строку списка пользователя в таблице lists (ID строки = ID пользователя).
 *              Дальше сайт пишет в неё сам: право на чтение и правку есть только у владельца.
 *              Строку создаёт функция, чтобы никто не занял чужой ID заранее.
 */

async function signedIn(api, req) {
  const userId = req.headers['x-appwrite-user-id']
  if (!userId) throw new UserError('Войдите в аккаунт.')
  const user = await api('GET', `/users/${userId}`)
  if (user.status === 404 || user.json.status === false) throw new UserError('Аккаунт не найден.')
  return user.json
}

export async function listInit(api, req) {
  const user = await signedIn(api, req)
  const row = await api('GET', `${DB}/lists/rows/${user.$id}`)
  if (row.status === 404) {
    await api('POST', `${DB}/lists/rows`, {
      rowId: user.$id,
      data: { data: '[]', updatedAt: 0 },
      permissions: [`read("user:${user.$id}")`, `update("user:${user.$id}")`],
    })
  }
  return { ok: true }
}

/*
 *   profile-save {about, summary}  открыть профиль: имя берётся из аккаунта, сводка (счётчики, любимое,
 *                                  достижения) приходит с сайта и проверяется на размер и форму;
 *   profile-hide                   закрыть профиль (строка удаляется);
 *   comment-save {animeId, episode, text, spoiler}  комментарий к серии;
 *   comment-delete {commentId}     убрать комментарий (автор или модератор);
 *   comment-report {commentId}     пожаловаться (после COMMENT_REPORTS_TO_HIDE жалоб комментарий скрывается);
 *   comment-mod-list, comment-mod-action {commentId, decision: hide|show|delete}  только для админов.
 * Жалобы лежат в таблице votes, как у отзывов: в reviewId — ID комментария, kind = report.
 */

const MAX_SUMMARY = 60000
const COMMENTS_PER_10MIN = 6
/** Столько жалоб от разных людей, и комментарий прячется до решения модератора. */
const COMMENT_REPORTS_TO_HIDE = 3

export async function profileSave(api, req, body) {
  const user = await signedIn(api, req)
  const summary = typeof body.summary === 'string' ? body.summary : JSON.stringify(body.summary ?? {})
  if (summary.length > MAX_SUMMARY) throw new UserError('Слишком большой профиль.')
  let parsed
  try {
    parsed = JSON.parse(summary)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
  } catch {
    throw new UserError('Неверные данные профиля.')
  }
  // Опыт для топа зрителей: сайт считает его по списку, здесь только отсекаем явную накрутку.
  const int = (v, max) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0)
  const xp = int(parsed.xp, 5_000_000)
  const weekKey = int(parsed.week?.key, 999_999)
  const weekXp = weekKey === isoWeekKey() ? int(parsed.week?.xp, 30_000) : 0
  await api('PUT', `${DB}/profiles/rows/${user.$id}`, {
    data: {
      name: (user.name || 'Зритель').slice(0, 64),
      about: String(body.about ?? '').trim().slice(0, 300),
      summary,
      xp,
      weekXp,
      weekKey: weekXp ? weekKey : 0,
      updatedAt: Date.now(),
    },
  })
  return { ok: true }
}

/** Номер недели ГГГГНН по ISO, как на сайте (src/data/xp.ts). */
export function isoWeekKey(t = Date.now()) {
  const d = new Date(t)
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const week = Math.ceil(((date - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)
  return date.getUTCFullYear() * 100 + week
}

export async function profileHide(api, req) {
  const user = await signedIn(api, req)
  await api('DELETE', `${DB}/profiles/rows/${user.$id}`)
  return { ok: true }
}

export async function commentSave(api, req, body) {
  const user = await signedIn(api, req)
  if (!/^\d{1,10}$/.test(String(body.animeId ?? ''))) throw new UserError('Неизвестный тайтл.')
  const episode = Number(body.episode)
  if (!Number.isInteger(episode) || episode < 1 || episode > 5000) throw new UserError('Неверный номер серии.')
  const text = String(body.text ?? '')
    .trim()
    .replace(/\n{3,}/g, '\n\n')
  if (text.length < 2) throw new UserError('Слишком короткий комментарий.')
  if (text.length > 1000) throw new UserError('Комментарий длиннее 1000 символов.')
  const now = Date.now()
  const recent = await listRows(api, 'comments', [
    { method: 'equal', attribute: 'userId', values: [user.$id] },
    { method: 'greaterThan', attribute: 'at', values: [now - 10 * 60 * 1000] },
    { method: 'limit', values: [COMMENTS_PER_10MIN] },
  ])
  if (recent.length >= COMMENTS_PER_10MIN) throw new UserError('Слишком много комментариев подряд, передохните пару минут.')
  const row = await api('POST', `${DB}/comments/rows`, {
    rowId: 'unique()',
    data: {
      animeId: String(body.animeId),
      episode,
      userId: user.$id,
      name: (user.name || 'Зритель').slice(0, 64),
      text,
      spoiler: Boolean(body.spoiler),
      hidden: false,
      at: now,
    },
  })
  return { comment: row.json }
}

export async function commentDelete(api, req, body) {
  const user = await signedIn(api, req)
  if (!/^[a-zA-Z0-9]{1,36}$/.test(String(body.commentId ?? ''))) throw new UserError('Комментарий не найден.')
  const row = await api('GET', `${DB}/comments/rows/${body.commentId}`)
  if (row.status === 404) return { ok: true }
  const isAdmin = (user.labels ?? []).includes('admin')
  if (row.json.userId !== user.$id && !isAdmin) throw new UserError('Убрать можно только свой комментарий.')
  await api('DELETE', `${DB}/comments/rows/${body.commentId}`)
  await deleteReports(api, body.commentId)
  return { ok: true }
}

async function getComment(api, commentId) {
  if (!/^[a-zA-Z0-9]{1,36}$/.test(String(commentId ?? ''))) throw new UserError('Комментарий не найден.')
  const row = await api('GET', `${DB}/comments/rows/${commentId}`)
  if (row.status === 404) throw new UserError('Комментарий не найден.')
  return row.json
}

const reportFilter = (commentId) => [
  { method: 'equal', attribute: 'reviewId', values: [commentId] },
  { method: 'equal', attribute: 'kind', values: ['report'] },
]

async function deleteReports(api, commentId) {
  for (;;) {
    const rows = await listRows(api, 'votes', [...reportFilter(commentId), { method: 'limit', values: [100] }])
    await Promise.all(rows.map((r) => api('DELETE', `${DB}/votes/rows/${r.$id}`)))
    if (rows.length < 100) return
  }
}

export async function commentReport(api, req, body) {
  const user = await signedIn(api, req)
  const comment = await getComment(api, body.commentId)
  if (comment.userId === user.$id) throw new UserError('На свой комментарий жаловаться нельзя.')
  const voteId = 'v' + hash(`comment:${comment.$id}:${user.$id}:report`)
  if ((await api('GET', `${DB}/votes/rows/${voteId}`)).status !== 404) return { ok: true, already: true }
  await api('PUT', `${DB}/votes/rows/${voteId}`, {
    data: { reviewId: comment.$id, animeId: comment.animeId, userId: user.$id, kind: 'report' },
  })
  const count = await api('GET', `${DB}/votes/rows?${[...reportFilter(comment.$id), { method: 'limit', values: [1] }].map(query).join('&')}`)
  const reports = count.json.total ?? 0
  // Модератор уже оставил комментарий (moderated): повторные жалобы его снова не прячут.
  const hidden = comment.hidden || (!comment.moderated && reports >= COMMENT_REPORTS_TO_HIDE)
  await api('PATCH', `${DB}/comments/rows/${comment.$id}`, { data: { reports, hidden } })
  return { ok: true, hidden }
}

async function signedAdmin(api, req) {
  const user = await signedIn(api, req)
  if (!(user.labels ?? []).includes('admin')) throw new UserError('Нужны права модератора.')
  return user
}

export async function commentModList(api, req) {
  await signedAdmin(api, req)
  const comments = await listRows(api, 'comments', [
    {
      method: 'or',
      values: [
        { method: 'greaterThan', attribute: 'reports', values: [0] },
        { method: 'equal', attribute: 'hidden', values: [true] },
      ],
    },
    { method: 'orderDesc', attribute: 'reports' },
    { method: 'limit', values: [100] },
  ])
  return { comments }
}

export async function commentModAction(api, req, body) {
  await signedAdmin(api, req)
  const comment = await getComment(api, body.commentId)
  if (body.decision === 'delete') {
    await api('DELETE', `${DB}/comments/rows/${comment.$id}`)
    await deleteReports(api, comment.$id)
    return { ok: true }
  }
  if (body.decision !== 'hide' && body.decision !== 'show') throw new UserError('Неизвестное действие модератора.')
  const row = await api('PATCH', `${DB}/comments/rows/${comment.$id}`, {
    data: { hidden: body.decision === 'hide', moderated: true },
  })
  return { comment: row.json }
}
