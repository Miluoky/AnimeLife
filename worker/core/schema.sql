-- AnimeLife Core: своя БД вместо Appwrite TablesDB + Auth.
-- Применить: wrangler d1 execute anime_core --file=worker/core/schema.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT,
  labels TEXT NOT NULL DEFAULT '[]',
  prefs TEXT NOT NULL DEFAULT '{}',
  status INTEGER NOT NULL DEFAULT 1,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Сессии дублируются в KV (быстрый lookup по cookie); таблица — аудит и отзыв.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT,
  ip_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS lists (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  about TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '{}',
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  hidden INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  anime_id TEXT NOT NULL,
  text TEXT NOT NULL,
  rating INTEGER,
  author_name TEXT NOT NULL DEFAULT '',
  hidden INTEGER NOT NULL DEFAULT 0,
  moderated INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, anime_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_anime ON reviews (anime_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  text TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  hidden INTEGER NOT NULL DEFAULT 0,
  moderated INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_target ON comments (target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS votes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, target_id, kind)
);

CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  host_id TEXT NOT NULL,
  anime_id TEXT,
  title TEXT,
  episode INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  user_id TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_room ON messages (room_code, created_at);

-- Общий чат сообщества (аналог Appwrite community_chat + community_chat_reports).
CREATE TABLE IF NOT EXISTS community_chat (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  at INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  moderated INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_community_chat_at ON community_chat (at DESC);
CREATE INDEX IF NOT EXISTS idx_community_chat_user_at ON community_chat (user_id, at DESC);

CREATE TABLE IF NOT EXISTS community_chat_reports (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cc_reports_message ON community_chat_reports (message_id);
CREATE INDEX IF NOT EXISTS idx_cc_reports_user_at ON community_chat_reports (user_id, at DESC);

CREATE TABLE IF NOT EXISTS push_subs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  endpoint TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL,
  anime_ids TEXT NOT NULL DEFAULT '[]',
  site TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sent (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS follows (
  id TEXT PRIMARY KEY,
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON activity (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS profile_wall (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  frame TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  reply_to_name TEXT,
  likes INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wall_profile ON profile_wall (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wall_user ON profile_wall (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS profile_wall_likes (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wall_likes_comment ON profile_wall_likes (comment_id);
CREATE INDEX IF NOT EXISTS idx_wall_likes_user ON profile_wall_likes (user_id);

CREATE TABLE IF NOT EXISTS invites (
  user_id TEXT PRIMARY KEY,
  inviter_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invites_inviter ON invites (inviter_id);

CREATE TABLE IF NOT EXISTS manga_chapters (
  id TEXT PRIMARY KEY,
  manga_id TEXT NOT NULL,
  num TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT 'ru',
  title TEXT,
  pages TEXT NOT NULL DEFAULT '[]',
  uploader_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_manga_chapters ON manga_chapters (manga_id, lang);

-- Одна строка на браузер (sessionId из localStorage), как в Appwrite analytics.
CREATE TABLE IF NOT EXISTS analytics (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  episodes INTEGER NOT NULL DEFAULT 0,
  titles INTEGER NOT NULL DEFAULT 0,
  device TEXT,
  source TEXT,
  first_day INTEGER,
  ret1 INTEGER NOT NULL DEFAULT 0,
  ret7 INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_last ON analytics (last_seen);
CREATE INDEX IF NOT EXISTS idx_analytics_first_day ON analytics (first_day);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics (created_at);

CREATE TABLE IF NOT EXISTS analytics_stats (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL,
  at TEXT NOT NULL,
  label TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  episodes INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  newVisitors INTEGER NOT NULL DEFAULT 0,
  good INTEGER NOT NULL DEFAULT 0,
  mid INTEGER NOT NULL DEFAULT 0,
  poor INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_astats_period_at ON analytics_stats (period, at);
CREATE INDEX IF NOT EXISTS idx_astats_period_views ON analytics_stats (period, views);

CREATE TABLE IF NOT EXISTS client_errors (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  source TEXT,
  stack TEXT,
  path TEXT,
  browser TEXT,
  release TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  first INTEGER NOT NULL,
  last INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_errors_last ON client_errors (last DESC);

CREATE TABLE IF NOT EXISTS takedowns (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_links (
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_id)
);

CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  about TEXT NOT NULL DEFAULT '',
  members INTEGER NOT NULL DEFAULT 1,
  posts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clubs_last ON clubs (last_at DESC);
CREATE INDEX IF NOT EXISTS idx_clubs_members ON clubs (members DESC);

CREATE TABLE IF NOT EXISTS club_members (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (club_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_club_members_user ON club_members (user_id);

CREATE TABLE IF NOT EXISTS club_posts (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_club_posts ON club_posts (club_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_collections (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  about TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL DEFAULT '[]',
  count INTEGER NOT NULL DEFAULT 0,
  cover TEXT,
  likes INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ucol_owner ON user_collections (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ucol_likes ON user_collections (likes DESC);
CREATE INDEX IF NOT EXISTS idx_ucol_new ON user_collections (updated_at DESC);

CREATE TABLE IF NOT EXISTS collection_likes (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (collection_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_likes_user ON collection_likes (user_id);

-- Присутствие и WebRTC-сигналы комнат «Вместе» (голос без Realtime).
CREATE TABLE IF NOT EXISTS room_members (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  voice INTEGER NOT NULL DEFAULT 0,
  muted INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members (room_code, at DESC);

CREATE TABLE IF NOT EXISTS room_signals (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  data TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_room_signals_recv ON room_signals (room_code, receiver_id, at);

-- Оценки серий (аналог Appwrite episode_votes + episode_scores).
CREATE TABLE IF NOT EXISTS episode_votes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  anime_id TEXT NOT NULL,
  episode INTEGER NOT NULL,
  score INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, anime_id, episode)
);

CREATE INDEX IF NOT EXISTS idx_episode_votes_anime ON episode_votes (anime_id, episode);

CREATE TABLE IF NOT EXISTS episode_scores (
  anime_id TEXT NOT NULL,
  episode INTEGER NOT NULL,
  sum INTEGER NOT NULL DEFAULT 0,
  votes INTEGER NOT NULL DEFAULT 0,
  avg REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (anime_id, episode)
);

-- OAuth Shikimori (токены — только на сервере).
CREATE TABLE IF NOT EXISTS shiki_links (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  shiki_id INTEGER NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  access TEXT NOT NULL,
  refresh TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
