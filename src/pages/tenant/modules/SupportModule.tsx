import { SupportInbox } from "@/pages/tenant/modules/components/SupportInbox";
import { Headphones, Sparkles } from "lucide-react";

export function SupportModule({ schoolId }: { schoolId: string }) {
  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-sky-500/10 via-background to-background p-6 md:p-7">
        <div className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-sky-500/15 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-600 text-white flex items-center justify-center shadow-lg shadow-sky-500/30">
            <Headphones className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-sky-600 dark:text-sky-400 font-semibold">
              <Sparkles className="h-3.5 w-3.5" /> Support Inbox
            </div>
            <h2 className="font-display text-3xl font-bold tracking-tight mt-1.5">Help Tickets</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Live conversations with students and parents · resolve, reopen and reply in one place.
            </p>
          </div>
        </div>
      </div>

      <SupportInbox schoolId={schoolId} />
    </div>
  );
}
