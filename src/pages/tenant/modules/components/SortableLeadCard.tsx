import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Star, Mail, Phone, Flame, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type LeadType = {
  id: string;
  full_name: string;
  score: number;
  notes: string | null;
  email: string | null;
  phone: string | null;
  assigned_to: string | null;
  source: string | null;
  status: string;
};

export function SortableLeadCard({
  lead,
  counselorName,
  onBumpScore,
  onOpen,
}: {
  lead: LeadType;
  counselorName?: string;
  onBumpScore: () => void;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as const;

  const isHot = lead.score >= 50;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        "rounded-2xl bg-surface p-5 shadow-elevated border transition-all hover:border-primary/40 h-[240px] flex flex-col justify-between " +
        (isDragging ? "opacity-70 scale-95" : "opacity-100") + " " +
        (lead.status === "won" ? "border-emerald-500/20 bg-emerald-500/[0.01]" : lead.status === "lost" ? "border-muted/30 opacity-60" : "border-border")
      }
    >
      {/* Top Header Section */}
      <div className="flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="truncate text-base font-bold text-foreground tracking-tight">{lead.full_name}</p>
            {lead.status === "won" && (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 text-[8px] py-0 px-1 border border-emerald-500/20 uppercase font-bold tracking-wide">Enrolled</Badge>
            )}
            {lead.status === "lost" && (
              <Badge variant="outline" className="bg-secondary text-secondary-foreground text-[8px] py-0 px-1 uppercase font-bold tracking-wide border-transparent">Lost</Badge>
            )}
          </div>
        </div>

        <button
          className="grid h-8 w-8 place-items-center rounded-xl bg-secondary text-muted-foreground hover:bg-secondary/80 shrink-0 cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Drag"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>

      {/* Middle Scrollable Section */}
      <div className="flex-1 overflow-y-auto pr-1 my-2 space-y-2 scrollbar-thin text-xs text-muted-foreground/90">
        {lead.notes && (
          <p className="leading-relaxed font-sans">{lead.notes}</p>
        )}
        
        {/* Badges and tags */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {lead.source && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold bg-muted/80 px-2 py-0.5 rounded-lg text-muted-foreground/80 border">
              <Target className="h-3 w-3" /> {lead.source}
            </span>
          )}
          
          {/* Contact indicators */}
          {lead.phone && (
            <span className="p-1 bg-sky-500/10 text-sky-600 rounded-md border border-sky-500/20" title={lead.phone}>
              <Phone className="h-3 w-3" />
            </span>
          )}
          {lead.email && (
            <span className="p-1 bg-indigo-500/10 text-indigo-600 rounded-md border border-indigo-500/20" title={lead.email}>
              <Mail className="h-3 w-3" />
            </span>
          )}
        </div>

        {/* Counselor tag if assigned */}
        {counselorName && (
          <div className="text-[11px] text-muted-foreground truncate border-t pt-1.5">
            Assignee: <span className="font-semibold text-foreground">{counselorName}</span>
          </div>
        )}
      </div>

      {/* Bottom Footer Section */}
      <div className="flex items-center justify-between border-t pt-3 shrink-0">
        <div className={`flex items-center gap-1.5 text-sm ${isHot ? "text-amber-600 font-bold" : "text-muted-foreground"}`}>
          {isHot ? <Flame className="h-4 w-4 animate-pulse text-amber-500" /> : <Star className="h-3.5 w-3.5" />}
          <span>{lead.score ?? 0}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="soft" size="sm" className="h-8 text-xs px-3" onClick={onOpen}>
            Open
          </Button>
          <Button variant="soft" size="sm" className="h-8 text-xs px-3" onClick={onBumpScore}>
            +5
          </Button>
        </div>
      </div>
    </div>
  );
}
