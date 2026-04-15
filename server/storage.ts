import Database from "better-sqlite3";
import { type User, type InsertShow, type Show } from "@shared/schema";
import path from "path";

// ── SQLite setup ─────────────────────────────────────────────────────────────
// DB_PATH env var lets Render (or any host) point to a persistent volume.
// Falls back to process.cwd()/shows.db for local dev.
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "shows.db");
const sqlite = new Database(DB_PATH);
console.log("[db] SQLite path:", DB_PATH);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    username TEXT UNIQUE,
    is_public INTEGER DEFAULT 1
  )
`);
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS shows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    streaming_service TEXT NOT NULL,
    genre TEXT,
    status TEXT NOT NULL DEFAULT 'watching',
    season INTEGER,
    episode INTEGER,
    notes TEXT,
    poster_url TEXT,
    rating INTEGER
  )
`);
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )
`);
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    UNIQUE(follower_id, following_id)
  )
`);
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )
`);
// Migrations
try { sqlite.exec(`ALTER TABLE shows ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0`); } catch {}
try { sqlite.exec(`ALTER TABLE shows ADD COLUMN rating INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE users ADD COLUMN username TEXT UNIQUE`); } catch {}
try { sqlite.exec(`ALTER TABLE users ADD COLUMN is_public INTEGER DEFAULT 1`); } catch {}

// ── Interface ─────────────────────────────────────────────────────────────────
export interface IStorage {
  createUser(email: string, passwordHash: string, displayName: string): Promise<User>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;

  createSession(token: string, userId: number): Promise<void>;
  getSession(token: string): Promise<number | undefined>;
  deleteSession(token: string): Promise<void>;

  getAllShows(userId: number): Promise<Show[]>;
  getShow(id: number, userId: number): Promise<Show | undefined>;
  createShow(userId: number, show: InsertShow): Promise<Show>;
  updateShow(id: number, userId: number, show: Partial<InsertShow>): Promise<Show | undefined>;
  deleteShow(id: number, userId: number): Promise<boolean>;
  clearShowsForUser(userId: number): Promise<void>;

  // Password reset
  createPasswordResetToken(userId: number, token: string, expiresAt: number): Promise<void>;
  getPasswordResetToken(token: string): Promise<{ userId: number; expiresAt: number } | undefined>;
  deletePasswordResetToken(token: string): Promise<void>;
  updatePassword(userId: number, passwordHash: string): Promise<void>;

  // Profile + follows
  getUserByUsername(username: string): Promise<User | undefined>;
  updateUser(id: number, data: { username?: string; displayName?: string; isPublic?: number }): Promise<User | undefined>;
  follow(followerId: number, followingId: number): Promise<void>;
  unfollow(followerId: number, followingId: number): Promise<void>;
  getFollowing(userId: number): Promise<number[]>;
  getFollowers(userId: number): Promise<number[]>;
  isFollowing(followerId: number, followingId: number): Promise<boolean>;
  searchUsers(query: string, currentUserId: number): Promise<Array<{ id: number; displayName: string; username: string | null }>>;
  getFeedShows(userIds: number[]): Promise<Array<Show & { userName: string; userUsername: string | null }>>;
}

// ── SQLite helpers ────────────────────────────────────────────────────────────
function sqliteRowToUser(row: any): User | undefined {
  if (!row) return undefined;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    username: row.username ?? null,
    isPublic: row.is_public ?? 1,
  } as User;
}

function sqliteRowToShow(row: any): Show | undefined {
  if (!row) return undefined;
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    streamingService: row.streaming_service,
    genre: row.genre ?? null,
    status: row.status,
    season: row.season ?? null,
    episode: row.episode ?? null,
    notes: row.notes ?? null,
    posterUrl: row.poster_url ?? null,
    rating: row.rating ?? null,
  } as Show;
}

// ── SQLite implementation (sync ops wrapped in Promise) ───────────────────────
const sqliteStorage: IStorage = {
  async createUser(email, passwordHash, displayName) {
    const row = sqlite.prepare(
      `INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?) RETURNING *`
    ).get(email, passwordHash, displayName);
    return sqliteRowToUser(row)!;
  },
  async getUserByEmail(email) {
    const row = sqlite.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
    return sqliteRowToUser(row);
  },
  async getUserById(id) {
    const row = sqlite.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    return sqliteRowToUser(row);
  },
  async createSession(token, userId) {
    sqlite.prepare(`INSERT OR REPLACE INTO sessions (token, user_id) VALUES (?, ?)`).run(token, userId);
  },
  async getSession(token) {
    const row = sqlite.prepare(`SELECT user_id FROM sessions WHERE token = ?`).get(token) as { user_id: number } | undefined;
    return row?.user_id;
  },
  async deleteSession(token) {
    sqlite.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
  },
  async getAllShows(userId) {
    const rows = sqlite.prepare(`SELECT * FROM shows WHERE user_id = ?`).all(userId);
    return rows.map(sqliteRowToShow) as Show[];
  },
  async getShow(id, userId) {
    const row = sqlite.prepare(`SELECT * FROM shows WHERE id = ? AND user_id = ?`).get(id, userId);
    return sqliteRowToShow(row);
  },
  async createShow(userId, show) {
    const row = sqlite.prepare(
      `INSERT INTO shows (user_id, title, streaming_service, genre, status, season, episode, notes, poster_url, rating)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    ).get(userId, show.title, show.streamingService, show.genre ?? null,
          show.status ?? 'watching', show.season ?? null, show.episode ?? null,
          show.notes ?? null, show.posterUrl ?? null, show.rating ?? null);
    return sqliteRowToShow(row)!;
  },
  async updateShow(id, userId, show) {
    const fields: string[] = [];
    const values: any[] = [];
    if (show.title !== undefined)            { fields.push(`title = ?`);              values.push(show.title); }
    if (show.streamingService !== undefined) { fields.push(`streaming_service = ?`);  values.push(show.streamingService); }
    if (show.genre !== undefined)            { fields.push(`genre = ?`);              values.push(show.genre); }
    if (show.status !== undefined)           { fields.push(`status = ?`);             values.push(show.status); }
    if (show.season !== undefined)           { fields.push(`season = ?`);             values.push(show.season); }
    if (show.episode !== undefined)          { fields.push(`episode = ?`);            values.push(show.episode); }
    if (show.notes !== undefined)            { fields.push(`notes = ?`);              values.push(show.notes); }
    if (show.posterUrl !== undefined)        { fields.push(`poster_url = ?`);         values.push(show.posterUrl); }
    if (show.rating !== undefined)           { fields.push(`rating = ?`);             values.push(show.rating); }
    if (fields.length === 0) return sqliteRowToShow(sqlite.prepare(`SELECT * FROM shows WHERE id = ? AND user_id = ?`).get(id, userId));
    values.push(id, userId);
    const row = sqlite.prepare(`UPDATE shows SET ${fields.join(", ")} WHERE id = ? AND user_id = ? RETURNING *`).get(...values);
    return sqliteRowToShow(row);
  },
  async deleteShow(id, userId) {
    const result = sqlite.prepare(`DELETE FROM shows WHERE id = ? AND user_id = ?`).run(id, userId);
    return result.changes > 0;
  },
  async clearShowsForUser(userId) {
    sqlite.prepare(`DELETE FROM shows WHERE user_id = ?`).run(userId);
  },
  async createPasswordResetToken(userId, token, expiresAt) {
    sqlite.prepare(
      `INSERT OR REPLACE INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)`
    ).run(token, userId, expiresAt);
  },
  async getPasswordResetToken(token) {
    const row = sqlite.prepare(`SELECT user_id, expires_at FROM password_reset_tokens WHERE token = ?`).get(token) as any;
    if (!row) return undefined;
    return { userId: row.user_id, expiresAt: row.expires_at };
  },
  async deletePasswordResetToken(token) {
    sqlite.prepare(`DELETE FROM password_reset_tokens WHERE token = ?`).run(token);
  },
  async updatePassword(userId, passwordHash) {
    sqlite.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, userId);
  },
  async getUserByUsername(username) {
    const row = sqlite.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
    return sqliteRowToUser(row);
  },
  async updateUser(id, data) {
    const fields: string[] = [];
    const values: any[] = [];
    if (data.username !== undefined) { fields.push(`username = ?`);  values.push(data.username); }
    if (data.isPublic !== undefined) { fields.push(`is_public = ?`); values.push(data.isPublic); }
    if (fields.length === 0) return sqliteRowToUser(sqlite.prepare(`SELECT * FROM users WHERE id = ?`).get(id));
    values.push(id);
    const row = sqlite.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ? RETURNING *`).get(...values);
    return sqliteRowToUser(row)!;
  },
  async follow(followerId, followingId) {
    sqlite.prepare(`INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)`).run(followerId, followingId);
  },
  async unfollow(followerId, followingId) {
    sqlite.prepare(`DELETE FROM follows WHERE follower_id = ? AND following_id = ?`).run(followerId, followingId);
  },
  async getFollowing(userId) {
    const rows = sqlite.prepare(`SELECT following_id FROM follows WHERE follower_id = ?`).all(userId) as { following_id: number }[];
    return rows.map(r => r.following_id);
  },
  async getFollowers(userId) {
    const rows = sqlite.prepare(`SELECT follower_id FROM follows WHERE following_id = ?`).all(userId) as { follower_id: number }[];
    return rows.map(r => r.follower_id);
  },
  async isFollowing(followerId, followingId) {
    const row = sqlite.prepare(`SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?`).get(followerId, followingId);
    return !!row;
  },
  async searchUsers(query, currentUserId) {
    const rows = sqlite.prepare(
      `SELECT id, display_name as displayName, username FROM users WHERE id != ? AND (display_name LIKE ? OR username LIKE ?) LIMIT 10`
    ).all(currentUserId, `%${query}%`, `%${query}%`) as Array<{ id: number; displayName: string; username: string | null }>;
    return rows;
  },
  async getFeedShows(userIds) {
    if (userIds.length === 0) return [];
    const placeholders = userIds.map(() => "?").join(",");
    const rows = sqlite.prepare(
      `SELECT s.*, u.display_name as userName, u.username as userUsername
       FROM shows s JOIN users u ON s.user_id = u.id
       WHERE s.user_id IN (${placeholders})
       ORDER BY s.id DESC LIMIT 50`
    ).all(...userIds) as Array<any>;
    return rows;
  },
};

// ── PostgreSQL implementation (lazy-initialized) ──────────────────────────────
let pgStorage: IStorage | null = null;

async function getPgStorage(): Promise<IStorage> {
  if (pgStorage) return pgStorage;

  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });

  // Test connection — if it fails, fall back to SQLite
  try {
    await pool.query("SELECT 1");
  } catch (e) {
    console.warn("[storage] PostgreSQL connection failed, falling back to SQLite:", (e as Error).message);
    return sqliteStorage;
  }

  // Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shows (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      streaming_service TEXT NOT NULL,
      genre TEXT,
      status TEXT NOT NULL DEFAULT 'watching',
      season INTEGER,
      episode INTEGER,
      notes TEXT,
      poster_url TEXT,
      rating INTEGER
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS follows (
      id SERIAL PRIMARY KEY,
      follower_id INTEGER NOT NULL REFERENCES users(id),
      following_id INTEGER NOT NULL REFERENCES users(id),
      UNIQUE(follower_id, following_id)
    )
  `);
  // Safe migrations
  await pool.query(`ALTER TABLE shows ADD COLUMN IF NOT EXISTS rating INTEGER`).catch(() => {});
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE`).catch(() => {});
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_public INTEGER DEFAULT 1`).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at BIGINT NOT NULL
    )
  `).catch(() => {});

  // Helper: map PG row (snake_case) → User object (camelCase)
  function rowToUser(row: any) {
    if (!row) return undefined;
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      displayName: row.display_name,
      username: row.username ?? null,
      isPublic: row.is_public ?? 1,
    } as User;
  }

  // Helper: map PG row (snake_case) → Show object (camelCase)
  function rowToShow(row: any) {
    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      streamingService: row.streaming_service,
      genre: row.genre ?? null,
      status: row.status,
      season: row.season ?? null,
      episode: row.episode ?? null,
      notes: row.notes ?? null,
      posterUrl: row.poster_url ?? null,
      rating: row.rating ?? null,
    } as Show;
  }

  pgStorage = {
    async createUser(email, passwordHash, displayName) {
      const res = await pool.query(
        `INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING *`,
        [email, passwordHash, displayName]
      );
      return rowToUser(res.rows[0])!;
    },
    async getUserByEmail(email) {
      const res = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
      return rowToUser(res.rows[0]);
    },
    async getUserById(id) {
      const res = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
      return rowToUser(res.rows[0]);
    },
    async createSession(token, userId) {
      await pool.query(
        `INSERT INTO sessions (token, user_id) VALUES ($1, $2) ON CONFLICT (token) DO UPDATE SET user_id = $2`,
        [token, userId]
      );
    },
    async getSession(token) {
      const res = await pool.query(`SELECT user_id FROM sessions WHERE token = $1`, [token]);
      return res.rows[0]?.user_id;
    },
    async deleteSession(token) {
      await pool.query(`DELETE FROM sessions WHERE token = $1`, [token]);
    },
    async getAllShows(userId) {
      const res = await pool.query(`SELECT * FROM shows WHERE user_id = $1`, [userId]);
      return res.rows.map(rowToShow) as Show[];
    },
    async getShow(id, userId) {
      const res = await pool.query(`SELECT * FROM shows WHERE id = $1 AND user_id = $2`, [id, userId]);
      return rowToShow(res.rows[0]);
    },
    async createShow(userId, show) {
      const res = await pool.query(
        `INSERT INTO shows (user_id, title, streaming_service, genre, status, season, episode, notes, poster_url, rating)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [userId, show.title, show.streamingService, show.genre ?? null, show.status ?? 'watching',
         show.season ?? null, show.episode ?? null, show.notes ?? null, show.posterUrl ?? null, show.rating ?? null]
      );
      return rowToShow(res.rows[0])!;
    },
    async updateShow(id, userId, show) {
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;
      if (show.title !== undefined)            { fields.push(`title = $${i++}`);              values.push(show.title); }
      if (show.streamingService !== undefined) { fields.push(`streaming_service = $${i++}`);  values.push(show.streamingService); }
      if (show.genre !== undefined)            { fields.push(`genre = $${i++}`);              values.push(show.genre); }
      if (show.status !== undefined)           { fields.push(`status = $${i++}`);             values.push(show.status); }
      if (show.season !== undefined)           { fields.push(`season = $${i++}`);             values.push(show.season); }
      if (show.episode !== undefined)          { fields.push(`episode = $${i++}`);            values.push(show.episode); }
      if (show.notes !== undefined)            { fields.push(`notes = $${i++}`);              values.push(show.notes); }
      if (show.posterUrl !== undefined)        { fields.push(`poster_url = $${i++}`);         values.push(show.posterUrl); }
      if (show.rating !== undefined)           { fields.push(`rating = $${i++}`);             values.push(show.rating); }
      if (fields.length === 0) {
        const res = await pool.query(`SELECT * FROM shows WHERE id = $1 AND user_id = $2`, [id, userId]);
        return rowToShow(res.rows[0]);
      }
      values.push(id, userId);
      const res = await pool.query(
        `UPDATE shows SET ${fields.join(", ")} WHERE id = $${i++} AND user_id = $${i++} RETURNING *`,
        values
      );
      return rowToShow(res.rows[0]);
    },
    async deleteShow(id, userId) {
      const res = await pool.query(`DELETE FROM shows WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId]);
      return res.rows.length > 0;
    },
    async clearShowsForUser(userId) {
      await pool.query(`DELETE FROM shows WHERE user_id = $1`, [userId]);
    },
    async createPasswordResetToken(userId, token, expiresAt) {
      await pool.query(
        `INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT (token) DO UPDATE SET user_id=$2, expires_at=$3`,
        [token, userId, expiresAt]
      );
    },
    async getPasswordResetToken(token) {
      const res = await pool.query(`SELECT user_id, expires_at FROM password_reset_tokens WHERE token = $1`, [token]);
      if (!res.rows[0]) return undefined;
      return { userId: res.rows[0].user_id, expiresAt: res.rows[0].expires_at };
    },
    async deletePasswordResetToken(token) {
      await pool.query(`DELETE FROM password_reset_tokens WHERE token = $1`, [token]);
    },
    async updatePassword(userId, passwordHash) {
      await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, userId]);
    },
    async getUserByUsername(username) {
      const res = await pool.query(`SELECT * FROM users WHERE username = $1`, [username]);
      return rowToUser(res.rows[0]);
    },
    async updateUser(id, data) {
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;
      if (data.username !== undefined) { fields.push(`username = $${i++}`);  values.push(data.username); }
      if (data.isPublic !== undefined) { fields.push(`is_public = $${i++}`); values.push(data.isPublic); }
      if (fields.length === 0) {
        const res = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
        return rowToUser(res.rows[0])!;
      }
      values.push(id);
      const res = await pool.query(
        `UPDATE users SET ${fields.join(", ")} WHERE id = $${i++} RETURNING *`,
        values
      );
      return rowToUser(res.rows[0])!;
    },
    async follow(followerId, followingId) {
      await pool.query(`INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [followerId, followingId]);
    },
    async unfollow(followerId, followingId) {
      await pool.query(`DELETE FROM follows WHERE follower_id = $1 AND following_id = $2`, [followerId, followingId]);
    },
    async getFollowing(userId) {
      const res = await pool.query(`SELECT following_id FROM follows WHERE follower_id = $1`, [userId]);
      return res.rows.map((r: any) => r.following_id);
    },
    async getFollowers(userId) {
      const res = await pool.query(`SELECT follower_id FROM follows WHERE following_id = $1`, [userId]);
      return res.rows.map((r: any) => r.follower_id);
    },
    async isFollowing(followerId, followingId) {
      const res = await pool.query(`SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2`, [followerId, followingId]);
      return res.rows.length > 0;
    },
    async searchUsers(query, currentUserId) {
      const res = await pool.query(
        `SELECT id, display_name as "displayName", username FROM users WHERE id != $1 AND (display_name ILIKE $2 OR username ILIKE $2) LIMIT 10`,
        [currentUserId, `%${query}%`]
      );
      return res.rows;
    },
    async getFeedShows(userIds) {
      if (userIds.length === 0) return [];
      const placeholders = userIds.map((_, i) => `$${i + 1}`).join(",");
      const res = await pool.query(
        `SELECT s.*, u.display_name as "userName", u.username as "userUsername"
         FROM shows s JOIN users u ON s.user_id = u.id
         WHERE s.user_id IN (${placeholders})
         ORDER BY s.id DESC LIMIT 50`,
        userIds
      );
      return res.rows;
    },
  };

  return pgStorage;
}

// ── Proxy: routes to PG or SQLite based on DATABASE_URL ──────────────────────
export const storage: IStorage = {
  async createUser(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).createUser(...args); },
  async getUserByEmail(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).getUserByEmail(...args); },
  async getUserById(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).getUserById(...args); },
  async createSession(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).createSession(...args); },
  async getSession(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).getSession(...args); },
  async deleteSession(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).deleteSession(...args); },
  async getAllShows(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).getAllShows(...args); },
  async getShow(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).getShow(...args); },
  async createShow(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).createShow(...args); },
  async updateShow(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).updateShow(...args); },
  async deleteShow(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).deleteShow(...args); },
  async clearShowsForUser(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).clearShowsForUser(...args); },
  async getUserByUsername(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).getUserByUsername(...args); },
  async updateUser(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).updateUser(...args); },
  async follow(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).follow(...args); },
  async unfollow(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).unfollow(...args); },
  async getFollowing(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).getFollowing(...args); },
  async getFollowers(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).getFollowers(...args); },
  async isFollowing(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).isFollowing(...args); },
  async searchUsers(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).searchUsers(...args); },
  async getFeedShows(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).getFeedShows(...args); },
  async createPasswordResetToken(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).createPasswordResetToken(...args); },
  async getPasswordResetToken(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).getPasswordResetToken(...args); },
  async deletePasswordResetToken(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).deletePasswordResetToken(...args); },
  async updatePassword(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).updatePassword(...args); },
};
