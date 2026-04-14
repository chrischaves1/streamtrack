import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider, useAuth } from "./lib/auth";
import { Toaster } from "@/components/ui/toaster";
import HomePage from "./pages/home";
import AuthPage from "./pages/auth";
import NotFound from "./pages/not-found";

function AppRoutes() {
  const { user, isLoading } = useAuth();

  // While checking for an existing session cookie, show a simple splash
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

  if (!user) {
    return <AuthPage />;
  }

  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route component={NotFound} />
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
