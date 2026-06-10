import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Search,
  Users,
  GraduationCap,
  KanbanSquare,
  BarChart3,
  CalendarDays,
  Coins,
  Headphones,
  Settings,
  LayoutGrid,
  ShieldCheck,
  UserCircle,
  Building2,
  FileText,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  basePath: string; // e.g. "/acme/principal" or "/acme/teacher"
};

type SearchResult = {
  entity: "students" | "staff" | "leads";
  id: string;
  title: string;
  subtitle: string;
  status: string;
};

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function GlobalCommandPalette({ basePath }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query.trim(), 250);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Extract schoolId from basePath (format: /schoolSlug/role)
  const schoolSlug = useMemo(() => {
    const parts = basePath.split("/").filter(Boolean);
    return parts[0] || "";
  }, [basePath]);

  const [schoolId, setSchoolId] = useState<string | null>(null);

  // Fetch schoolId on mount
  useEffect(() => {
    if (!schoolSlug) return;
    (async () => {
      const { data } = await supabase
        .from("schools")
        .select("id")
        .eq("slug", schoolSlug)
        .maybeSingle();
      if (data?.id) setSchoolId(data.id);
    })();
  }, [schoolSlug]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === "k";
      if ((e.metaKey || e.ctrlKey) && isK) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("eduverse:open-search", onOpen);
    return () => window.removeEventListener("eduverse:open-search", onOpen);
  }, []);

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  // Search across all entities
  const performSearch = useCallback(async () => {
    if (!schoolId || !debouncedQuery) {
      setResults([]);
      return;
    }

    setSearching(true);
    try {
      // Search all three entity types in parallel
      const [studentsRes, staffRes, leadsRes] = await Promise.all([
        (supabase as any).rpc("directory_search", {
          _school_id: schoolId,
          _entity: "students",
          _q: debouncedQuery,
          _status: null,
          _limit: 5,
          _offset: 0,
        }),
        (supabase as any).rpc("directory_search", {
          _school_id: schoolId,
          _entity: "staff",
          _q: debouncedQuery,
          _status: null,
          _limit: 5,
          _offset: 0,
        }),
        (supabase as any).rpc("directory_search", {
          _school_id: schoolId,
          _entity: "leads",
          _q: debouncedQuery,
          _status: null,
          _limit: 5,
          _offset: 0,
        }),
      ]);

      const allResults: SearchResult[] = [
        ...((studentsRes.data ?? []) as unknown as SearchResult[]),
        ...((staffRes.data ?? []) as unknown as SearchResult[]),
        ...((leadsRes.data ?? []) as unknown as SearchResult[]),
      ];

      setResults(allResults);
    } catch (error) {
      console.error("Search error:", error);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [schoolId, debouncedQuery]);

  useEffect(() => {
    performSearch();
  }, [performSearch]);

  // Navigation items - all modules and sections
  const navItems = useMemo(
    () => [
      { label: "Dashboard", icon: LayoutGrid, href: basePath, keywords: "home overview" },
      { label: "Academic", icon: GraduationCap, href: `${basePath}/academic`, keywords: "classes sections subjects teachers students grades" },
      { label: "Timetable", icon: CalendarDays, href: `${basePath}/timetable`, keywords: "schedule periods slots" },
      { label: "Attendance", icon: GraduationCap, href: `${basePath}/attendance`, keywords: "present absent late" },
      { label: "Staff & Users", icon: Users, href: `${basePath}/users`, keywords: "employees hr teachers principal" },
      { label: "CRM / Leads", icon: KanbanSquare, href: `${basePath}/crm`, keywords: "admissions pipeline marketing" },
      { label: "Finance", icon: Coins, href: `${basePath}/finance`, keywords: "fees payments invoices expenses" },
      { label: "Reports", icon: BarChart3, href: `${basePath}/reports`, keywords: "analytics statistics" },
      { label: "Support", icon: Headphones, href: `${basePath}/support`, keywords: "help tickets" },
      { label: "Directory Search", icon: Search, href: `${basePath}/directory`, keywords: "find search all" },
      { label: "Settings", icon: Settings, href: `${basePath}?settings=1`, keywords: "configuration preferences" },
    ],
    [basePath],
  );

  // Filter navigation items based on query
  const filteredNavItems = useMemo(() => {
    if (!query.trim()) return navItems;
    const q = query.toLowerCase();
    return navItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q)
    );
  }, [navItems, query]);

  const getEntityIcon = (entity: string) => {
    switch (entity) {
      case "students":
        return GraduationCap;
      case "staff":
        return UserCircle;
      case "leads":
        return Building2;
      default:
        return FileText;
    }
  };

  const navigateToResult = (result: SearchResult) => {
    setOpen(false);
    if (result.entity === "leads") {
      navigate(`${basePath}/crm?leadId=${result.id}`);
    } else if (result.entity === "students") {
      navigate(`${basePath}/academic?studentId=${result.id}`);
    } else {
      navigate(`${basePath}/users?userId=${result.id}`);
    }
  };

  // Group results by entity
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {
      students: [],
      staff: [],
      leads: [],
    };
    results.forEach((r) => {
      if (groups[r.entity]) {
        groups[r.entity].push(r);
      }
    });
    return groups;
  }, [results]);

  const hasResults = results.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search students, staff, leads, or navigate…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[60vh]">
        {searching && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
          </div>
        )}

        {!searching && debouncedQuery && !hasResults && filteredNavItems.length === 0 && (
          <CommandEmpty>No results found for "{debouncedQuery}"</CommandEmpty>
        )}

        {/* Search Results - Students */}
        {groupedResults.students.length > 0 && (
          <CommandGroup heading="Students">
            {groupedResults.students.map((r) => {
              const Icon = getEntityIcon(r.entity);
              return (
                <CommandItem
                  key={`${r.entity}-${r.id}`}
                  value={`${r.entity}-${r.title}`}
                  onSelect={() => navigateToResult(r)}
                >
                  <Icon className="mr-2 h-4 w-4 text-primary" />
                  <div className="flex flex-1 flex-col">
                    <span>{r.title}</span>
                    {r.subtitle && (
                      <span className="text-xs text-muted-foreground">{r.subtitle}</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground capitalize">{r.status}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Search Results - Staff */}
        {groupedResults.staff.length > 0 && (
          <CommandGroup heading="Staff">
            {groupedResults.staff.map((r) => {
              const Icon = getEntityIcon(r.entity);
              return (
                <CommandItem
                  key={`${r.entity}-${r.id}`}
                  value={`${r.entity}-${r.title}`}
                  onSelect={() => navigateToResult(r)}
                >
                  <Icon className="mr-2 h-4 w-4 text-primary" />
                  <div className="flex flex-1 flex-col">
                    <span>{r.title}</span>
                    {r.subtitle && (
                      <span className="text-xs text-muted-foreground">{r.subtitle}</span>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Search Results - Leads */}
        {groupedResults.leads.length > 0 && (
          <CommandGroup heading="Leads">
            {groupedResults.leads.map((r) => {
              const Icon = getEntityIcon(r.entity);
              return (
                <CommandItem
                  key={`${r.entity}-${r.id}`}
                  value={`${r.entity}-${r.title}`}
                  onSelect={() => navigateToResult(r)}
                >
                  <Icon className="mr-2 h-4 w-4 text-accent-foreground" />
                  <div className="flex flex-1 flex-col">
                    <span>{r.title}</span>
                    {r.subtitle && (
                      <span className="text-xs text-muted-foreground">{r.subtitle}</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground capitalize">{r.status}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {(hasResults || debouncedQuery) && filteredNavItems.length > 0 && <CommandSeparator />}

        {/* Navigation Items */}
        {filteredNavItems.length > 0 && (
          <CommandGroup heading="Navigate">
            {filteredNavItems.map((it) => (
              <CommandItem
                key={it.label}
                value={`nav-${it.label}`}
                onSelect={() => {
                  setOpen(false);
                  navigate(it.href);
                }}
              >
                <it.icon className="mr-2 h-4 w-4" />
                <span>{it.label}</span>
                <CommandShortcut>↵</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!debouncedQuery && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tips">
              <CommandItem disabled className="text-muted-foreground">
                <span>Type to search students, staff, leads, or modules</span>
              </CommandItem>
              <CommandItem disabled className="text-muted-foreground">
                <span>Ctrl/⌘ K to open from anywhere</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
