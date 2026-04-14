import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Star, Tv, Film } from "lucide-react";
import type { Show } from "@shared/schema";

const SERVICE_BADGE_CLASS: Record<string, string> = {
  Netflix: "bg-red-600",
  Hulu: "bg-green-500",
  "Disney+": "bg-blue-600",
  "HBO Max": "bg-purple-600",
  "Amazon Prime": "bg-cyan-500",
  "Apple TV+": "bg-gray-400",
  "Paramount+": "bg-blue-500",
  Peacock: "bg-yellow-400",
  Tubi: "bg-orange-500",
  Crunchyroll: "bg-orange-600",
};

// NOTE: this page uses raw fetch because the user viewing may not be logged in
// (public profile), so we can't use apiRequest which injects auth headers.
const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

export default function PublicProfile({ params }: { params: { username: string } }) {
  const { username } = params;

  const profileQuery = useQuery({
    queryKey: ["/api/profile", username],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/profile/${username}`, { credentials: "include" });
      if (!res.ok) throw new Error("Profile not found");
      return res.json();
    },
  });

  if (profileQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  if (profileQuery.error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <Film className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-lg font-semibold text-foreground">Profile not found</p>
          <p className="text-sm text-muted-foreground mt-1">This user doesn't exist or their profile is private.</p>
        </div>
      </div>
    );
  }

  const { user, shows } = profileQuery.data as { user: any; shows: Show[] };
  const watching = shows.filter((s) => s.status === "watching");
  const completed = shows.filter((s) => s.status === "completed");
  const wantToWatch = shows.filter((s) => s.status === "want_to_watch");

  const groups = [
    { label: "Currently Watching", items: watching },
    { label: "Completed", items: completed },
    { label: "Want to Watch", items: wantToWatch },
  ].filter(g => g.items.length > 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-to-br from-violet-950 to-indigo-950 border-b border-primary/20 px-4 py-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <svg viewBox="0 0 80 80" className="w-8 h-8">
              <rect width="80" height="80" rx="16" fill="#18042a"/>
              <circle cx="40" cy="40" r="28" fill="#7c3aed"/>
              <polygon points="32,26 32,54 58,40" fill="white"/>
            </svg>
            <span className="text-sm font-bold text-white/70">StreamTrack</span>
          </div>
          <h1 className="text-xl font-bold text-white">{user.displayName}</h1>
          <p className="text-sm text-white/60">@{user.username} · {shows.length} shows</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-6">
        {groups.map((group) => (
          <section key={group.label}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
              <Tv className="h-3.5 w-3.5" />
              {group.label}
              <span className="text-xs">({group.items.length})</span>
            </h2>
            <div className="space-y-2">
              {group.items.map((show) => (
                <Card key={show.id} className="p-3 bg-card border-border">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${SERVICE_BADGE_CLASS[show.streamingService] || "bg-muted-foreground"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{show.title}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{show.streamingService}</span>
                        {show.genre && <span className="text-xs text-muted-foreground/60">· {show.genre}</span>}
                      </div>
                    </div>
                    {show.rating && show.rating > 0 && (
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: show.rating }).map((_, i) => (
                          <Star key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))}

        {shows.length === 0 && (
          <div className="text-center py-8">
            <Film className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No shows added yet.</p>
          </div>
        )}
      </main>
    </div>
  );
}
