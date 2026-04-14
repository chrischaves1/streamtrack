import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiRequest } from "./queryClient";

interface AuthUser {
  id: number;
  email: string;
  displayName: string;
  username?: string;
  isPublic?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// We store the token in memory (React state). It resets on page refresh,
// which is fine — users simply log in again. No localStorage needed.
let _token: string | null = null;

export function getAuthToken(): string | null {
  return _token;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // Start as true so we attempt cookie-based auto-login before showing the login screen
  const [isLoading, setIsLoading] = useState(true);

  const setAuth = (t: string, u: AuthUser) => {
    _token = t;
    setToken(t);
    setUser(u);
  };

  const clearAuth = () => {
    _token = null;
    setToken(null);
    setUser(null);
  };

  // On mount, try to restore session from the server cookie
  useEffect(() => {
    apiRequest("GET", "/api/auth/me")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          // Cookie auth: no token returned, but we know the user
          // Use a sentinel so apiRequest doesn't send an empty Bearer header
          _token = "cookie";
          setToken("cookie");
          setUser(data);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    setAuth(data.token, data.user);
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const res = await apiRequest("POST", "/api/auth/register", { email, password, displayName });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registration failed");
    setAuth(data.token, data.user);
  }, []);

  const logout = useCallback(() => {
    apiRequest("POST", "/api/auth/logout").catch(() => {});
    clearAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
