import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { users, shows, type User, type InsertShow, type Show } from "@shared/schema";
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
// Migrations
try { sqlite.exec(`ALTER TABLE shows ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0`); } catch {}
try { sqlite.exec(`ALTER TABLE shows ADD COLUMN rating INTEGER`); } catch {}

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
  // Safe migrations
  await pool.query(`ALTER TABLE shows ADD COLUMN IF NOT EXISTS rating INTEGER`).catch(() => {});

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
};
