import { useNavigate } from "react-router-dom";
import { Building2, Check, ChevronsUpDown, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useOwnerContext, ALL_CAMPUSES } from "@/hooks/useOwnerContext";
import { cn } from "@/lib/utils";

interface Props {
  schoolId: string | null;
  schoolSlug: string;
  compact?: boolean;
}

export function OwnerContextSwitcher({ schoolId, schoolSlug, compact }: Props) {
  const navigate = useNavigate();
  const ctx = useOwnerContext(schoolId);

  const handleSchool = (slug: string) => {
    if (slug === schoolSlug) return;
    navigate(`/${slug}/school_owner`);
  };

  const handleCampus = (id: string) => {
    ctx.setActiveCampus(id === ALL_CAMPUSES ? null : id);
  };

  const label = ctx.activeSchool?.name ?? "Select school";
  const sub = ctx.activeCampus?.name ?? "All campuses";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={compact ? "sm" : "default"}
          className={cn(
            "gap-2 rounded-xl border-primary/20 bg-primary/5 hover:bg-primary/10",
            compact && "h-9 px-2"
          )}
        >
          <Building2 className="h-4 w-4 text-primary shrink-0" />
          <div className="flex flex-col items-start leading-tight min-w-0">
            <span className="text-xs font-semibold truncate max-w-[140px]">{label}</span>
            <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
              {sub}
            </span>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Search schools or campuses…" />
          <CommandList className="max-h-[360px]">
            <CommandEmpty>No matches.</CommandEmpty>

            <CommandGroup heading="Schools">
              {ctx.schools.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground">
                  No schools assigned to your account yet.
                </div>
              ) : (
                ctx.schools.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={`school-${s.name}-${s.slug}`}
                    onSelect={() => handleSchool(s.slug)}
                  >
                    <Building2 className="mr-2 h-4 w-4" />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{s.name}</span>
                      <span className="text-[10px] text-muted-foreground">/{s.slug}</span>
                    </div>
                    {s.id === schoolId && (
                      <Check className="ml-auto h-4 w-4 text-primary" />
                    )}
                  </CommandItem>
                ))
              )}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Campuses (current school)">
              <CommandItem
                value="campus-all"
                onSelect={() => handleCampus(ALL_CAMPUSES)}
              >
                <MapPin className="mr-2 h-4 w-4" />
                <span className="text-sm">All campuses</span>
                {ctx.activeCampusId === null && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </CommandItem>
              {ctx.campuses.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`campus-${c.name}`}
                  onSelect={() => handleCampus(c.id)}
                >
                  <MapPin className="mr-2 h-4 w-4" />
                  <div className="flex flex-col">
                    <span className="text-sm">{c.name}</span>
                    {c.code && (
                      <span className="text-[10px] text-muted-foreground">{c.code}</span>
                    )}
                  </div>
                  {c.id === ctx.activeCampusId && (
                    <Check className="ml-auto h-4 w-4 text-primary" />
                  )}
                </CommandItem>
              ))}
              {ctx.campuses.length === 0 && (
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  No campuses configured for this school.
                </div>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
