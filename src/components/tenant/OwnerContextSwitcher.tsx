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

  const handleCampus = async (id: string) => {
    await ctx.setActiveCampus(id === ALL_CAMPUSES ? null : id);
    window.location.reload();
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
            "gap-1.5 rounded-xl border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all duration-200 text-foreground shadow-2xs group shrink-0",
            compact
              ? "h-8 sm:h-9 px-2 max-w-[110px] sm:max-w-[170px]"
              : "h-10 px-3 w-full justify-between"
          )}
        >
          <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0 group-hover:scale-110 transition-transform" />
          <div className="flex flex-col items-start leading-none min-w-0 text-left">
            <span className="text-[11px] sm:text-xs font-bold truncate max-w-[70px] sm:max-w-[130px] text-foreground">
              {label}
            </span>
            <span className="text-[9px] sm:text-[10px] text-muted-foreground truncate max-w-[70px] sm:max-w-[130px] font-medium hidden xs:inline">
              {sub}
            </span>
          </div>
          <ChevronsUpDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 opacity-60 shrink-0 text-muted-foreground ml-0.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[300px] p-0 rounded-2xl border-primary/20 bg-surface/95 backdrop-blur-2xl shadow-xl">
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
