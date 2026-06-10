import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { RoleAwareShell } from "@/components/tenant/RoleAwareShell";
import { OwnerContextSwitcher } from "@/components/tenant/OwnerContextSwitcher";
import { ActiveChildProvider, useActiveChild } from "@/context/ActiveChildContext";
import { useSession } from "@/hooks/useSession";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useUserRole } from "@/hooks/useUserRole";
import { useMyChildren } from "@/hooks/useMyChildren";
import { useNotifications } from "@/hooks/useNotifications";
import { useUnreadMessagesOptimized } from "@/hooks/useUnreadMessagesOptimized";
import { buildMergedNav, GROUP_LABELS, GROUP_ORDER, pickPrimaryRole } from "@/lib/role-navigation";
import { roleLabel, type EduverseRole } from "@/lib/eduverse-roles";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bell, MessageSquare, GraduationCap, Users, Sparkles } from "lucide-react";

function ChildSwitcher() {
  const { activeChild, setActiveChild, children } = useActiveChild();
  if (children.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Child
      </span>
      {children.map((c) => {
        const active = activeChild?.student_id === c.student_id;
        const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
        return (
          <button
            key={c.student_id}
            onClick={() => setActiveChild(c)}
            className={`group flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs transition-all ${
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface hover:bg-accent"
            }`}
          >
            <Avatar className="h-5 w-5">
              <AvatarImage src={c.profile_image_url ?? undefined} />
              <AvatarFallback className="text-[10px]">
                {(c.first_name ?? "?").charAt(0)}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium">{name || "Student"}</span>
            {c.class_name && (
              <span className="text-muted-foreground">· {c.class_name}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function HubContent({
  schoolSlug,
  roles,
  primaryRole,
  schoolId,
  isOwner,
}: {
  schoolSlug: string;
  roles: EduverseRole[];
  primaryRole: EduverseRole | null;
  schoolId: string | null;
  isOwner: boolean;
}) {
  const { user } = useSession();
  const { grouped, items } = useMemo(() => buildMergedNav(roles), [roles]);
  const { data: notifications = [], unreadCount } = useNotifications(schoolId);
  const { unreadCount: unreadMsgs } = useUnreadMessagesOptimized(schoolId, user?.id ?? null);
  const base = `/${schoolSlug}/${primaryRole ?? "student"}`;

  const quickActions = useMemo(() => {
    const lookup = (k: string) => items.find((i) => i.key === k);
    return [
      lookup("messages"),
      lookup("attendance"),
      lookup("report-cards"),
      lookup("fees"),
      lookup("timetable"),
      lookup("notices"),
    ].filter(Boolean).slice(0, 6);
  }, [items]);

  const recentNotifications = notifications.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header strip with context switchers */}
      <div className="flex flex-col gap-3 rounded-3xl border border-border/40 bg-gradient-to-br from-primary/5 via-surface to-transparent p-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Unified workspace
          </p>
          <p className="font-display text-xl font-semibold tracking-tight">
            Welcome back{user?.email ? `, ${user.email.split("@")[0]}` : ""}
          </p>
          {roles.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Active roles: {roles.map((r) => roleLabel[r]).join(" • ")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isOwner && (
            <OwnerContextSwitcher schoolId={schoolId} schoolSlug={schoolSlug} compact />
          )}
          <ChildSwitcher />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Bell} label="Notifications" value={unreadCount} hint="unread" to={`${base}`} />
        <StatCard icon={MessageSquare} label="Messages" value={unreadMsgs} hint="unread" to={`${base}/messages`} />
        <StatCard icon={Sparkles} label="Modules" value={items.length} hint="available" />
        <StatCard icon={Users} label="Roles" value={roles.length} hint="assigned" />
      </div>

      {/* Quick actions */}
      {quickActions.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Quick actions
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
            {quickActions.map((it) => {
              const item = it!;
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  to={item.path ? `${base}/${item.path}` : base}
                  className="flex items-center gap-2 rounded-2xl border border-border/50 bg-surface p-3 text-sm font-medium hover:bg-accent transition-colors overflow-hidden text-ellipsis whitespace-nowrap min-w-0"
                >
                  <Icon className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Module catalog grouped */}
        <div className="lg:col-span-2 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your modules
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {GROUP_ORDER.map((g) => {
              const list = grouped[g];
              if (!list?.length) return null;
              return (
                <div key={g} className="rounded-2xl border border-border/50 bg-surface p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {GROUP_LABELS[g]}
                  </p>
                  <div className="mt-2 flex flex-col gap-1">
                    {list.map((it) => (
                      <Link
                        key={it.key}
                        to={it.path ? `${base}/${it.path}` : base}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                      >
                        <it.icon className="h-4 w-4 text-primary" />
                        {it.label}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Notifications sidebar widget */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent activity
          </p>
          <div className="rounded-2xl border border-border/50 bg-surface p-4">
            {recentNotifications.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent notifications.</p>
            ) : (
              <ul className="space-y-2.5">
                {recentNotifications.map((n) => (
                  <li key={n.id} className="flex items-start gap-2">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        n.read_at ? "bg-muted" : "bg-primary"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      {n.body && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="ghost" size="sm" className="mt-3 w-full">
              <Link to={base}>Open dashboard</Link>
            </Button>
          </div>

          {roles.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              No roles assigned yet for this school.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, hint, to,
}: { icon: any; label: string; value: number; hint: string; to?: string }) {
  const card = (
    <div className="rounded-2xl border border-border/50 bg-surface p-4 transition-all hover:border-primary/30 hover:shadow-soft">
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 text-primary" />
        {value > 0 && <Badge variant="secondary" className="text-[10px]">{value}</Badge>}
      </div>
      <p className="mt-2 font-display text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground">
        {label} · {hint}
      </p>
    </div>
  );
  return to ? <Link to={to}>{card}</Link> : card;
}

export default function UnifiedHub() {
  const { schoolSlug } = useParams<{ schoolSlug: string }>();
  const slug = schoolSlug ?? "";
  const { user } = useSession();
  const tenant = useTenantOptimized(slug);
  const schoolId = tenant.schoolId;
  const { roles } = useUserRole(schoolId, user?.id ?? null);
  const primary = useMemo(() => pickPrimaryRole(roles), [roles]);
  const isOwner = roles.includes("school_owner") || roles.includes("super_admin");
  const isParent = roles.includes("parent");
  const { children } = useMyChildren(isParent ? schoolId : null);

  const body = (
    <HubContent
      schoolSlug={slug}
      roles={roles}
      primaryRole={primary}
      schoolId={schoolId}
      isOwner={isOwner}
    />
  );

  return (
    <RoleAwareShell
      schoolSlug={slug}
      title="Unified Workspace"
      subtitle={
        roles.length > 1
          ? `${roles.length} roles merged into one workspace`
          : undefined
      }
    >
      {isParent ? (
        <ActiveChildProvider schoolId={schoolId} childList={children}>
          {body}
        </ActiveChildProvider>
      ) : (
        body
      )}
    </RoleAwareShell>
  );
}
