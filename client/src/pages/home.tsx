import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Search,
  Tv,
  MoreVertical,
  Pencil,
  Trash2,
  PlayCircle,
  PauseCircle,
  CheckCircle,
  BookmarkPlus,
  Film,
  ChevronDown,
  ExternalLink,
  LogOut,
  User,
  Loader2,
  Star,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import {
  insertShowSchema,
  STREAMING_SERVICES,
  GENRES,
  STATUSES,
  type Show,
} from "@shared/schema";

// Deep links for each streaming service.
// ─── Affiliate & Sponsor Configuration ───────────────────────────────────
// Add your affiliate / tracking IDs here. When an ID is present the watch link
// will use the affiliate URL variant; otherwise the plain URL is used.
// Swap the empty strings for your real IDs when you're ready.
const AFFILIATE_CONFIG: Record<string, { id: string; buildUrl: (q: string, id: string) => string }> = {
  "Amazon Prime": {
    id: "",  // Your Amazon Associates tag, e.g. "streamtrack-20"
    buildUrl: (q, id) => `https://www.amazon.com/s?k=${q}&i=instant-video&tag=${id}`,
  },
  "Apple TV+": {
    id: "",  // Apple Services Performance Partner ID
    buildUrl: (q, id) => `https://tv.apple.com/search?term=${q}&at=${id}`,
  },
  "Hulu": {
    id: "",  // Hulu affiliate network ID (e.g. via Impact or CJ)
    buildUrl: (q, id) => `https://www.hulu.com/search?q=${q}&utm_affiliate=${id}`,
  },
  "Netflix": {
    id: "",  // Netflix doesn't currently have a public affiliate program
    buildUrl: (q, id) => `https://www.netflix.com/search?q=${q}`,
  },
  "Disney+": {
    id: "",  // Disney+ affiliate (via Impact)
    buildUrl: (_q, id) => `https://www.disneyplus.com/?cid=${id}`,
  },
  "HBO Max": {
    id: "",  // Max affiliate ID
    buildUrl: (_q, id) => `https://www.hbomax.com/?utm_id=${id}`,
  },
  "Paramount+": {
    id: "",  // Paramount+ affiliate (via Impact/CJ)
    buildUrl: (q, id) => `https://www.paramountplus.com/search/?q=${q}&irclickid=${id}`,
  },
  "Peacock": {
    id: "",  // Peacock affiliate ID
    buildUrl: (_q, id) => `https://www.peacocktv.com/?cid=${id}`,
  },
};

// Sponsored service — appears as "⭐ Featured" at the top of the dropdown.
// Set to null to disable. Change the name to any service from STREAMING_SERVICES.
const SPONSORED_SERVICE: {
  name: string;
  label: string;   // display label in the dropdown
} | null = null;
// Example — uncomment to enable:
// const SPONSORED_SERVICE = { name: "Peacock", label: "⭐ Peacock — Featured" };

// ─── Watch URL builder ───────────────────────────────────────────────────
function getWatchUrl(service: string, title: string): string {
  const q = encodeURIComponent(title);

  // If an affiliate ID is configured for this service, use the affiliate URL
  const aff = AFFILIATE_CONFIG[service];
  if (aff && aff.id) {
    return aff.buildUrl(q, aff.id);
  }

  // Fallback: plain web URLs
  switch (service) {
    case "Netflix":      return `https://www.netflix.com/search?q=${q}`;
    case "Hulu":         return `https://www.hulu.com/search?q=${q}`;
    case "Disney+":      return `https://www.disneyplus.com/`;
    case "HBO Max":      return `https://www.hbomax.com/`;
    case "Amazon Prime": return `https://www.amazon.com/s?k=${q}&i=instant-video`;
    case "Apple TV+":    return `https://tv.apple.com/search?term=${q}`;
    case "Paramount+":   return `https://www.paramountplus.com/search/?q=${q}`;
    case "Peacock":      return `https://www.peacocktv.com/`;
    case "ESPN+":        return `https://www.espn.com/espnplus/`;
    case "YouTube TV":   return `https://tv.youtube.com/welcome/?query=${q}`;
    case "Tubi":         return `https://tubitv.com/search/${q}`;
    case "Pluto TV":     return `https://pluto.tv/`;
    case "Crunchyroll":  return `https://www.crunchyroll.com/`;
    case "Funimation":   return `https://www.crunchyroll.com/`;
    default:             return `https://www.google.com/search?q=${q}+streaming`;
  }
}

// Opens the streaming service website in a new tab.
function openWatchLink(service: string, title: string) {
  window.open(getWatchUrl(service, title), "_blank");
}

// Returns the list of streaming services for the dropdown, with the
// sponsored service pinned at the top (if configured).
function getOrderedServices(): string[] {
  if (!SPONSORED_SERVICE) return [...STREAMING_SERVICES];
  const rest = STREAMING_SERVICES.filter((s) => s !== SPONSORED_SERVICE.name);
  return [SPONSORED_SERVICE.name, ...rest];
}

// Service icon colors map
const SERVICE_BADGE_CLASS: Record<string, string> = {
  Netflix: "badge-netflix",
  Hulu: "badge-hulu",
  "Disney+": "badge-disney",
  "HBO Max": "badge-hbo",
  "Amazon Prime": "badge-amazon",
  "Apple TV+": "badge-apple",
  "Paramount+": "badge-paramount",
  Peacock: "badge-peacock",
};

function getServiceBadgeClass(service: string): string {
  return SERVICE_BADGE_CLASS[service] ?? "badge-default";
}

const STATUS_CONFIG = {
  watching: {
    label: "Watching",
    icon: PlayCircle,
    color: "text-green-400",
    bg: "bg-green-400/10",
    border: "border-green-400/20",
  },
  paused: {
    label: "Paused",
    icon: PauseCircle,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle,
    color: "text-sky-400",
    bg: "bg-sky-400/10",
    border: "border-sky-400/20",
  },
  want_to_watch: {
    label: "Want to Watch",
    icon: BookmarkPlus,
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    border: "border-violet-400/20",
  },
};

const formSchema = insertShowSchema.extend({
  title: z.string().min(1, "Title is required"),
  streamingService: z.string().min(1, "Streaming service is required"),
});

type FormValues = z.infer<typeof formSchema>;

interface TmdbResult {
  id: number;
  name: string;
  firstAirDate: string;
  posterPath: string | null;
  genreIds: number[];
}

function ShowForm({
  defaultValues,
  onSubmit,
  isPending,
  submitLabel,
}: {
  defaultValues?: Partial<FormValues>;
  onSubmit: (values: FormValues) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      streamingService: "",
      genre: "",
      status: "watching",
      season: undefined,
      episode: undefined,
      notes: "",
      posterUrl: "",
      ...defaultValues,
    },
  });

  // TMDB autocomplete state
  const [searchResults, setSearchResults] = useState<TmdbResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleTitleChange = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim() || value.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await apiRequest("GET", `/api/tmdb/search?q=${encodeURIComponent(value)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          setShowDropdown(data.length > 0);
        }
      } catch {
        // silently ignore search errors
      } finally {
        setIsSearching(false);
      }
    }, 400);
  }, []);

  const handleSelectShow = useCallback(async (result: TmdbResult) => {
    // Set the title and poster immediately from search result
    form.setValue("title", result.name, { shouldValidate: true });
    if (result.posterPath) {
      form.setValue("posterUrl", result.posterPath);
    }
    setShowDropdown(false);
    setSearchResults([]);

    // Fetch genre + streaming service
    setIsFetchingDetails(true);
    try {
      const res = await apiRequest("GET", `/api/tmdb/details/${result.id}`);
      if (res.ok) {
        const details = await res.json();
        if (details.genre) {
          form.setValue("genre", details.genre, { shouldValidate: true });
        }
        if (details.streamingService) {
          form.setValue("streamingService", details.streamingService, { shouldValidate: true });
        }
        // Upgrade to higher-res poster from details if available
        if (details.posterUrl) {
          form.setValue("posterUrl", details.posterUrl);
        }
      }
    } catch {
      // silently ignore details errors
    } finally {
      setIsFetchingDetails(false);
    }
  }, [form]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
        data-testid="show-form"
      >
        {/* Title field with TMDB autocomplete */}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Show Title</FormLabel>
              <div className="relative" ref={dropdownRef}>
                <FormControl>
                  <div className="relative">
                    <Input
                      placeholder="e.g. Breaking Bad"
                      data-testid="input-title"
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        handleTitleChange(e.target.value);
                      }}
                      autoComplete="off"
                    />
                    {(isSearching || isFetchingDetails) && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                </FormControl>
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
                    {searchResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-accent transition-colors"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectShow(result);
                        }}
                      >
                        {result.posterPath ? (
                          <img
                            src={result.posterPath}
                            alt={result.name}
                            className="w-8 h-12 object-cover rounded flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-12 bg-muted rounded flex-shrink-0 flex items-center justify-center">
                            <Film className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm text-foreground truncate">{result.name}</p>
                          {result.firstAirDate && (
                            <p className="text-xs text-muted-foreground">
                              {result.firstAirDate.slice(0, 4)}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <FormMessage />
              {isFetchingDetails && (
                <p className="text-xs text-muted-foreground">Looking up show details...</p>
              )}
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="streamingService"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Streaming Service</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-service">
                      <SelectValue placeholder="Pick a service" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {getOrderedServices().map((s) => (
                      <SelectItem key={s} value={s}>
                        {SPONSORED_SERVICE && s === SPONSORED_SERVICE.name
                          ? SPONSORED_SERVICE.label
                          : s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="genre"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Genre</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? ""}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-genre">
                      <SelectValue placeholder="Genre (optional)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {GENRES.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="season"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Season</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    placeholder="1"
                    data-testid="input-season"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value ? parseInt(e.target.value) : undefined
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="episode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Episode</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    placeholder="1"
                    data-testid="input-episode"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value ? parseInt(e.target.value) : undefined
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Any notes, reminders, or thoughts..."
                  className="resize-none"
                  rows={2}
                  data-testid="input-notes"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full"
          disabled={isPending}
          data-testid="button-submit"
        >
          {isPending ? "Saving..." : submitLabel}
        </Button>
      </form>
    </Form>
  );
}

function StarRating({ value, onChange }: { value: number | null | undefined; onChange: (r: number) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? value ?? 0;
  return (
    <div className="flex items-center gap-0.5" data-testid="star-rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className="p-0.5 transition-transform hover:scale-110"
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => onChange(value === star ? 0 : star)}
          data-testid={`star-${star}`}
        >
          <Star
            className={`h-4 w-4 transition-colors ${
              star <= display
                ? "fill-yellow-400 text-yellow-400"
                : "fill-transparent text-muted-foreground/40"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

function ShowCard({
  show,
  onEdit,
  onDelete,
  onStatusChange,
  onRatingChange,
}: {
  show: Show;
  onEdit: (show: Show) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: string) => void;
  onRatingChange: (id: number, rating: number) => void;
}) {
  const statusCfg =
    STATUS_CONFIG[show.status as keyof typeof STATUS_CONFIG] ||
    STATUS_CONFIG.watching;
  const StatusIcon = statusCfg.icon;

  return (
    <div
      className="group relative bg-card border border-border rounded-xl p-4 hover-elevate transition-all"
      data-testid={`card-show-${show.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Poster thumbnail */}
        {show.posterUrl ? (
          <img
            src={show.posterUrl}
            alt={show.title}
            className="w-14 h-20 object-cover rounded-lg shrink-0 shadow-md"
            data-testid={`img-poster-${show.id}`}
          />
        ) : (
          <div className="w-14 h-20 rounded-lg shrink-0 bg-muted flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-muted-foreground/40" fill="currentColor">
              <path d="M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/>
            </svg>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3
            className="font-semibold text-foreground text-base leading-tight truncate"
            data-testid={`text-title-${show.id}`}
          >
            {show.title}
          </h3>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${getServiceBadgeClass(show.streamingService)}`}
              data-testid={`text-service-${show.id}`}
            >
              {show.streamingService}
            </span>

            {show.genre && (
              <span className="text-xs text-muted-foreground">
                {show.genre}
              </span>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              data-testid={`button-menu-${show.id}`}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={() => onEdit(show)}
              data-testid={`menu-edit-${show.id}`}
            >
              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {STATUSES.map((s) => (
              <DropdownMenuItem
                key={s.value}
                onClick={() => onStatusChange(show.id, s.value)}
                className={show.status === s.value ? "opacity-50" : ""}
                disabled={show.status === s.value}
                data-testid={`menu-status-${show.id}-${s.value}`}
              >
                {s.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(show.id)}
              className="text-destructive focus:text-destructive"
              data-testid={`menu-delete-${show.id}`}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Status + progress row */}
      <div className="flex items-center justify-between mt-3">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${statusCfg.color} ${statusCfg.bg} ${statusCfg.border}`}
          data-testid={`text-status-${show.id}`}
        >
          <StatusIcon className="h-3 w-3" />
          {statusCfg.label}
        </span>

        {(show.season || show.episode) && (
          <span
            className="text-xs text-muted-foreground font-mono"
            data-testid={`text-progress-${show.id}`}
          >
            {show.season ? `S${String(show.season).padStart(2, "0")}` : ""}
            {show.episode ? `·E${String(show.episode).padStart(2, "0")}` : ""}
          </span>
        )}
      </div>

      {show.notes && (
        <p
          className="text-xs text-muted-foreground mt-2 line-clamp-2 italic"
          data-testid={`text-notes-${show.id}`}
        >
          {show.notes}
        </p>
      )}

      {/* Star rating */}
      <div className="mt-3 flex items-center justify-between">
        <StarRating value={show.rating} onChange={(r) => onRatingChange(show.id, r)} />
        {show.rating ? (
          <span className="text-xs text-muted-foreground">{show.rating}/5</span>
        ) : (
          <span className="text-xs text-muted-foreground/50">Rate it</span>
        )}
      </div>

      {/* Watch Now button */}
      <button
        onClick={() => openWatchLink(show.streamingService, show.title)}
        className="mt-3 flex items-center justify-center gap-1.5 w-full rounded-lg py-1.5 text-xs font-semibold border border-primary/30 text-primary bg-primary/8 hover:bg-primary/20 transition-colors"
        data-testid={`button-watch-${show.id}`}
      >
        <ExternalLink className="h-3 w-3" />
        Watch on {show.streamingService}
      </button>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="skeleton-shimmer h-5 w-3/4" />
      <div className="flex gap-2">
        <div className="skeleton-shimmer h-4 w-20 rounded-full" />
        <div className="skeleton-shimmer h-4 w-14 rounded-full" />
      </div>
      <div className="skeleton-shimmer h-6 w-28 rounded-full" />
    </div>
  );
}

export default function HomePage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterService, setFilterService] = useState<string>("all");
  const [filterGenre, setFilterGenre] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  // Top-level ratings map: source of truth for star ratings.
  // Lives outside the server cache so refetches never overwrite user-set ratings.
  const [ratingsMap, setRatingsMap] = useState<Record<number, number>>({});
  const [editShow, setEditShow] = useState<Show | null>(null);

  const { data: shows = [], isLoading } = useQuery<Show[]>({
    queryKey: ["/api/shows"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      // Client-side duplicate check before hitting the server
      const existing = queryClient.getQueryData<Show[]>(["/api/shows"]) ?? [];
      const duplicate = existing.find(
        (s) => s.title.toLowerCase() === data.title.toLowerCase()
      );
      if (duplicate) {
        throw Object.assign(new Error("duplicate"), { isDuplicate: true, title: duplicate.title });
      }
      const res = await apiRequest("POST", "/api/shows", data);
      if (res.status === 409) {
        const body = await res.json();
        throw Object.assign(new Error("duplicate"), { isDuplicate: true, title: data.title, serverMsg: body.error });
      }
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      setAddOpen(false);
    },
    onError: (err: any) => {
      if (err.isDuplicate) {
        toast({
          title: "Already in your list",
          description: err.serverMsg ?? `"${err.title}" is already being tracked.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to add show.",
          variant: "destructive",
        });
      }
    },
  });

  // Pending rating saves that need to be retried
  const pendingRatings = useRef<Record<number, number>>({});

  // Dedicated mutation for star ratings.
  // ratingsMap (React state) is the display source of truth — never cleared
  // on error so the user always sees what they tapped.
  const ratingMutation = useMutation({
    mutationFn: ({ id, rating }: { id: number; rating: number }) =>
      apiRequest("PATCH", `/api/shows/${id}`, { rating }).then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        delete pendingRatings.current[id];
        return res;
      }),
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    onError: (_err, { id, rating }) => {
      // Keep ratingsMap intact (don't revert display) — just note it as pending
      // so we can retry next time the user interacts
      pendingRatings.current[id] = rating;
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<FormValues>;
    }) => apiRequest("PATCH", `/api/shows/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      toast({ title: "Show updated!" });
      setEditShow(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update show.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/shows/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      toast({ title: "Show removed." });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove show.",
        variant: "destructive",
      });
    },
  });

  // Flush any ratings that failed to save (e.g. server was asleep on Render)
  // whenever the page becomes visible again
  useEffect(() => {
    function onVisible() {
      if (!document.hidden) {
        Object.entries(pendingRatings.current).forEach(([idStr, rating]) => {
          ratingMutation.mutate({ id: Number(idStr), rating });
        });
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Derive active genres for filter dropdown
  const activeGenres = Array.from(new Set(shows.map((s) => s.genre).filter(Boolean) as string[])).sort();

  const filtered = shows.filter((s) => {
    const matchSearch = s.title
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchStatus =
      filterStatus === "all" || s.status === filterStatus;
    const matchService =
      filterService === "all" || s.streamingService === filterService;
    const matchGenre =
      filterGenre === "all" || s.genre === filterGenre;
    return matchSearch && matchStatus && matchService && matchGenre;
  });

  // Group by status for display
  const grouped: Record<string, Show[]> = {
    watching: [],
    paused: [],
    want_to_watch: [],
    completed: [],
  };
  filtered.forEach((s) => {
    const key = s.status in grouped ? s.status : "watching";
    grouped[key].push(s);
  });

  const activeServices = Array.from(
    new Set(shows.map((s) => s.streamingService))
  ).sort();

  // Stats
  const stats = {
    total: shows.length,
    watching: shows.filter((s) => s.status === "watching").length,
    completed: shows.filter((s) => s.status === "completed").length,
    services: new Set(shows.map((s) => s.streamingService)).size,
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <svg
              width="28"
              height="28"
              viewBox="0 0 28 28"
              fill="none"
              aria-label="StreamTrack logo"
              className="text-primary"
            >
              <rect
                x="2"
                y="6"
                width="24"
                height="16"
                rx="3"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M11 11l6 3-6 3V11z"
                fill="currentColor"
              />
              <path
                d="M2 20h24"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.4"
              />
              <circle cx="14" cy="24" r="1.5" fill="currentColor" opacity="0.5" />
            </svg>
            <span className="font-bold text-foreground tracking-tight text-lg">
              Stream<span className="text-primary">Track</span>
            </span>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-xs relative" data-testid="search-container">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search shows..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 bg-muted/50"
              data-testid="input-search"
            />
          </div>

          {/* Social + Add button + user menu */}
          <div className="flex items-center gap-2 shrink-0">
          <Link href="/social">
            <Button variant="ghost" size="icon" className="h-9 w-9" data-testid="button-social">
              <Users className="h-4 w-4" />
            </Button>
          </Link>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-show">
                <Plus className="h-4 w-4 mr-1.5" />
                Add Show
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Tv className="h-5 w-5 text-primary" />
                  Add a Show
                </DialogTitle>
              </DialogHeader>
              <ShowForm
                onSubmit={(values) => createMutation.mutate(values)}
                isPending={createMutation.isPending}
                submitLabel="Add Show"
              />
            </DialogContent>
          </Dialog>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full bg-muted" data-testid="button-user-menu">
                <User className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium truncate">{user?.displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <Link href="/social">
                <DropdownMenuItem data-testid="menu-social">
                  <Users className="h-3.5 w-3.5 mr-2" /> Social
                </DropdownMenuItem>
              </Link>
              <DropdownMenuItem onClick={logout} data-testid="button-logout">
                <LogOut className="h-3.5 w-3.5 mr-2" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Stats bar */}
        {shows.length > 0 && (
          <div
            className="grid grid-cols-4 gap-3 mb-6"
            data-testid="stats-container"
          >
            {[
              { label: "Total", value: stats.total, icon: Film },
              {
                label: "Watching",
                value: stats.watching,
                icon: PlayCircle,
                colorClass: "text-green-400",
              },
              {
                label: "Completed",
                value: stats.completed,
                icon: CheckCircle,
                colorClass: "text-sky-400",
              },
              {
                label: "Services",
                value: stats.services,
                icon: Tv,
                colorClass: "text-violet-400",
              },
            ].map(({ label, value, icon: Icon, colorClass }) => (
              <div
                key={label}
                className="bg-card border border-border rounded-xl p-3 text-center"
              >
                <Icon
                  className={`h-4 w-4 mx-auto mb-1 ${colorClass ?? "text-muted-foreground"}`}
                />
                <div className="text-xl font-bold text-foreground">
                  {value}
                </div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        {shows.length > 0 && (
          <div
            className="flex flex-wrap gap-2 mb-5"
            data-testid="filter-container"
          >
            {/* Status filter */}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger
                className="w-auto gap-1 bg-muted/50 border-border"
                data-testid="select-filter-status"
              >
                <SelectValue placeholder="All statuses" />
                <ChevronDown className="h-3.5 w-3.5 opacity-50" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Service filter */}
            {activeServices.length > 1 && (
              <Select value={filterService} onValueChange={setFilterService}>
                <SelectTrigger
                  className="w-auto gap-1 bg-muted/50 border-border"
                  data-testid="select-filter-service"
                >
                  <SelectValue placeholder="All services" />
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All services</SelectItem>
                  {activeServices.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Genre filter */}
            {activeGenres.length > 1 && (
              <Select value={filterGenre} onValueChange={setFilterGenre}>
                <SelectTrigger
                  className="w-auto gap-1 bg-muted/50 border-border"
                  data-testid="select-filter-genre"
                >
                  <SelectValue placeholder="All genres" />
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All genres</SelectItem>
                  {activeGenres.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {(filterStatus !== "all" ||
              filterService !== "all" ||
              filterGenre !== "all" ||
              search) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterStatus("all");
                  setFilterService("all");
                  setFilterGenre("all");
                  setSearch("");
                }}
                className="text-muted-foreground text-xs"
                data-testid="button-clear-filters"
              >
                Clear filters
              </Button>
            )}
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : shows.length === 0 ? (
          /* Empty state */
          <div
            className="flex flex-col items-center justify-center py-24 text-center"
            data-testid="empty-state"
          >
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
              <Tv className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              No shows yet
            </h2>
            <p className="text-muted-foreground text-sm max-w-64 mb-6">
              Add your first show and never forget which app to open again.
            </p>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-first">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add your first show
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Tv className="h-5 w-5 text-primary" />
                    Add a Show
                  </DialogTitle>
                </DialogHeader>
                <ShowForm
                  onSubmit={(values) => createMutation.mutate(values)}
                  isPending={createMutation.isPending}
                  submitLabel="Add Show"
                />
              </DialogContent>
            </Dialog>
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 text-center"
            data-testid="no-results-state"
          >
            <Search className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No shows match your filters.</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => {
                setFilterStatus("all");
                setFilterService("all");
                setFilterGenre("all");
                setSearch("");
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          /* Show groups */
          <div className="space-y-8" data-testid="shows-container">
            {Object.entries(grouped).map(([statusKey, items]) => {
              if (items.length === 0) return null;
              const cfg =
                STATUS_CONFIG[statusKey as keyof typeof STATUS_CONFIG];
              const Icon = cfg.icon;
              return (
                <section key={statusKey}>
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                    <h2 className="text-sm font-semibold text-foreground">
                      {cfg.label}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {items.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map((show) => (
                      <ShowCard
                        key={show.id}
                        show={{
                          ...show,
                          // Merge local rating override so server refetches
                          // never overwrite a rating the user just tapped
                          rating: ratingsMap[show.id] !== undefined
                            ? ratingsMap[show.id]
                            : show.rating,
                        }}
                        onEdit={setEditShow}
                        onDelete={(id) => deleteMutation.mutate(id)}
                        onStatusChange={(id, status) =>
                          updateMutation.mutate({ id, data: { status } })
                        }
                        onRatingChange={(id, rating) => {
                          // Write into ratingsMap immediately — this is the
                          // display source of truth, independent of the cache
                          setRatingsMap((prev) => ({ ...prev, [id]: rating }));
                          ratingMutation.mutate({ id, rating });
                        }}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      {/* Edit dialog */}
      <Dialog
        open={!!editShow}
        onOpenChange={(open) => !open && setEditShow(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Edit Show
            </DialogTitle>
          </DialogHeader>
          {editShow && (
            <ShowForm
              defaultValues={{
                title: editShow.title,
                streamingService: editShow.streamingService,
                genre: editShow.genre ?? undefined,
                status: editShow.status,
                season: editShow.season ?? undefined,
                episode: editShow.episode ?? undefined,
                notes: editShow.notes ?? undefined,
                posterUrl: editShow.posterUrl ?? undefined,
              }}
              onSubmit={(values) =>
                updateMutation.mutate({ id: editShow.id, data: values })
              }
              isPending={updateMutation.isPending}
              submitLabel="Save Changes"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


