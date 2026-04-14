import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { users, shows, type User, type InsertShow, type Show } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import path from "path";

const sqlite = new Database(path.join(process.cwd(), "shows.db"));
const db = drizzle(sqlite);

// Create tables if not exists
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
    user_id INTEGER NOT NULL REFERENCES users(id),
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

// Persistent sessions table — survives server restarts
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )
`);

// Add user_id column to shows if it doesn't exist (migration for existing data)
try {
  sqlite.exec(`ALTER TABLE shows ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0 REFERENCES users(id)`);
} catch (e) {
  // Column already exists — ignore
}

export interface IStorage {
  // Users
  createUser(email: string, passwordHash: string, displayName: string): User;
  getUserByEmail(email: string): User | undefined;
  getUserById(id: number): User | undefined;

  // Sessions
  createSession(token: string, userId: number): void;
  getSession(token: string): number | undefined;
  deleteSession(token: string): void;

  // Shows (scoped to user)
  getAllShows(userId: number): Show[];
  getShow(id: number, userId: number): Show | undefined;
  createShow(userId: number, show: InsertShow): Show;
  updateShow(id: number, userId: number, show: Partial<InsertShow>): Show | undefined;
  deleteShow(id: number, userId: number): boolean;
}

export const storage: IStorage = {
  // Users
  createUser(email: string, passwordHash: string, displayName: string): User {
    return db.insert(users).values({ email, passwordHash, displayName }).returning().get();
  },

  getUserByEmail(email: string): User | undefined {
    return db.select().from(users).where(eq(users.email, email)).get();
  },

  getUserById(id: number): User | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  },

  // Sessions
  createSession(token: string, userId: number): void {
    sqlite.prepare(`INSERT OR REPLACE INTO sessions (token, user_id) VALUES (?, ?)`)
      .run(token, userId);
  },

  getSession(token: string): number | undefined {
    const row = sqlite.prepare(`SELECT user_id FROM sessions WHERE token = ?`).get(token) as { user_id: number } | undefined;
    return row?.user_id;
  },

  deleteSession(token: string): void {
    sqlite.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
  },

  // Shows
  getAllShows(userId: number): Show[] {
    return db.select().from(shows).where(eq(shows.userId, userId)).all();
  },

  getShow(id: number, userId: number): Show | undefined {
    return db.select().from(shows).where(and(eq(shows.id, id), eq(shows.userId, userId))).get();
  },

  createShow(userId: number, show: InsertShow): Show {
    return db.insert(shows).values({ ...show, userId }).returning().get();
  },

  updateShow(id: number, userId: number, show: Partial<InsertShow>): Show | undefined {
    return db
      .update(shows)
      .set(show)
      .where(and(eq(shows.id, id), eq(shows.userId, userId)))
      .returning()
      .get();
  },

  deleteShow(id: number, userId: number): boolean {
    const result = db.delete(shows).where(and(eq(shows.id, id), eq(shows.userId, userId))).run();
    return result.changes > 0;
  },
};
