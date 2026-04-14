import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider, useAuth } from "./lib/auth";
import { Toaster } from "@/components/ui/toaster";
import HomePage from "./pages/home";
import AuthPage from "./pages/auth";
import SocialPage from "./pages/social";
import PublicProfile from "./pages/profile";
import NotFound from "./pages/not-found";

// Wrapper so public profile is always accessible
function PublicProfileWrapper({ params }: { params: { username: string } }) {
  return <PublicProfile params={params} />;
}

function ProtectedRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <svg viewBox="0 0 80 80" className="w-16 h-16" aria-label="StreamTrack">
            <rect width="80" height="80" rx="16" fill="#18042a"/>
            <circle cx="40" cy="40" r="28" fill="#7c3aed"/>
            <polygon points="32,26 32,54 58,40" fill="white"/>
          </svg>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/social" component={SocialPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppRoutes() {
  return (
    <Router hook={useHashLocation}>
      <Switch>
        {/* Public profile — no auth required */}
        <Route path="/u/:username" component={PublicProfileWrapper} />
        {/* Everything else — auth-gated inside ProtectedRoutes */}
        <Route component={ProtectedRoutes} />
      </Switch>
    </Router>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <div className="dark min-h-screen bg-background text-foreground">
          <AppRoutes />
        </div>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
