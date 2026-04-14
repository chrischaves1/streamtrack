import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
});

export const shows = sqliteTable("shows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  streamingService: text("streaming_service").notNull(),
  genre: text("genre"),
  status: text("status").notNull().default("watching"),
  season: integer("season"),
  episode: integer("episode"),
  notes: text("notes"),
  posterUrl: text("poster_url"),
  rating: integer("rating"),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, passwordHash: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const insertShowSchema = createInsertSchema(shows).omit({ id: true, userId: true });
export type InsertShow = z.infer<typeof insertShowSchema>;
export type Show = typeof shows.$inferSelect;

// Auth schemas
export const registerSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  displayName: z.string().min(1, "Display name is required"),
});

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const STREAMING_SERVICES = [
  "Amazon Prime",
  "Apple TV+",
  "Crunchyroll",
  "Disney+",
  "ESPN+",
  "Funimation",
  "HBO Max",
  "Hulu",
  "Netflix",
  "Paramount+",
  "Peacock",
  "Pluto TV",
  "Tubi",
  "YouTube TV",
  "Other",
] as const;

export const GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Reality",
  "Romance",
  "Sci-Fi",
  "Thriller",
  "Western",
  "Other",
] as const;

export const STATUSES = [
  { value: "watching", label: "Watching" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "want_to_watch", label: "Want to Watch" },
] as const;
