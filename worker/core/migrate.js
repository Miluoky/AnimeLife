/**
 * Лёгкие миграции D1 при старте Core API (ALTER в try/catch — колонка уже есть).
 */

let done = false

const ALTERS = [
  'ALTER TABLE users ADD COLUMN moderated_by TEXT',
  'ALTER TABLE users ADD COLUMN moderated_at INTEGER',
  'ALTER TABLE users ADD COLUMN ban_reason TEXT',
  'ALTER TABLE reviews ADD COLUMN moderated_by TEXT',
  'ALTER TABLE reviews ADD COLUMN moderated_at INTEGER',
  'ALTER TABLE comments ADD COLUMN moderated_by TEXT',
  'ALTER TABLE comments ADD COLUMN moderated_at INTEGER',
  'ALTER TABLE community_chat ADD COLUMN moderated_by TEXT',
  'ALTER TABLE community_chat ADD COLUMN moderated_at INTEGER',
  'ALTER TABLE club_posts ADD COLUMN moderated INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE club_posts ADD COLUMN moderated_by TEXT',
  'ALTER TABLE club_posts ADD COLUMN moderated_at INTEGER',
  'ALTER TABLE profiles ADD COLUMN slug TEXT',
]

export async function ensureMigrations(env) {
  if (done || !env?.DB) return
  done = true
  for (const sql of ALTERS) {
    try {
      await env.DB.prepare(sql).run()
    } catch {
      // Колонка уже существует или таблица без поддержки DEFAULT — ок для прод.
    }
  }
  try {
    await env.DB.prepare(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_slug ON profiles (slug) WHERE slug IS NOT NULL',
    ).run()
  } catch {
    // ignore
  }
}
