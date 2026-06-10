/**
 * DashboardHome — generic fallback home used only for roles without a
 * dedicated role-specific dashboard. Renders a clean welcome with quick
 * links instead of placeholder marketing cards.
 */
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bell, LayoutGrid, MessageSquare, Settings, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function DashboardHome() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;
  const navigate = useNavigate();

  const { data: school } = useQuery({
    queryKey: ["school-name", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase.from("schools").select("name").eq("id", schoolId!).maybeSingle();
      return data;
    },
  });

  const base = schoolSlug ? `/${schoolSlug}` : "";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-accent/30 to-transparent p-6">
        <p className="font-display text-xl font-semibold tracking-tight">
          Welcome{school?.name ? ` to ${school.name}` : ""}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the sidebar to navigate, or jump into a common workspace below.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Quick links</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Link icon={LayoutGrid} label="Modules" desc="See everything you can access"
                onClick={() => navigate(base)} />
          <Link icon={MessageSquare} label="Messages" desc="Open inbox"
                onClick={() => navigate(`${base}/messages`)} />
          <Link icon={Bell} label="Notifications" desc="Recent updates"
                onClick={() => navigate(`${base}/support`)} />
          <Link icon={Settings} label="Settings" desc="Profile & preferences"
                onClick={() => navigate(`${base}/settings`)} />
        </CardContent>
      </Card>
    </div>
  );
}

function Link({ icon: Icon, label, desc, onClick }:
  { icon: any; label: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-border/60 p-3 text-left transition hover:border-primary/50 hover:bg-primary/5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{desc}</p>
      </span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

// keep Users import side-effect free for tree-shake parity
void Users;
