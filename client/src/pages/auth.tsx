import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tv, LogIn, UserPlus } from "lucide-react";

// Safe localStorage helpers — fail silently if blocked (e.g. sandboxed iframes)
function lsGet(key: string): string {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}
function lsSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState(() => lsGet("st_email"));
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
        lsSet("st_email", email); // save email on successful login
      } else {
        await register(email, password, displayName);
        lsSet("st_email", email);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <svg
            width="36"
            height="36"
            viewBox="0 0 28 28"
            fill="none"
            aria-label="StreamTrack logo"
            className="text-primary"
          >
            <rect x="2" y="6" width="24" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
            <path d="M11 11l6 3-6 3V11z" fill="currentColor" />
            <path d="M2 20h24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
            <circle cx="14" cy="24" r="1.5" fill="currentColor" opacity="0.5" />
          </svg>
          <span className="font-bold text-foreground tracking-tight text-2xl">
            Stream<span className="text-primary">Track</span>
          </span>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
            {mode === "login" ? <LogIn className="h-5 w-5 text-primary" /> : <UserPlus className="h-5 w-5 text-primary" />}
            {mode === "login" ? "Sign In" : "Create Account"}
          </h2>
          <p className="text-sm text-muted-foreground mb-5">
            {mode === "login"
              ? "Welcome back — sign in to see your shows."
              : "Set up your account to start tracking shows."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" data-testid="auth-form">
            {mode === "register" && (
              <div>
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  data-testid="input-display-name"
                  className="mt-1"
                />
              </div>
            )}

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="input-email"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder={mode === "register" ? "At least 6 characters" : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "register" ? 6 : undefined}
                data-testid="input-password"
                className="mt-1"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" data-testid="text-error">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading} data-testid="button-auth-submit">
              {loading
                ? "Please wait..."
                : mode === "login"
                  ? "Sign In"
                  : "Create Account"}
            </Button>
          </form>

          <div className="mt-4 text-center">
            {mode === "login" ? (
              <p className="text-sm text-muted-foreground">
                Don't have an account?{" "}
                <button
                  onClick={() => { setMode("register"); setError(""); }}
                  className="text-primary hover:underline font-medium"
                  data-testid="link-switch-register"
                >
                  Sign up
                </button>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <button
                  onClick={() => { setMode("login"); setError(""); }}
                  className="text-primary hover:underline font-medium"
                  data-testid="link-switch-login"
                >
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
