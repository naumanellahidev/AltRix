import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

type Shortcut = { keys: string[]; label: string };
type Group = { title: string; items: Shortcut[] };

const GROUPS: Group[] = [
  {
    title: "General",
    items: [
      { keys: ["?"], label: "Open this shortcuts overlay" },
      { keys: ["Esc"], label: "Close dialogs / overlays" },
      { keys: ["Enter"], label: "Submit form / confirm primary action in dialogs" },
      { keys: ["Tab"], label: "Move focus to next control" },
      { keys: ["Shift", "Tab"], label: "Move focus to previous control" },
    ],
  },
  {
    title: "Navigation",
    items: [
      { keys: ["↑", "↓"], label: "Move between rows in lists & tables" },
      { keys: ["←", "→"], label: "Cycle status / move between cells" },
      { keys: ["Home"], label: "Jump to first item (where supported)" },
      { keys: ["End"], label: "Jump to last item (where supported)" },
    ],
  },
  {
    title: "Attendance (Staff & Student)",
    items: [
      { keys: ["P"], label: "Mark Present" },
      { keys: ["A"], label: "Mark Absent" },
      { keys: ["L"], label: "Mark Late" },
      { keys: ["H"], label: "Mark Half-Day (staff)" },
      { keys: ["E"], label: "Mark Excused / On Leave" },
      { keys: ["Enter"], label: "Move to next staff / student" },
    ],
  },
  {
    title: "Search & Selects",
    items: [
      { keys: ["/"], label: "Focus the page search (where supported)" },
      { keys: ["↑", "↓"], label: "Move between options in a dropdown" },
      { keys: ["Enter"], label: "Select highlighted option" },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-1.5 rounded border border-border bg-muted text-[11px] font-mono font-medium text-foreground shadow-sm">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const isTyping =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
        (t && (t as HTMLElement).isContentEditable);

      // Open with `?` or Shift+/
      if (!isTyping && (e.key === "?" || (e.key === "/" && e.shiftKey))) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      // Esc closes (Radix handles its own dialogs too)
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" /> Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Press <Kbd>?</Kbd> anywhere to open this overlay. Shortcuts work globally unless you're typing in a text field.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-2">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h3 className="text-sm font-semibold mb-3 text-foreground">{g.title}</h3>
              <ul className="space-y-2">
                {g.items.map((s, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {s.keys.map((k, j) => (
                        <span key={j} className="flex items-center gap-1">
                          {j > 0 && <span className="text-muted-foreground text-xs">+</span>}
                          <Kbd>{k}</Kbd>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-4 border-t pt-3">
          Tip: arrow-key navigation is accelerated when holding a key in lists & tables for fast scanning.
        </p>
      </DialogContent>
    </Dialog>
  );
}
