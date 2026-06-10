import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navigate } from "react-router-dom";
import {
  ExternalLink,
  LogOut,
  Search,
  ShieldCheck,
  UserPlus,
  ListFilter,
  PlusCircle,
  Lock,
  Inbox,
  ScrollText,
  Building2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import CampusCreatorCard from "./CampusCreatorCard";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";
import PlatformRequestsCard from "./PlatformRequestsCard";

type SchoolRow = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

type AuditRow = {
  id: string;
  created_at: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  school_id: string | null;
  actor_user_id: string | null;
};

export default function PlatformSchoolsPage() {
  const navigate = useNavigate();
  const { user, loading } = useSession();

  const [authz, setAuthz] = useState<"checking" | "ok" | "denied">("checking");
  const [authzMessage, setAuthzMessage] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditSchoolId, setAuditSchoolId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"directory" | "provisioning" | "access" | "requests" | "audits">("directory");

  // Direct school creation (no bootstrap secret)
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newActive, setNewActive] = useState(true);
  const [principalEmail, setPrincipalEmail] = useState("");
  const [principalPassword, setPrincipalPassword] = useState("");
  const [principalDisplayName, setPrincipalDisplayName] = useState("Principal");
  const [creatingSchool, setCreatingSchool] = useState(false);

  // Owner assignment (Phase 5)
  type OwnerOption = { user_id: string; email: string; display_name: string; school_count: number };
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [ownersError, setOwnersError] = useState<string | null>(null);
  const [ownerMode, setOwnerMode] = useState<"none" | "existing" | "new">("none");
  const [ownerUserId, setOwnerUserId] = useState<string>("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerDisplayName, setOwnerDisplayName] = useState("");

  // Direct staff creation
  const [staffSchoolId, setStaffSchoolId] = useState<string>("__none__");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffDisplayName, setStaffDisplayName] = useState("");
  const [staffRole, setStaffRole] = useState<string>("teacher");
  const [creatingStaff, setCreatingStaff] = useState(false);

  // Bootstrap unlock
  const [unlockSchoolId, setUnlockSchoolId] = useState<string>("__none__");
  const [unlocking, setUnlocking] = useState(false);

  // Impersonation (audited)
  const [impSchoolId, setImpSchoolId] = useState<string>("__none__");
  const [impRolePath, setImpRolePath] = useState<string>("principal");
  const [impEmail, setImpEmail] = useState<string>("");
  const [impReason, setImpReason] = useState<string>("");
  const [impBusy, setImpBusy] = useState(false);
  const [impLink, setImpLink] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/auth", { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setAuthz("checking");
    setAuthzMessage(null);

    (async () => {
      const { data: psa, error: psaErr } = await supabase
        .from("platform_super_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (psaErr) {
        setAuthz("denied");
        setAuthzMessage(psaErr.message);
        return;
      }
      if (!psa?.user_id) {
        setAuthz("denied");
        setAuthzMessage("Access denied. Platform Super Admin only.");
        return;
      }

      setAuthz("ok");
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const refresh = async () => {
    const { data: s, error: sErr } = await supabase
      .from("schools")
      .select("id,slug,name,is_active,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!sErr) setSchools((s ?? []) as SchoolRow[]);

    const { data: a, error: aErr } = await (supabase as any)
      .from("audit_logs")
      .select("id,created_at,action,entity_type,entity_id,school_id,actor_user_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!aErr) setAudit((a ?? []) as unknown as AuditRow[]);

    setOwnersLoading(true);
    setOwnersError(null);
    const { data: owners, error: ownersErr } = await (supabase as any).rpc("list_existing_school_owners");
    if (ownersErr) {
      setOwnersError(ownersErr.message || "Failed to load owners");
    } else {
      setOwnerOptions((owners ?? []) as OwnerOption[]);
    }
    setOwnersLoading(false);
  };

  // Parse `{ ok:false, code, error }` body from a functions.invoke error.
  const parseInvokeErrorBody = (error: unknown): { code?: string; error?: string } | null => {
    const raw = (error as any)?.context?.body;
    if (typeof raw !== "string") return null;
    try {
      return JSON.parse(raw) as { code?: string; error?: string };
    } catch {
      return null;
    }
  };

  const getDetailFromInvokeError = (error: unknown) => {
    const body = parseInvokeErrorBody(error);
    return body?.error ?? null;
  };

  const createSchoolDirect = async () => {
    if (!newSlug.trim()) return toast.error("School slug is required");
    if (!newName.trim()) return toast.error("School name is required");
    if (!principalEmail.trim()) return toast.error("Principal email is required");
    if (principalPassword.trim().length < 8) return toast.error("Principal password must be at least 8 characters");

    let ownerPayload: Record<string, unknown> = {};
    if (ownerMode === "existing") {
      if (!ownerUserId) return toast.error("Pick an existing owner");
      ownerPayload = { ownerUserId };
    } else if (ownerMode === "new") {
      if (!ownerEmail.trim()) return toast.error("Owner email is required");
      if (ownerPassword.trim().length < 8) return toast.error("Owner password must be at least 8 characters");
      ownerPayload = {
        ownerEmail: ownerEmail.trim().toLowerCase(),
        ownerPassword,
        ownerDisplayName: ownerDisplayName.trim() || "School Owner",
      };
    }

    setCreatingSchool(true);
    try {
      const { data, error } = await supabase.functions.invoke("eduverse-admin-create-school", {
        body: {
          slug: newSlug.trim(),
          name: newName.trim(),
          isActive: newActive,
          principalEmail: principalEmail.trim().toLowerCase(),
          principalPassword: principalPassword,
          principalDisplayName: principalDisplayName.trim() || "Principal",
          ...ownerPayload,
        },
      });
      if (error) {
        const body = parseInvokeErrorBody(error);
        if (body?.code === "owner_email_not_found") {
          toast.error(body.error || "Owner email not found", {
            description: "Switch to 'Create new owner' to create the account, or pick from the existing owners list.",
            action: {
              label: "Create new owner",
              onClick: () => setOwnerMode("new"),
            },
          });
          return;
        }
        toast.error(body?.error ?? error.message);
        return;
      }

      const assignedOwner = (data as any)?.ownerUserId;
      const ownerExisted = (data as any)?.ownerAssignmentExisted;
      toast.success(
        assignedOwner
          ? ownerExisted
            ? "School created + principal set (owner was already assigned)"
            : "School created + principal set + owner assigned"
          : "School created + principal set",
      );
      setNewSlug("");
      setNewName("");
      setPrincipalEmail("");
      setPrincipalPassword("");
      setPrincipalDisplayName("Principal");
      setOwnerMode("none");
      setOwnerUserId("");
      setOwnerEmail("");
      setOwnerPassword("");
      setOwnerDisplayName("");
      await refresh();

      const created = (data as any)?.school as { slug?: string } | undefined;
      if (created?.slug) {
        navigate(`/${created.slug}/auth`);
      }
    } finally {
      setCreatingSchool(false);
    }
  };

  const createStaffDirect = async () => {
    const s = schools.find((x) => x.id === staffSchoolId);
    if (!s) return toast.error("Select a school");
    if (!staffEmail.trim()) return toast.error("Email is required");
    if (staffPassword.trim().length < 8) return toast.error("Password must be at least 8 characters");

    setCreatingStaff(true);
    try {
      const { error } = await supabase.functions.invoke("eduverse-admin-create-user", {
        body: {
          schoolSlug: s.slug,
          email: staffEmail.trim().toLowerCase(),
          password: staffPassword,
          displayName: staffDisplayName.trim() || undefined,
          role: staffRole,
        },
      });
      if (error) {
        toast.error(getDetailFromInvokeError(error) ?? error.message);
        return;
      }
      toast.success("User created (password set)");
      setStaffEmail("");
      setStaffPassword("");
      setStaffDisplayName("");
      setStaffRole("teacher");
      await refresh();
    } finally {
      setCreatingStaff(false);
    }
  };

  const unlockBootstrap = async () => {
    const s = schools.find((x) => x.id === unlockSchoolId);
    if (!s) return toast.error("Select a school");
    setUnlocking(true);
    try {
      const { error } = await supabase.functions.invoke("eduverse-admin-unlock-bootstrap", {
        body: { schoolSlug: s.slug },
      });
      if (error) {
        toast.error(getDetailFromInvokeError(error) ?? error.message);
        return;
      }
      toast.success("Bootstrap unlocked");
      await refresh();
    } finally {
      setUnlocking(false);
    }
  };

  useEffect(() => {
    if (authz !== "ok") return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authz]);

  useEffect(() => {
    if (schools.length === 0) return;
    if (staffSchoolId === "__none__") setStaffSchoolId(schools[0].id);
    if (unlockSchoolId === "__none__") setUnlockSchoolId(schools[0].id);
    if (impSchoolId === "__none__") setImpSchoolId(schools[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schools.length]);

  const impersonate = async () => {
    const s = schools.find((x) => x.id === impSchoolId);
    if (!s) return toast.error("Select a school");
    if (!impEmail.trim()) return toast.error("Target email is required");

    setImpBusy(true);
    setImpLink(null);
    try {
      const { data, error } = await supabase.functions.invoke("eduverse-admin-impersonate", {
        body: {
          targetEmail: impEmail.trim().toLowerCase(),
          schoolSlug: s.slug,
          rolePath: impRolePath,
          reason: impReason.trim() || undefined,
          appOrigin: window.location.origin,
        },
      });
      if (error) {
        toast.error(getDetailFromInvokeError(error) ?? error.message);
        return;
      }
      const link = (data as any)?.actionLink as string | null;
      if (!link) {
        toast.error("No impersonation link returned");
        return;
      }
      setImpLink(link);
      toast.success("Impersonation link generated (audited)");
    } finally {
      setImpBusy(false);
    }
  };

  const filteredSchools = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return schools;
    return schools.filter((s) => `${s.name} ${s.slug}`.toLowerCase().includes(needle));
  }, [q, schools]);

  const schoolsById = useMemo(() => new Map(schools.map((s) => [s.id, s])), [schools]);

  const filteredAudit = useMemo(() => {
    if (auditSchoolId === "all") return audit;
    return audit.filter((a) => a.school_id === auditSchoolId);
  }, [audit, auditSchoolId]);

  if (loading) {
    return null;
  }
  
  if (authz === "denied") {
    return <Navigate to="/auth" replace />;
  }

  return (
    <SuperAdminShell title="Schools" subtitle="Create, manage and inspect every tenant on the platform">
      <div className="space-y-6 text-zinc-100">
        {authz !== "ok" && (
          <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader>
              <CardTitle className="font-display text-xl text-white">Access</CardTitle>
              <p className="text-xs text-zinc-400">Platform Super Admin only</p>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-300">
                {authz === "checking" ? "Verifying access…" : authzMessage ?? "Access denied."}
              </div>
            </CardContent>
          </Card>
        )}

        {authz === "ok" && (
          <>
            {/* Sub-tabs Navigation */}
            <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-px mb-6">
              {[
                { id: "directory", label: "Schools Directory", icon: ListFilter },
                { id: "provisioning", label: "Tenant Provisioning", icon: PlusCircle },
                { id: "access", label: "Access & Control", icon: Lock },
                { id: "requests", label: "Tenant Requests", icon: Inbox },
                { id: "audits", label: "School Audit Log", icon: ScrollText },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px ${
                      active
                        ? "border-amber-500 text-amber-400 font-semibold"
                        : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* directory tab */}
            {activeTab === "directory" && (
              <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                <CardHeader>
                  <CardTitle className="font-display text-xl text-white">All Schools</CardTitle>
                  <p className="text-xs text-zinc-400">Search schools and jump into any tenant workspace.</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="relative md:max-w-sm">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                      <Input
                        className="pl-9 bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 autofill:shadow-[0_0_0px_1000px_#18181b_inset]"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search by name or slug"
                      />
                    </div>
                    <Button
                      variant="outline"
                      className="border-zinc-800 bg-zinc-950/60 text-zinc-200 hover:bg-amber-500/10 hover:text-amber-300 border"
                      onClick={refresh}
                    >
                      Refresh
                    </Button>
                  </div>

                  <div className="overflow-auto rounded-2xl border border-zinc-800 bg-zinc-950">
                    <Table>
                      <TableHeader className="bg-zinc-900/40">
                        <TableRow className="border-b border-zinc-900 hover:bg-transparent">
                          <TableHead className="text-zinc-400 font-semibold">School</TableHead>
                          <TableHead className="text-zinc-400 font-semibold">Slug</TableHead>
                          <TableHead className="text-zinc-400 font-semibold">Status</TableHead>
                          <TableHead className="text-right text-zinc-400 font-semibold">Open</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSchools.map((s) => (
                          <TableRow key={s.id} className="border-b border-zinc-900/80 hover:bg-zinc-900/30">
                            <TableCell className="font-semibold text-white">{s.name}</TableCell>
                            <TableCell className="text-zinc-300">/{s.slug}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.is_active ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}>
                                {s.is_active ? "Active" : "Disabled"}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20 shadow-sm"
                                asChild
                              >
                                <a href={`/${s.slug}/super_admin/schools`}>
                                  <ShieldCheck className="mr-2 h-4 w-4" /> Open
                                </a>
                              </Button>
                              <Button
                                size="sm"
                                className="ml-2 border border-zinc-800 bg-zinc-950/60 text-zinc-200 hover:bg-amber-500/10 hover:text-amber-300 border"
                                asChild
                              >
                                <a href={`/${s.slug}/auth`}>
                                  <ExternalLink className="mr-2 h-4 w-4" /> Tenant login
                                </a>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredSchools.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-6 text-zinc-500">
                              No schools found.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* provisioning tab */}
            {activeTab === "provisioning" && (
              <div className="space-y-6">
                <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                  <CardHeader>
                    <CardTitle className="font-display text-xl text-white">Create School (Direct)</CardTitle>
                    <p className="text-xs text-zinc-400">
                      Create a school + first Principal with an explicit password (no bootstrap secret).
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">School Slug</label>
                        <Input
                          className="bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 autofill:shadow-[0_0_0px_1000px_#18181b_inset]"
                          value={newSlug}
                          onChange={(e) => setNewSlug(e.target.value)}
                          placeholder="e.g. beacon"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium text-white">School Name</label>
                        <Input
                          className="bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 autofill:shadow-[0_0_0px_1000px_#18181b_inset]"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="Beacon International School"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
                      <div>
                        <p className="text-sm font-medium text-white">Active school</p>
                        <p className="mt-1 text-xs text-zinc-400">Disable to block tenant logins until ready.</p>
                      </div>
                      <Switch checked={newActive} onCheckedChange={setNewActive} />
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">Principal Email</label>
                        <Input
                          className="bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 autofill:shadow-[0_0_0px_1000px_#18181b_inset]"
                          value={principalEmail}
                          onChange={(e) => setPrincipalEmail(e.target.value)}
                          placeholder="principal@school.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">Principal Password</label>
                        <Input
                          className="bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 autofill:shadow-[0_0_0px_1000px_#18181b_inset]"
                          value={principalPassword}
                          onChange={(e) => setPrincipalPassword(e.target.value)}
                          type="password"
                          placeholder="Minimum 8 characters"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">Principal Display Name</label>
                        <Input
                          className="bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 autofill:shadow-[0_0_0px_1000px_#18181b_inset]"
                          value={principalDisplayName}
                          onChange={(e) => setPrincipalDisplayName(e.target.value)}
                          placeholder="Principal"
                        />
                      </div>
                    </div>

                    {/* School Owner picker */}
                    <div className="space-y-3 rounded-2xl border border-amber-500/10 bg-zinc-900/30 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-white">School Owner</p>
                          <p className="text-xs text-zinc-400">Assign a School Owner now (writes to school_owner_assignments). Optional.</p>
                        </div>
                        <Select value={ownerMode} onValueChange={(v) => setOwnerMode(v as any)}>
                          <SelectTrigger className="w-48 bg-zinc-900 border-amber-500/20 text-white focus:ring-amber-500/30">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No owner yet</SelectItem>
                            <SelectItem value="existing">Pick existing owner</SelectItem>
                            <SelectItem value="new">Create new owner</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {ownerMode === "existing" && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-white">Existing Owner</label>
                            <button
                              type="button"
                              onClick={() => void refresh()}
                              className="text-xs text-amber-400 underline-offset-2 hover:underline hover:text-amber-300"
                              disabled={ownersLoading}
                            >
                              {ownersLoading ? "Refreshing…" : "Refresh list"}
                            </button>
                          </div>

                          {ownersLoading ? (
                            <div className="flex items-center gap-2 rounded-xl border border-dashed border-amber-500/20 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-400">
                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                              Loading existing owners…
                            </div>
                          ) : ownersError ? (
                            <div className="flex items-center justify-between rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                              <span>Could not load owners: {ownersError}</span>
                              <button type="button" onClick={() => void refresh()} className="underline">
                                Retry
                              </button>
                            </div>
                          ) : ownerOptions.length === 0 ? (
                            <div className="flex flex-col gap-2 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 px-3 py-3 text-sm">
                              <span className="text-zinc-400">
                                No School Owners assigned yet. Create the first owner to populate this list.
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-fit border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                                onClick={() => setOwnerMode("new")}
                              >
                                <UserPlus className="mr-2 h-3.5 w-3.5" /> Create new owner instead
                              </Button>
                            </div>
                          ) : (
                            <>
                              <Select value={ownerUserId} onValueChange={setOwnerUserId}>
                                <SelectTrigger className="bg-zinc-900 border-amber-500/20 text-white focus:ring-amber-500/30">
                                  <SelectValue placeholder="Select an owner" />
                                </SelectTrigger>
                                <SelectContent>
                                  {ownerOptions.map((o) => (
                                    <SelectItem key={o.user_id} value={o.user_id}>
                                      {o.display_name} · {o.email}{" "}
                                      {o.school_count > 0 ? `(${o.school_count} school${o.school_count === 1 ? "" : "s"})` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-zinc-400">
                                {ownerOptions.length} owner{ownerOptions.length === 1 ? "" : "s"} available. Reassigning an
                                existing owner to this school is safe — duplicates are blocked at the database level.
                              </p>
                            </>
                          )}
                        </div>
                      )}

                      {ownerMode === "new" && (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-white">Owner Email</label>
                            <Input
                              className="bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 autofill:shadow-[0_0_0px_1000px_#18181b_inset]"
                              value={ownerEmail}
                              onChange={(e) => setOwnerEmail(e.target.value)}
                              placeholder="owner@school.com"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-white">Owner Password</label>
                            <Input
                              className="bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 autofill:shadow-[0_0_0px_1000px_#18181b_inset]"
                              value={ownerPassword}
                              onChange={(e) => setOwnerPassword(e.target.value)}
                              type="password"
                              placeholder="Minimum 8 characters"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-white">Owner Display Name</label>
                            <Input
                              className="bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 autofill:shadow-[0_0_0px_1000px_#18181b_inset]"
                              value={ownerDisplayName}
                              onChange={(e) => setOwnerDisplayName(e.target.value)}
                              placeholder="School Owner"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <Button
                      size="xl"
                      onClick={createSchoolDirect}
                      disabled={creatingSchool}
                      className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20 shadow-md shadow-amber-500/10"
                    >
                      Create school + principal{ownerMode !== "none" ? " + owner" : ""}
                    </Button>
                  </CardContent>
                </Card>

                <CampusCreatorCard schools={schools} onCreated={refresh} />
              </div>
            )}

            {/* access tab */}
            {activeTab === "access" && (
              <div className="space-y-6">
                <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                  <CardHeader>
                    <CardTitle className="font-display text-xl text-white">Impersonate (Audited)</CardTitle>
                    <p className="text-xs text-zinc-400">
                      Generates a one-time secure login link for a target user and redirects into their role panel.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">School</label>
                        <Select value={impSchoolId} onValueChange={setImpSchoolId}>
                          <SelectTrigger className="bg-zinc-900 border-amber-500/20 text-white focus:ring-amber-500/30">
                            <SelectValue placeholder="Select a school" />
                          </SelectTrigger>
                          <SelectContent>
                            {schools.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.slug} — {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">Role route</label>
                        <Select value={impRolePath} onValueChange={setImpRolePath}>
                          <SelectTrigger className="bg-zinc-900 border-amber-500/20 text-white focus:ring-amber-500/30">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            {[
                              "super_admin",
                              "principal",
                              "vice_principal",
                              "teacher",
                              "hr",
                              "accountant",
                              "marketing",
                              "student",
                              "parent",
                            ].map((r) => (
                              <SelectItem key={r} value={r}>
                                /{`{school}`}/{r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">Target user email</label>
                        <Input
                          className="bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 autofill:shadow-[0_0_0px_1000px_#18181b_inset]"
                          value={impEmail}
                          onChange={(e) => setImpEmail(e.target.value)}
                          placeholder="user@school.com"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white">Reason (required for audits in production)</label>
                      <Input
                        className="bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 autofill:shadow-[0_0_0px_1000px_#18181b_inset]"
                        value={impReason}
                        onChange={(e) => setImpReason(e.target.value)}
                        placeholder="Support ticket / investigation"
                      />
                    </div>

                    <Button
                      size="xl"
                      onClick={impersonate}
                      disabled={impBusy}
                      className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20 shadow-md shadow-amber-500/10"
                    >
                      Generate impersonation link
                    </Button>

                    {impLink && (
                      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                        <p className="text-sm font-medium text-amber-400">One-time login link</p>
                        <p className="mt-1 break-all text-xs text-zinc-300 font-mono">{impLink}</p>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <Button
                            variant="outline"
                            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                            onClick={async () => {
                              await navigator.clipboard.writeText(impLink);
                              toast.success("Copied");
                            }}
                          >
                            Copy link
                          </Button>
                          <Button
                            variant="outline"
                            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                            asChild
                          >
                            <a href={impLink} target="_blank" rel="noreferrer">
                              Open in new tab
                            </a>
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                  <CardHeader>
                    <CardTitle className="font-display text-xl text-white">Create Staff (Direct Password)</CardTitle>
                    <p className="text-xs text-zinc-400">Create any staff (e.g. Teacher) instantly with an explicit password.</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">School</label>
                        <Select value={staffSchoolId} onValueChange={setStaffSchoolId}>
                          <SelectTrigger className="bg-zinc-900 border-amber-500/20 text-white focus:ring-amber-500/30">
                            <SelectValue placeholder="Select a school" />
                          </SelectTrigger>
                          <SelectContent>
                            {schools.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.slug} — {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">Role</label>
                        <Select value={staffRole} onValueChange={setStaffRole}>
                          <SelectTrigger className="bg-zinc-900 border-amber-500/20 text-white focus:ring-amber-500/30">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            {[
                              "principal",
                              "vice_principal",
                              "academic_coordinator",
                              "teacher",
                              "accountant",
                              "hr_manager",
                              "counselor",
                              "marketing_staff",
                              "student",
                              "parent",
                            ].map((r) => (
                              <SelectItem key={r} value={r}>
                                {r.replace(/_/g, " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">Display Name</label>
                        <Input
                          className="bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 autofill:shadow-[0_0_0px_1000px_#18181b_inset]"
                          value={staffDisplayName}
                          onChange={(e) => setStaffDisplayName(e.target.value)}
                          placeholder="Optional"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">Email</label>
                        <Input
                          className="bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 autofill:shadow-[0_0_0px_1000px_#18181b_inset]"
                          value={staffEmail}
                          onChange={(e) => setStaffEmail(e.target.value)}
                          placeholder="teacher@school.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">Password</label>
                        <Input
                          className="bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 autofill:shadow-[0_0_0px_1000px_#18181b_inset]"
                          value={staffPassword}
                          onChange={(e) => setStaffPassword(e.target.value)}
                          type="password"
                          placeholder="Minimum 8 characters"
                        />
                      </div>
                    </div>

                    <Button
                      size="xl"
                      onClick={createStaffDirect}
                      disabled={creatingStaff}
                      className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20 shadow-md shadow-amber-500/10"
                    >
                      <UserPlus className="mr-2 h-4 w-4" /> Create user now
                    </Button>
                  </CardContent>
                </Card>

                <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                  <CardHeader>
                    <CardTitle className="font-display text-xl text-white">Bootstrap Lock</CardTitle>
                    <p className="text-xs text-zinc-400">Unlock a school’s bootstrap (for emergency re-bootstrap flows).</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Select value={unlockSchoolId} onValueChange={setUnlockSchoolId}>
                      <SelectTrigger className="bg-zinc-900 border-amber-500/20 text-white focus:ring-amber-500/30">
                        <SelectValue placeholder="Select a school" />
                      </SelectTrigger>
                      <SelectContent>
                        {schools.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.slug} — {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      onClick={unlockBootstrap}
                      disabled={unlocking}
                      className="w-full border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 transition-all font-semibold"
                    >
                      Unlock bootstrap
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* requests tab */}
            {activeTab === "requests" && (
              <PlatformRequestsCard schools={schools} />
            )}

            {/* audits tab */}
            {activeTab === "audits" && (
              <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                <CardHeader>
                  <CardTitle className="font-display text-xl text-white">Audit Logs</CardTitle>
                  <p className="text-xs text-zinc-400">Recent activity across the platform.</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Select value={auditSchoolId} onValueChange={setAuditSchoolId}>
                    <SelectTrigger className="bg-zinc-900 border-amber-500/20 text-white focus:ring-amber-500/30">
                      <SelectValue placeholder="Filter by school" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All schools</SelectItem>
                      {schools.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.slug}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="overflow-auto rounded-2xl border border-zinc-800 bg-zinc-950">
                    <Table>
                      <TableHeader className="bg-zinc-900/40">
                        <TableRow className="border-b border-zinc-900 hover:bg-transparent">
                          <TableHead className="text-zinc-400 font-semibold">Time</TableHead>
                          <TableHead className="text-zinc-400 font-semibold">School</TableHead>
                          <TableHead className="text-zinc-400 font-semibold">Action</TableHead>
                          <TableHead className="text-zinc-400 font-semibold">Entity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAudit.map((a) => {
                          const s = a.school_id ? schoolsById.get(a.school_id) : null;
                          return (
                            <TableRow key={a.id} className="border-b border-zinc-900/80 hover:bg-zinc-900/30">
                              <TableCell className="whitespace-nowrap text-xs text-zinc-400">
                                {new Date(a.created_at).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-sm text-zinc-300 font-medium">{s ? s.slug : "—"}</TableCell>
                              <TableCell className="font-semibold text-white">{a.action}</TableCell>
                              <TableCell className="text-sm text-zinc-400">
                                {(a.entity_type ?? "—") + (a.entity_id ? `:${a.entity_id}` : "")}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {filteredAudit.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-6 text-zinc-500">
                              No audit logs.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </SuperAdminShell>
  );
}

