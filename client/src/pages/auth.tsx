import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tv, LogIn, UserPlus, KeyRound, ArrowLeft, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// Safe localStorage helpers — fail silently if blocked (e.g. sandboxed iframes)
function lsGet(key: string): string {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}
function lsSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}

type Mode = "login" | "register" | "forgot" | "reset";

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState(() => lsGet("st_email"));
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const switchMode = (m: Mode) => { setMode(m); setError(""); setSuccess(""); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
        lsSet("st_email", email);

      } else if (mode === "register") {
        await register(email, password, displayName);
        lsSet("st_email", email);

      } else if (mode === "forgot") {
        const res = await apiRequest("POST", "/api/auth/forgot-password", { email });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        // If a token came back (no email service configured), go straight to reset
        if (data.token) {
          setResetToken(data.token);
          setSuccess("Token generated. Enter your new password below.");
          switchMode("reset");
        } else {
          setSuccess("If that email exists, a reset link has been sent.");
        }

      } else if (mode === "reset") {
        if (newPassword !== confirmPassword) throw new Error("Passwords don't match");
        if (newPassword.length < 6) throw new Error("Password must be at least 6 characters");
        const res = await apiRequest("POST", "/api/auth/reset-password", {
          token: resetToken,
          password: newPassword,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        setSuccess("Password updated! You can now sign in.");
        setTimeout(() => switchMode("login"), 2000);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const modeConfig = {
    login:    { icon: <LogIn className="h-5 w-5 text-primary" />,    title: "Sign In",          sub: "Welcome back — sign in to see your shows." },
    register: { icon: <UserPlus className="h-5 w-5 text-primary" />, title: "Create Account",   sub: "Set up your account to start tracking shows." },
    forgot:   { icon: <KeyRound className="h-5 w-5 text-primary" />, title: "Reset Password",   sub: "Enter your email and we'll generate a reset token." },
    reset:    { icon: <KeyRound className="h-5 w-5 text-primary" />, title: "Set New Password", sub: "Enter your new password below." },
  }[mode];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <svg width="36" height="36" viewBox="0 0 28 28" fill="none" aria-label="StreamTrack logo" className="text-primary">
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
            {modeConfig.icon}
            {modeConfig.title}
          </h2>
          <p className="text-sm text-muted-foreground mb-5">{modeConfig.sub}</p>

          {success && (
            <div className="flex items-center gap-2 text-sm text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2 mb-4">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" data-testid="auth-form">

            {/* Register: display name */}
            {mode === "register" && (
              <div>
                <Label htmlFor="displayName">Display Name</Label>
                <Input id="displayName" placeholder="Your name" value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)} required
                  data-testid="input-display-name" className="mt-1" />
              </div>
            )}

            {/* Login / register / forgot: email */}
            {(mode === "login" || mode === "register" || mode === "forgot") && (
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} required
                  data-testid="input-email" className="mt-1" />
              </div>
            )}

            {/* Login / register: password */}
            {(mode === "login" || mode === "register") && (
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password"
                  placeholder={mode === "register" ? "At least 6 characters" : "Your password"}
                  value={password} onChange={(e) => setPassword(e.target.value)} required
                  minLength={mode === "register" ? 6 : undefined}
                  data-testid="input-password" className="mt-1" />
              </div>
            )}

            {/* Reset: token field (pre-filled, editable) */}
            {mode === "reset" && (
              <>
                <div>
                  <Label htmlFor="resetToken">Reset Token</Label>
                  <Input id="resetToken" placeholder="Paste your reset token" value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)} required
                    data-testid="input-reset-token" className="mt-1 font-mono text-xs" />
                </div>
                <div>
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input id="newPassword" type="password" placeholder="At least 6 characters"
                    value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6}
                    data-testid="input-new-password" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input id="confirmPassword" type="password" placeholder="Repeat new password"
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6}
                    data-testid="input-confirm-password" className="mt-1" />
                </div>
              </>
            )}

            {error && (
              <p className="text-sm text-destructive" data-testid="text-error">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading} data-testid="button-auth-submit">
              {loading ? "Please wait..." :
               mode === "login" ? "Sign In" :
               mode === "register" ? "Create Account" :
               mode === "forgot" ? "Send Reset Token" :
               "Set New Password"}
            </Button>
          </form>

          <div className="mt-4 space-y-2 text-center">
            {mode === "login" && (
              <>
                <p className="text-sm text-muted-foreground">
                  Don't have an account?{" "}
                  <button onClick={() => switchMode("register")}
                    className="text-primary hover:underline font-medium" data-testid="link-switch-register">
                    Sign up
                  </button>
                </p>
                <p className="text-sm">
                  <button onClick={() => switchMode("forgot")}
                    className="text-muted-foreground hover:text-primary hover:underline text-xs" data-testid="link-forgot-password">
                    Forgot your password?
                  </button>
                </p>
              </>
            )}
            {mode === "register" && (
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <button onClick={() => switchMode("login")}
                  className="text-primary hover:underline font-medium" data-testid="link-switch-login">
                  Sign in
                </button>
              </p>
            )}
            {(mode === "forgot" || mode === "reset") && (
              <button onClick={() => switchMode("login")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mx-auto" data-testid="link-back-login">
                <ArrowLeft className="h-3 w-3" /> Back to sign in
              </button>
            )}
            {mode === "forgot" && (
              <button onClick={() => switchMode("reset")}
                className="text-xs text-muted-foreground hover:text-primary hover:underline" data-testid="link-have-token">
                Already have a token? Enter it here
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
