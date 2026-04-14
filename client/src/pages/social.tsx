import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  UserPlus,
  UserMinus,
  Star,
  Tv,
  ArrowLeft,
  Copy,
  Share2,
  Settings,
  Users,
} from "lucide-react";
import { Link } from "wouter";
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

// ── Profile Settings Tab ──────────────────────────────────────────────────────
function ProfileSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState(user?.username || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiRequest("PATCH", "/api/auth/profile", { username: username.toLowerCase().replace(/\s/g, "_") });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Profile updated", description: `Your profile link: /u/${data.username}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const profileUrl = username
    ? `${window.location.origin}${window.location.pathname}#/u/${username.toLowerCase().replace(/\s/g, "_")}`
    : null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Settings className="h-4 w-4 text-primary" />
        Profile Settings
      </h3>

      <div>
        <Label htmlFor="username">Username</Label>
        <p className="text-xs text-muted-foreground mb-1">
          Set a username to create your shareable profile link.
        </p>
        <Input
          id="username"
          placeholder="e.g. chris_c"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mt-1"
          data-testid="input-username"
        />
      </div>

      <Button onClick={handleSave} disabled={saving || !username} className="w-full" data-testid="button-save-profile">
        {saving ? "Saving..." : "Save Username"}
      </Button>

      {profileUrl && (
        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">Your public profile:</p>
          <div className="flex items-center gap-2">
            <code className="text-xs text-primary flex-1 truncate">{profileUrl}</code>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(profileUrl).catch(() => {});
                toast({ title: "Copied to clipboard" });
              }}
              data-testid="button-copy-link"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Find Friends Tab ──────────────────────────────────────────────────────────
function FindFriends() {
  const [query, setQuery] = useState("");
  const { toast } = useToast();

  const searchQuery = useQuery({
    queryKey: ["/api/users/search", query],
    queryFn: async () => {
      if (query.length < 2) return [];
      const res = await apiRequest("GET", `/api/users/search?q=${encodeURIComponent(query)}`);
      return res.json();
    },
    enabled: query.length >= 2,
  });

  const followMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "follow" | "unfollow" }) => {
      if (action === "follow") {
        await apiRequest("POST", `/api/follow/${id}`);
      } else {
        await apiRequest("DELETE", `/api/follow/${id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/search"] });
      queryClient.invalidateQueries({ queryKey: ["/api/following"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
    },
  });

  const followingQuery = useQuery({
    queryKey: ["/api/following"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/following");
      return res.json();
    },
  });

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        Find Friends
      </h3>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or username..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-users"
        />
      </div>

      {/* Search results */}
      {searchQuery.data && searchQuery.data.length > 0 && (
        <div className="space-y-2">
          {searchQuery.data.map((u: any) => (
            <div key={u.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div>
                <p className="text-sm font-medium text-foreground">{u.displayName}</p>
                {u.username && (
                  <p className="text-xs text-muted-foreground">@{u.username}</p>
                )}
              </div>
              <Button
                size="sm"
                variant={u.isFollowing ? "outline" : "default"}
                onClick={() => followMutation.mutate({ id: u.id, action: u.isFollowing ? "unfollow" : "follow" })}
                data-testid={`button-follow-${u.id}`}
              >
                {u.isFollowing ? (
                  <><UserMinus className="h-3 w-3 mr-1" /> Unfollow</>
                ) : (
                  <><UserPlus className="h-3 w-3 mr-1" /> Follow</>
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      {query.length >= 2 && searchQuery.data?.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
      )}

      {/* Following list */}
      {followingQuery.data && followingQuery.data.length > 0 && (
        <div className="mt-6">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Following ({followingQuery.data.length})
          </h4>
          <div className="space-y-2">
            {followingQuery.data.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between p-2 bg-muted/20 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-foreground">{u.displayName}</p>
                  {u.username && <p className="text-xs text-muted-foreground">@{u.username}</p>}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => followMutation.mutate({ id: u.id, action: "unfollow" })}
                >
                  <UserMinus className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Friends Feed Tab ──────────────────────────────────────────────────────────
function FriendsFeed() {
  const feedQuery = useQuery({
    queryKey: ["/api/feed"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/feed");
      return res.json();
    },
  });

  if (feedQuery.isLoading) {
    return <p className="text-sm text-muted-foreground text-center py-8">Loading feed...</p>;
  }

  const feedItems = feedQuery.data || [];

  if (feedItems.length === 0) {
    return (
      <div className="text-center py-8">
        <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          Follow friends to see what they're watching.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Tv className="h-4 w-4 text-primary" />
        What Friends Are Watching
      </h3>
      {feedItems.map((item: any) => (
        <Card key={item.id} className="p-3 bg-card border-border">
          <div className="flex items-start gap-3">
            <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${SERVICE_BADGE_CLASS[item.streamingService] || "bg-muted-foreground"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-primary">
                  {item.userName}
                </span>
                <span className="text-xs text-muted-foreground">is watching</span>
              </div>
              <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">{item.streamingService}</span>
                {item.genre && <span className="text-xs text-muted-foreground/60">· {item.genre}</span>}
                {item.rating > 0 && (
                  <span className="flex items-center gap-0.5">
                    {Array.from({ length: item.rating }).map((_, i) => (
                      <Star key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    ))}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Share Card ─────────────────────────────────────────────────────────────────
function ShareCard() {
  const { user } = useAuth();
  const showsQuery = useQuery({
    queryKey: ["/api/shows"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/shows");
      return res.json();
    },
  });

  const watching = ((showsQuery.data || []) as Show[]).filter((s: Show) => s.status === "watching");
  const topRated = ((showsQuery.data || []) as Show[])
    .filter((s: Show) => s.rating && s.rating >= 4)
    .sort((a: Show, b: Show) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 3);

  const shareText = [
    `${user?.displayName} is watching on StreamTrack:`,
    ...watching.slice(0, 5).map((s: Show) =>
      `${s.title} (${s.streamingService})${s.rating ? " " + "⭐".repeat(s.rating) : ""}`
    ),
    "",
    user?.username ? `See my full list: ${window.location.origin}${window.location.pathname}#/u/${user.username}` : "",
  ].filter(Boolean).join("\n");

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
      } catch {}
    } else {
      navigator.clipboard.writeText(shareText).catch(() => {});
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Share2 className="h-4 w-4 text-primary" />
        Share What You're Watching
      </h3>

      {/* Preview card */}
      <div className="bg-gradient-to-br from-violet-950 to-indigo-950 rounded-xl p-5 border border-primary/20">
        <div className="flex items-center gap-2 mb-3">
          <svg viewBox="0 0 80 80" className="w-6 h-6">
            <rect width="80" height="80" rx="16" fill="#18042a"/>
            <circle cx="40" cy="40" r="28" fill="#7c3aed"/>
            <polygon points="32,26 32,54 58,40" fill="white"/>
          </svg>
          <span className="text-sm font-bold text-white">StreamTrack</span>
        </div>
        <p className="text-sm font-semibold text-white mb-2">
          {user?.displayName} is currently watching:
        </p>
        {watching.slice(0, 5).map((show: Show) => (
          <div key={show.id} className="flex items-center gap-2 py-1">
            <div className={`w-2 h-2 rounded-full ${SERVICE_BADGE_CLASS[show.streamingService] || "bg-muted-foreground"}`} />
            <span className="text-sm text-white/90">{show.title}</span>
            <span className="text-xs text-white/50">{show.streamingService}</span>
            {show.rating && show.rating > 0 && (
              <span className="text-xs">{"⭐".repeat(show.rating)}</span>
            )}
          </div>
        ))}
        {watching.length === 0 && (
          <p className="text-sm text-white/50">No shows currently watching</p>
        )}
      </div>

      <Button onClick={handleShare} className="w-full" data-testid="button-share">
        <Share2 className="h-4 w-4 mr-2" />
        {navigator.share ? "Share" : "Copy to Clipboard"}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Post this to Facebook, Instagram Stories, or send directly to friends.
      </p>
    </div>
  );
}

// ── Main Social Page ──────────────────────────────────────────────────────────
export default function SocialPage() {
  const [tab, setTab] = useState<"feed" | "friends" | "share" | "settings">("feed");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link href="/">
            <button className="p-1.5 rounded-lg hover:bg-muted transition-colors" data-testid="button-back">
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
          </Link>
          <h1 className="text-lg font-bold text-foreground flex-1">Social</h1>
        </div>
      </header>

      {/* Tab bar */}
      <div className="sticky top-[53px] z-20 bg-background border-b border-border">
        <div className="max-w-lg mx-auto flex">
          {([
            { key: "feed", label: "Feed", icon: Tv },
            { key: "friends", label: "Friends", icon: Users },
            { key: "share", label: "Share", icon: Share2 },
            { key: "settings", label: "Profile", icon: Settings },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                tab === key
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-${key}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-lg mx-auto px-4 py-5">
        {tab === "feed" && <FriendsFeed />}
        {tab === "friends" && <FindFriends />}
        {tab === "share" && <ShareCard />}
        {tab === "settings" && <ProfileSettings />}
      </main>
    </div>
  );
}
