import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { users, shows, follows, type User, type InsertShow, type Show } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import path from "path";

// ── SQLite setup (always available for local dev; used on Render too until PG is configured) ──
const sqlite = new Database(path.join(process.cwd(), "shows.db"));
const sqliteDb = drizzleSqlite(sqlite);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL
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
    poster_url TEXT
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

// ── SQLite implementation (sync ops wrapped in Promise) ───────────────────────
const sqliteStorage: IStorage = {
  async createUser(email, passwordHash, displayName) {
    return sqliteDb.insert(users).values({ email, passwordHash, displayName }).returning().get() as User;
  },
  async getUserByEmail(email) {
    return sqliteDb.select().from(users).where(eq(users.email, email)).get() as User | undefined;
  },
  async getUserById(id) {
    return sqliteDb.select().from(users).where(eq(users.id, id)).get() as User | undefined;
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
    return sqliteDb.select().from(shows).where(eq(shows.userId, userId)).all() as Show[];
  },
  async getShow(id, userId) {
    return sqliteDb.select().from(shows).where(and(eq(shows.id, id), eq(shows.userId, userId))).get() as Show | undefined;
  },
  async createShow(userId, show) {
    return sqliteDb.insert(shows).values({ ...show, userId }).returning().get() as Show;
  },
  async updateShow(id, userId, show) {
    return sqliteDb.update(shows).set(show).where(and(eq(shows.id, id), eq(shows.userId, userId))).returning().get() as Show | undefined;
  },
  async deleteShow(id, userId) {
    const result = sqliteDb.delete(shows).where(and(eq(shows.id, id), eq(shows.userId, userId))).run();
    return result.changes > 0;
  },
  async getUserByUsername(username) {
    return sqliteDb.select().from(users).where(eq(users.username, username)).get() as User | undefined;
  },
  async updateUser(id, data) {
    return sqliteDb.update(users).set(data).where(eq(users.id, id)).returning().get() as User | undefined;
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

  const { drizzle: drizzlePg } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });

  // Test connection — if it fails, fall back to SQLite
  try {
    await pool.query("SELECT 1");
  } catch (e) {
    console.warn("[storage] PostgreSQL connection failed, falling back to SQLite:", (e as Error).message);
    return sqliteStorage;
  }
  const pgDb = drizzlePg(pool);

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

  pgStorage = {
    async createUser(email, passwordHash, displayName) {
      return (await pgDb.insert(users).values({ email, passwordHash, displayName }).returning())[0];
    },
    async getUserByEmail(email) {
      return (await pgDb.select().from(users).where(eq(users.email, email)))[0];
    },
    async getUserById(id) {
      return (await pgDb.select().from(users).where(eq(users.id, id)))[0];
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
      return pgDb.select().from(shows).where(eq(shows.userId, userId));
    },
    async getShow(id, userId) {
      return (await pgDb.select().from(shows).where(and(eq(shows.id, id), eq(shows.userId, userId))))[0];
    },
    async createShow(userId, show) {
      return (await pgDb.insert(shows).values({ ...show, userId }).returning())[0];
    },
    async updateShow(id, userId, show) {
      return (await pgDb.update(shows).set(show).where(and(eq(shows.id, id), eq(shows.userId, userId))).returning())[0];
    },
    async deleteShow(id, userId) {
      const res = await pgDb.delete(shows).where(and(eq(shows.id, id), eq(shows.userId, userId))).returning();
      return res.length > 0;
    },
    async getUserByUsername(username) {
      return (await pgDb.select().from(users).where(eq(users.username, username)))[0];
    },
    async updateUser(id, data) {
      return (await pgDb.update(users).set(data).where(eq(users.id, id)).returning())[0];
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
  async getUserByUsername(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).getUserByUsername(...args); },
  async updateUser(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).updateUser(...args); },
  async follow(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).follow(...args); },
  async unfollow(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).unfollow(...args); },
  async getFollowing(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).getFollowing(...args); },
  async getFollowers(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).getFollowers(...args); },
  async isFollowing(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).isFollowing(...args); },
  async searchUsers(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).searchUsers(...args); },
  async getFeedShows(...args) { return (process.env.DATABASE_URL ? await getPgStorage() : sqliteStorage).getFeedShows(...args); },
};
