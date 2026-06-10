import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

export type StaffOption = {
  id: string;
  full_name?: string | null;
  email?: string | null;
};

interface StaffComboboxProps {
  staff: StaffOption[];
  value?: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  pageSize?: number;
  className?: string;
  showEmail?: boolean;
}

export function StaffCombobox({
  staff,
  value,
  onChange,
  placeholder = "Select staff",
  disabled,
  pageSize = 25,
  className,
  showEmail = true,
}: StaffComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    setPage(1);
  }, [query, open]);

  const selected = staff.find((s) => s.id === value);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(
      (s) =>
        (s.full_name || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q),
    );
  }, [staff, query]);

  const visible = filtered.slice(0, page * pageSize);
  const hasMore = filtered.length > visible.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate text-left">
            {selected
              ? showEmail && selected.email
                ? `${selected.full_name || "Unknown"} (${selected.email})`
                : selected.full_name || selected.email || "Unknown"
              : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width] min-w-[260px]"
        align="start"
      >
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search staff..."
            className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {visible.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No staff found
            </div>
          ) : (
            visible.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onChange(s.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left",
                  s.id === value && "bg-accent/50",
                )}
              >
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    s.id === value ? "opacity-100" : "opacity-0",
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{s.full_name || "Unknown"}</div>
                  {showEmail && s.email && (
                    <div className="truncate text-xs text-muted-foreground">
                      {s.email}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
        {hasMore && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setPage((p) => p + 1)}
            >
              Load more ({filtered.length - visible.length} remaining)
            </Button>
          </div>
        )}
        <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
          {filtered.length} of {staff.length}
        </div>
      </PopoverContent>
    </Popover>
  );
}
