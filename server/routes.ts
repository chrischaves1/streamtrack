import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertShowSchema, registerSchema, loginSchema } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";

const TMDB_TOKEN = process.env.TMDB_TOKEN || "";
const TMDB_BASE = "https://api.themoviedb.org/3";

// Map TMDB genre IDs to our genre strings
const TMDB_GENRE_MAP: Record<number, string> = {
  10759: "Action",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Drama", // Family
  10762: "Animation", // Kids
  9648: "Mystery",
  10763: "Drama", // News
  10764: "Reality",
  10765: "Sci-Fi",
  10766: "Drama", // Soap
  10767: "Drama", // Talk
  10768: "Action", // War & Politics
  37: "Western",
};

// Map TMDB provider IDs to our streaming service names
const TMDB_PROVIDER_MAP: Record<number, string> = {
  8: "Netflix",
  15: "Hulu",
  337: "Disney+",
  384: "HBO Max",
  386: "HBO Max",
  387: "HBO Max",
  1899: "HBO Max",
  9: "Amazon Prime",
  10: "Amazon Prime",
  2: "Apple TV+",
  350: "Apple TV+",
  531: "Paramount+",
  307: "Peacock",
  386: "Peacock",
  1770: "Peacock",
  73: "Tubi",
  300: "Pluto TV",
  283: "Crunchyroll",
  1968: "Crunchyroll",
};

async function tmdbFetch(path: string) {
  const res = await fetch(`${TMDB_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
  return res.json();
}

// Token generation
function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = "";
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

const COOKIE_NAME = "st_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year in seconds

function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE * 1000, // ms
    secure: process.env.NODE_ENV === "production",
  });
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Check Authorization header first, then fall back to cookie
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (req.cookies?.[COOKIE_NAME]) {
    token = req.cookies[COOKIE_NAME];
  }
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const userId = storage.getSession(token);
  if (!userId) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
  (req as any).userId = userId;
  (req as any).token = token;
  next();
}

export function registerRoutes(httpServer: Server, app: Express) {
  // ---- TMDB search routes ----

  // Search TV shows by title
  app.get("/api/tmdb/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.trim().length < 2) return res.json([]);
      const data = await tmdbFetch(`/search/tv?query=${encodeURIComponent(query)}&page=1&include_adult=false`);
      const results = (data.results || []).slice(0, 6).map((show: any) => ({
        id: show.id,
        name: show.name,
        firstAirDate: show.first_air_date?.slice(0, 4) || "",
        posterPath: show.poster_path
          ? `https://image.tmdb.org/t/p/w92${show.poster_path}`
          : null,
        genreIds: show.genre_ids || [],
      }));
      res.json(results);
    } catch (e) {
      res.status(500).json({ error: "TMDB search failed" });
    }
  });

  // Get details (genre + streaming service) for a specific show
  app.get("/api/tmdb/details/:id", async (req, res) => {
    try {
      const id = req.params.id;

      // Fetch details and watch providers in parallel
      const [details, providers] = await Promise.all([
        tmdbFetch(`/tv/${id}?language=en-US`),
        tmdbFetch(`/tv/${id}/watch/providers`),
      ]);

      // Pick the first matching genre
      const genreId = details.genres?.[0]?.id;
      const genre = genreId ? (TMDB_GENRE_MAP[genreId] || "Other") : null;

      // Get US flatrate (subscription) streaming providers
      const usProviders = providers.results?.US;
      const flatrate = usProviders?.flatrate || [];
      let streamingService: string | null = null;
      for (const p of flatrate) {
        const mapped = TMDB_PROVIDER_MAP[p.provider_id];
        if (mapped) { streamingService = mapped; break; }
      }
      // Fall back to free/ads tier if no subscription match
      if (!streamingService) {
        const free = [...(usProviders?.free || []), ...(usProviders?.ads || [])];
        for (const p of free) {
          const mapped = TMDB_PROVIDER_MAP[p.provider_id];
          if (mapped) { streamingService = mapped; break; }
        }
      }

      res.json({ genre, streamingService });
    } catch (e) {
      res.status(500).json({ error: "TMDB details failed" });
    }
  });

  // ---- Auth routes ----

  // Register
  app.post("/api/auth/register", (req, res) => {
    try {
      const { email, password, displayName } = registerSchema.parse(req.body);

      const existing = storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ error: "An account with this email already exists" });
      }

      const passwordHash = bcrypt.hashSync(password, 10);
      const user = storage.createUser(email, passwordHash, displayName);
      const token = generateToken();
      storage.createSession(token, user.id);
      setSessionCookie(res, token);

      res.status(201).json({
        token,
        user: { id: user.id, email: user.email, displayName: user.displayName },
      });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: e.errors[0].message });
      }
      res.status(500).json({ error: "Failed to register" });
    }
  });

  // Login
  app.post("/api/auth/login", (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const user = storage.getUserByEmail(email);
      if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const token = generateToken();
      storage.createSession(token, user.id);
      setSessionCookie(res, token);

      res.json({
        token,
        user: { id: user.id, email: user.email, displayName: user.displayName },
      });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: e.errors[0].message });
      }
      res.status(500).json({ error: "Failed to login" });
    }
  });

  // Logout
  app.post("/api/auth/logout", requireAuth, (req, res) => {
    const token = (req as any).token;
    storage.deleteSession(token);
    res.clearCookie(COOKIE_NAME);
    res.json({ ok: true });
  });

  // Get current user
  app.get("/api/auth/me", requireAuth, (req, res) => {
    const userId = (req as any).userId;
    const user = storage.getUserById(userId);
    if (!user) return res.status(401).json({ error: "User not found" });
    res.json({ id: user.id, email: user.email, displayName: user.displayName });
  });

  // ---- Shows routes (auth required) ----

  app.get("/api/shows", requireAuth, (_req, res) => {
    try {
      const userId = (_req as any).userId;
      const allShows = storage.getAllShows(userId);
      res.json(allShows);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch shows" });
    }
  });

  app.get("/api/shows/:id", requireAuth, (req, res) => {
    try {
      const userId = (req as any).userId;
      const id = parseInt(req.params.id);
      const show = storage.getShow(id, userId);
      if (!show) return res.status(404).json({ error: "Show not found" });
      res.json(show);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch show" });
    }
  });

  app.post("/api/shows", requireAuth, (req, res) => {
    try {
      const userId = (req as any).userId;
      const validated = insertShowSchema.parse(req.body);
      const created = storage.createShow(userId, validated);
      res.status(201).json(created);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: e.errors });
      }
      res.status(500).json({ error: "Failed to create show" });
    }
  });

  app.patch("/api/shows/:id", requireAuth, (req, res) => {
    try {
      const userId = (req as any).userId;
      const id = parseInt(req.params.id);
      const validated = insertShowSchema.partial().parse(req.body);
      const updated = storage.updateShow(id, userId, validated);
      if (!updated) return res.status(404).json({ error: "Show not found" });
      res.json(updated);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: e.errors });
      }
      res.status(500).json({ error: "Failed to update show" });
    }
  });

  app.delete("/api/shows/:id", requireAuth, (req, res) => {
    try {
      const userId = (req as any).userId;
      const id = parseInt(req.params.id);
      const deleted = storage.deleteShow(id, userId);
      if (!deleted) return res.status(404).json({ error: "Show not found" });
      res.status(204).send();
    } catch (e) {
      res.status(500).json({ error: "Failed to delete show" });
    }
  });
}
