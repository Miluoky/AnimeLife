-- Оценки серий + Shikimori OAuth (Core без Appwrite).
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

CREATE TABLE IF NOT EXISTS shiki_links (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  shiki_id INTEGER NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  access TEXT NOT NULL,
  refresh TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
