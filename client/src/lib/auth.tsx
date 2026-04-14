import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiRequest } from "./queryClient";

interface AuthUser {
  id: number;
  email: string;
  displayName: string;
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
  const [isLoading, setIsLoading] = useState(false);

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
    if (_token) {
      apiRequest("POST", "/api/auth/logout").catch(() => {});
    }
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
