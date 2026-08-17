import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Download,
  FileUp,
  KeyRound,
  Mail,
  Trash2,
  UserMinus,
  UserPlus,
  Phone,
  Pencil,
  UserCog,
  Search,
  X,
  Users,
  GraduationCap,
  Building2,
  Shield,
  Briefcase,
  CheckCircle2,
  Filter,
} from "lucide-react";
import { StaffProfileDialog } from "@/components/hr/StaffProfileDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { api } from "@/lib/api";
import { useTenant } from "@/hooks/useTenant";
import { useSession } from "@/hooks/useSession";
import { EDUVERSE_ROLES, roleLabel, type EduverseRole } from "@/lib/eduverse-roles";
import { parseCsv, toCsv } from "@/lib/csv";
import { useSchoolPermissions } from "@/hooks/useSchoolPermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type DirectoryRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  phone: string | null;
};

type BulkRow = {
  rowNumber: number;
  email: string;
  roles: string[];
  password: string;
  displayName?: string;
  phone?: string;
};

type BulkResult = {
  rowNumber: number;
  email: string;
  ok: boolean;
  errors: string[];
  normalizedRoles: string[];
  userId?: string;
};

const STAFF_ROLES: EduverseRole[] = [
  "teacher",
  "principal",
  "vice_principal",
  "accountant",
  "academic_coordinator",
  "counselor",
  "hr_manager",
  "school_admin",
  "librarian",
  "transport_manager",
  "receptionist",
  "security_guard",
  "staff",
  "admin",
  "school_owner",
];

const STUDENT_PARENT_ROLES: EduverseRole[] = ["student", "parent"];

export function UsersModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const { user } = useSession();

  const schoolId = useMemo(
    () => (tenant.status === "ready" ? tenant.schoolId : null),
    [tenant.status, tenant.schoolId]
  );
  const perms = useSchoolPermissions(schoolId);

  // Form states
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<EduverseRole>("teacher");
  const [busy, setBusy] = useState(false);
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);

  // Search & Filter states
  const [activeTab, setActiveTab] = useState<"staff" | "students_parents" | "all">("staff");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("all");
  const [selectedCampusFilter, setSelectedCampusFilter] = useState<string>("all");

  // Bulk import
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkResults, setBulkResults] = useState<BulkResult[] | null>(null);
  const [bulkLinksCsv, setBulkLinksCsv] = useState<string | null>(null);

  // Directory & Roles
  const [directory, setDirectory] = useState<DirectoryRow[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Record<string, EduverseRole[]>>({});
  const [campusByUser, setCampusByUser] = useState<Record<string, { id: string; name: string }>>({});
  const [campuses, setCampuses] = useState<{ id: string; name: string }[]>([]);

  const [govReason, setGovReason] = useState<string>("");
  const [profileDialogUserId, setProfileDialogUserId] = useState<string | null>(null);

  const refresh = async () => {
    if (!schoolId) return;

    // 1. Fetch directory data
    const { data: dir } = await api.rpc("get_school_user_directory", { _school_id: schoolId });

    // Filter out super master admin details
    const filteredDir = (dir ?? []).filter(
      (d: any) => d.email?.toLowerCase() !== "naumancheema643@gmail.com"
    );

    // 2. Fetch profiles phone numbers
    const userIds = filteredDir.map((d: any) => d.user_id);
    const { data: profiles } =
      userIds.length > 0
        ? await api.from("profiles").select("id, phone").in("id", userIds)
        : { data: [] };

    const phoneByUser: Record<string, string | null> = {};
    (profiles ?? []).forEach((p: any) => {
      phoneByUser[p.id] = p.phone;
    });

    setDirectory(
      [...filteredDir]
        .sort((a: any, b: any) => (a.email ?? "").localeCompare(b.email ?? ""))
        .map((d: any) => ({
          ...d,
          phone: phoneByUser[d.user_id] ?? null,
        })) as DirectoryRow[]
    );

    // 3. Fetch user roles & campus assignments
    const [rolesRes, campusesRes] = await Promise.all([
      api.from("user_roles").select("user_id, role, campus_id, campuses(name)").eq("school_id", schoolId),
      api.from("campuses").select("id, name").eq("school_id", schoolId).order("name"),
    ]);

    const nextRoles: Record<string, EduverseRole[]> = {};
    const nextCampusMap: Record<string, { id: string; name: string }> = {};

    (rolesRes.data ?? []).forEach((r: any) => {
      const key = r.user_id as string;
      const val = r.role as EduverseRole;
      nextRoles[key] = nextRoles[key] ? [...nextRoles[key], val] : [val];
      if (r.campus_id && r.campuses) {
        nextCampusMap[key] = { id: r.campus_id, name: r.campuses.name };
      }
    });

    setRolesByUser(nextRoles);
    setCampusByUser(nextCampusMap);
    setCampuses(campusesRes.data || []);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const allowedRoles = useMemo((): EduverseRole[] => {
    const base = EDUVERSE_ROLES.filter((r): r is EduverseRole => r !== "super_admin");
    if (perms.isPlatformSuperAdmin || perms.canManageStaff) return base;
    return base.filter((r) => r === "student" || r === "parent");
  }, [perms.canManageStaff, perms.isPlatformSuperAdmin]);

  const invite = async () => {
    if (!tenant.slug) return;
    if (!email.trim()) return toast.error("Email is required");
    if (password.trim().length < 8) return toast.error("Password must be at least 8 characters");

    if (!allowedRoles.includes(role)) {
      return toast.error("Not allowed: principals/VP create staff; teachers can create students/parents.");
    }

    setBusy(true);
    setCreatedUserId(null);
    try {
      const { data, error } = await api.functions.invoke("eduverse-invite", {
        body: {
          schoolSlug: tenant.slug,
          email: email.trim().toLowerCase(),
          password,
          role,
          displayName: displayName.trim() || undefined,
        },
      });
      if (error) {
        const raw = (error as any)?.context?.body;
        let detail: string | null = null;
        if (typeof raw === "string") {
          try {
            const parsed = JSON.parse(raw);
            detail = parsed?.error ? String(parsed.error) : null;
          } catch {
            detail = null;
          }
        }
        return toast.error(detail ?? error.message);
      }

      setCreatedUserId((data as any)?.userId ?? null);

      if (schoolId && user?.id) {
        await api.from("audit_logs").insert({
          school_id: schoolId,
          actor_user_id: user.id,
          action: "staff_invited",
          resource_type: "user",
          entity_type: "user",
          resource_id: (data as any)?.userId ?? null,
          entity_id: (data as any)?.userId ?? null,
          metadata: { email: email.trim().toLowerCase(), role },
        });
      }

      toast.success("User created successfully!");
      setEmail("");
      setDisplayName("");
      setPassword("");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const canGovernStaff = perms.isPlatformSuperAdmin || perms.canManageStaff;

  const governanceInvoke = async (body: any) => {
    const { data, error } = await api.functions.invoke("eduverse-staff-governance", { body });
    if (error) {
      const raw = (error as any)?.context?.body;
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          throw new Error(parsed?.error ? String(parsed.error) : error.message);
        } catch {
          throw new Error(error.message);
        }
      }
      throw new Error(error.message);
    }
    return data as any;
  };

  const bulkInvoke = async (body: any) => {
    const { data, error } = await api.functions.invoke("eduverse-bulk-staff-import", { body });
    if (error) {
      const raw = (error as any)?.context?.body;
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          throw new Error(parsed?.error ? String(parsed.error) : error.message);
        } catch {
          throw new Error(error.message);
        }
      }
      throw new Error(error.message);
    }
    return data as any;
  };

  const downloadTextFile = (filename: string, contents: string, mime = "text/plain") => {
    const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const parseBulkCsvFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) return [] as BulkRow[];

    const rows: BulkRow[] = parsed.map((r, idx) => {
      const email = (r["email"] ?? "").trim().toLowerCase();
      const password = (r["password"] ?? "").toString().trim();
      const roleCell = (r["role"] ?? r["roles"] ?? "").trim();
      const roles = roleCell
        .split(/[;,]/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
      const displayName = (r["display_name"] ?? r["displayname"] ?? r["name"] ?? "").trim();
      const phone = (r["phone"] ?? r["mobile"] ?? "").trim();

      return {
        rowNumber: idx + 2,
        email,
        roles,
        password,
        displayName: displayName || undefined,
        phone: phone || undefined,
      };
    });

    return rows;
  };

  // User Categorization
  const userCategories = useMemo(() => {
    const staffList: DirectoryRow[] = [];
    const studentsParentsList: DirectoryRow[] = [];
    const allList = directory;

    directory.forEach((row) => {
      const userRoles = rolesByUser[row.user_id] ?? [];
      const isStaffUser = userRoles.some((r) => STAFF_ROLES.includes(r));
      const isStudentParent = userRoles.some((r) => STUDENT_PARENT_ROLES.includes(r));

      if (isStaffUser) {
        staffList.push(row);
      } else if (isStudentParent) {
        studentsParentsList.push(row);
      } else {
        // If no explicit role, classify as staff if they are in staff directory
        staffList.push(row);
      }
    });

    return {
      staff: staffList,
      students_parents: studentsParentsList,
      all: allList,
    };
  }, [directory, rolesByUser]);

  // Filtered List based on Active Tab, Search, Role, and Campus
  const filteredUsers = useMemo(() => {
    const list = userCategories[activeTab] || userCategories.all;
    const q = searchQuery.trim().toLowerCase();

    return list.filter((row) => {
      // 1. Search Query Filter
      if (q) {
        const emailMatch = (row.email ?? "").toLowerCase().includes(q);
        const nameMatch = (row.display_name ?? "").toLowerCase().includes(q);
        const phoneMatch = (row.phone ?? "").toLowerCase().includes(q);
        const roleMatch = (rolesByUser[row.user_id] ?? []).some(
          (r) => (roleLabel[r] ?? r).toLowerCase().includes(q) || r.toLowerCase().includes(q)
        );
        const campusMatch = (campusByUser[row.user_id]?.name ?? "").toLowerCase().includes(q);
        if (!emailMatch && !nameMatch && !phoneMatch && !roleMatch && !campusMatch) {
          return false;
        }
      }

      // 2. Specific Role Filter
      if (selectedRoleFilter !== "all") {
        const userRoles = rolesByUser[row.user_id] ?? [];
        if (!userRoles.includes(selectedRoleFilter as EduverseRole)) {
          return false;
        }
      }

      // 3. Campus Filter
      if (selectedCampusFilter !== "all") {
        const userCampus = campusByUser[row.user_id];
        if (userCampus?.id !== selectedCampusFilter) {
          return false;
        }
      }

      return true;
    });
  }, [userCategories, activeTab, searchQuery, selectedRoleFilter, selectedCampusFilter, rolesByUser, campusByUser]);

  const activeRolesInCurrentTab = useMemo(() => {
    const list = userCategories[activeTab] || userCategories.all;
    const roleSet = new Set<EduverseRole>();
    list.forEach((row) => {
      (rolesByUser[row.user_id] ?? []).forEach((r) => roleSet.add(r));
    });
    return Array.from(roleSet);
  }, [userCategories, activeTab, rolesByUser]);

  return (
    <div className="space-y-6">
      {/* Header & Quick Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card
          onClick={() => {
            setActiveTab("staff");
            setSelectedRoleFilter("all");
          }}
          className={`cursor-pointer transition-all duration-200 border ${
            activeTab === "staff"
              ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary"
              : "hover:border-primary/40 hover:bg-surface-elevated/40"
          }`}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Staff Members</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
                  {userCategories.staff.length}
                </span>
                <span className="text-xs text-muted-foreground">Excludes Students & Parents</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <Briefcase className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card
          onClick={() => {
            setActiveTab("students_parents");
            setSelectedRoleFilter("all");
          }}
          className={`cursor-pointer transition-all duration-200 border ${
            activeTab === "students_parents"
              ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary"
              : "hover:border-primary/40 hover:bg-surface-elevated/40"
          }`}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Students & Parents</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
                  {userCategories.students_parents.length}
                </span>
                <span className="text-xs text-muted-foreground">Portal Accounts</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-2xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
              <GraduationCap className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card
          onClick={() => {
            setActiveTab("all");
            setSelectedRoleFilter("all");
          }}
          className={`cursor-pointer transition-all duration-200 border ${
            activeTab === "all"
              ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary"
              : "hover:border-primary/40 hover:bg-surface-elevated/40"
          }`}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">All Registered Users</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
                  {userCategories.all.length}
                </span>
                <span className="text-xs text-muted-foreground">Total Accounts</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Management Card */}
      <Card className="shadow-elevated border-muted/50">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="font-display text-xl flex items-center gap-2">
                <UserCog className="h-5 w-5 text-primary" />
                Staff & Users Directory
              </CardTitle>
              <CardDescription>
                Live search, role assignment, password management, and campus isolation
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="px-3 py-1 font-mono text-xs">
                {filteredUsers.length} of {userCategories[activeTab].length} Shown
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Tabs, Search & Filters Bar */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b pb-4">
            {/* Category Tabs */}
            <Tabs
              value={activeTab}
              onValueChange={(v) => {
                setActiveTab(v as any);
                setSelectedRoleFilter("all");
              }}
              className="w-full lg:w-auto"
            >
              <TabsList className="grid grid-cols-3 w-full lg:w-auto">
                <TabsTrigger value="staff" className="gap-2">
                  <Briefcase className="h-4 w-4" />
                  <span>Staff ({userCategories.staff.length})</span>
                </TabsTrigger>
                <TabsTrigger value="students_parents" className="gap-2">
                  <GraduationCap className="h-4 w-4" />
                  <span>Students & Parents ({userCategories.students_parents.length})</span>
                </TabsTrigger>
                <TabsTrigger value="all" className="gap-2">
                  <Users className="h-4 w-4" />
                  <span>All ({userCategories.all.length})</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Search Input & Dropdown Filters */}
            <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
              <div className="relative flex-1 sm:w-72 lg:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, email, phone, role..."
                  className="pl-9 pr-8 h-9 text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Role Filter Dropdown */}
              <Select value={selectedRoleFilter} onValueChange={setSelectedRoleFilter}>
                <SelectTrigger className="h-9 w-36 text-xs">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {activeRolesInCurrentTab.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabel[r] ?? r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Campus Filter Dropdown (if multiple campuses exist) */}
              {campuses.length > 1 && (
                <Select value={selectedCampusFilter} onValueChange={setSelectedCampusFilter}>
                  <SelectTrigger className="h-9 w-40 text-xs">
                    <SelectValue placeholder="All Campuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Campuses</SelectItem>
                    {campuses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Directory Table */}
          <div className="overflow-hidden rounded-2xl border bg-surface">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[300px]">User</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((r) => {
                  const userRoles = rolesByUser[r.user_id] ?? [];
                  const userCampus = campusByUser[r.user_id];
                  const isStaffUser = userRoles.some((role) => STAFF_ROLES.includes(role));

                  return (
                    <TableRow key={r.user_id} className="hover:bg-muted/20">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-9 w-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                              isStaffUser
                                ? "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                                : "bg-purple-500/10 text-purple-600 border border-purple-500/20"
                            }`}
                          >
                            {(r.display_name || r.email || "?").charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate">
                              {r.display_name || "—"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate font-mono">{r.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.phone ? (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground/70" />
                            {r.phone}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {userCampus ? (
                          <Badge variant="outline" className="bg-background text-xs font-medium gap-1">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            {userCampus.name}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">School-wide</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {userRoles.length > 0 ? (
                            userRoles.map((x) => (
                              <Badge
                                key={x}
                                variant={
                                  x === "principal" || x === "school_owner" || x === "super_admin"
                                    ? "default"
                                    : x === "teacher"
                                    ? "secondary"
                                    : STUDENT_PARENT_ROLES.includes(x)
                                    ? "outline"
                                    : "secondary"
                                }
                                className="text-[11px] font-medium"
                              >
                                {roleLabel[x] ?? x}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {canGovernStaff && (
                          <div className="flex items-center justify-end gap-1">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  disabled={busy}
                                  aria-label="Manage user"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel className="truncate">{r.email}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => setProfileDialogUserId(r.user_id)}>
                                  <Pencil className="mr-2 h-4 w-4" /> Edit Profile
                                </DropdownMenuItem>
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger>
                                    <UserCog className="mr-2 h-4 w-4" /> Set Role
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    {allowedRoles.map((x) => (
                                      <DropdownMenuItem
                                        key={x}
                                        onSelect={async () => {
                                          try {
                                            setBusy(true);
                                            await governanceInvoke({
                                              action: "set_roles",
                                              schoolSlug: tenant.slug,
                                              targetUserId: r.user_id,
                                              roles: [x],
                                              reason: govReason.trim() || undefined,
                                            });
                                            toast.success(`Role updated to ${roleLabel[x]}`);
                                            await refresh();
                                          } catch (e) {
                                            toast.error((e as Error).message);
                                          } finally {
                                            setBusy(false);
                                          }
                                        }}
                                      >
                                        {roleLabel[x]}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuItem
                                  onSelect={async () => {
                                    const next = window.prompt("Set a new password for this user (min 8 chars):");
                                    if (!next) return;
                                    if (next.trim().length < 8) return toast.error("Password must be at least 8 characters");
                                    try {
                                      setBusy(true);
                                      await governanceInvoke({
                                        action: "set_password",
                                        schoolSlug: tenant.slug,
                                        targetUserId: r.user_id,
                                        password: next.trim(),
                                        reason: govReason.trim() || undefined,
                                      });
                                      toast.success("Password updated successfully");
                                    } catch (e) {
                                      toast.error((e as Error).message);
                                    } finally {
                                      setBusy(false);
                                    }
                                  }}
                                >
                                  <KeyRound className="mr-2 h-4 w-4" /> Set Password
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={async () => {
                                    const next = window.prompt(`Update email for ${r.email}:`, r.email);
                                    if (!next) return;
                                    const trimmed = next.trim().toLowerCase();
                                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
                                      return toast.error("Invalid email address");
                                    }
                                    if (trimmed === r.email.toLowerCase()) return;
                                    try {
                                      setBusy(true);
                                      await governanceInvoke({
                                        action: "set_email",
                                        schoolSlug: tenant.slug,
                                        targetUserId: r.user_id,
                                        email: trimmed,
                                        reason: govReason.trim() || undefined,
                                      });
                                      toast.success("Email updated");
                                      await refresh();
                                    } catch (e) {
                                      toast.error((e as Error).message);
                                    } finally {
                                      setBusy(false);
                                    }
                                  }}
                                >
                                  <Mail className="mr-2 h-4 w-4" /> Set Email
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={async () => {
                                    try {
                                      setBusy(true);
                                      await governanceInvoke({
                                        action: "deactivate",
                                        schoolSlug: tenant.slug,
                                        targetUserId: r.user_id,
                                        reason: govReason.trim() || undefined,
                                      });
                                      toast.success("User deactivated (roles removed)");
                                      await refresh();
                                    } catch (e) {
                                      toast.error((e as Error).message);
                                    } finally {
                                      setBusy(false);
                                    }
                                  }}
                                >
                                  <UserMinus className="mr-2 h-4 w-4" /> Deactivate
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={async () => {
                                    const confirmed = window.confirm(
                                      `Delete user ${r.email}? This will remove all their roles and data from this school. This cannot be undone.`
                                    );
                                    if (!confirmed) return;
                                    try {
                                      setBusy(true);
                                      await governanceInvoke({
                                        action: "deactivate",
                                        schoolSlug: tenant.slug,
                                        targetUserId: r.user_id,
                                        reason: govReason.trim() || "User deleted by admin",
                                      });
                                      await api
                                        .from("user_roles")
                                        .delete()
                                        .eq("school_id", schoolId!)
                                        .eq("user_id", r.user_id);
                                      toast.success("User removed from school");
                                      await refresh();
                                    } catch (e) {
                                      toast.error((e as Error).message);
                                    } finally {
                                      setBusy(false);
                                    }
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>

                            <StaffProfileDialog
                              userId={r.user_id}
                              email={r.email}
                              displayName={r.display_name}
                              onUpdated={refresh}
                              hideTrigger
                              open={profileDialogUserId === r.user_id}
                              onOpenChange={(o) => setProfileDialogUserId(o ? r.user_id : null)}
                            />
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}

                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Users className="h-8 w-8 text-muted-foreground/40" />
                        <p className="font-medium text-sm">No users found matching your criteria</p>
                        {searchQuery && (
                          <Button variant="outline" size="sm" onClick={() => setSearchQuery("")} className="mt-1">
                            Clear Search
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* User Creation & Bulk Import Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Create Single User */}
        <Card className="shadow-elevated border-muted/50">
          <CardHeader>
            <CardTitle className="font-display text-lg flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Create User Account
            </CardTitle>
            <CardDescription>Direct credential creation with explicit password</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@school.com"
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Display Name</label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Full Name (e.g. John Doe)"
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role</label>
                <Select value={role} onValueChange={(v) => setRole(v as EduverseRole)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedRoles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {roleLabel[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Initial Password</label>
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="Minimum 8 characters"
                  className="mt-1"
                />
              </div>
            </div>

            <Button variant="hero" size="lg" onClick={invite} disabled={busy} className="w-full mt-2">
              <UserPlus className="mr-2 h-4 w-4" /> Create User & Set Password
            </Button>
          </CardContent>
        </Card>

        {/* Bulk Import */}
        {canGovernStaff && (
          <Card className="shadow-elevated border-muted/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-display text-lg flex items-center gap-2">
                    <FileUp className="h-5 w-5 text-primary" /> Bulk CSV Import
                  </CardTitle>
                  <CardDescription>Batch upload staff or users with initial passwords</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const sample = toCsv([
                      {
                        email: "teacher1@school.com",
                        password: "Teacher@123",
                        role: "teacher",
                        display_name: "Teacher One",
                        phone: "+92 300 1234567",
                      },
                      {
                        email: "vp@school.com",
                        password: "Vp@123456",
                        role: "vice_principal;academic_coordinator",
                        display_name: "VP",
                        phone: "",
                      },
                    ]);
                    downloadTextFile("staff-import-template.csv", sample, "text/csv");
                  }}
                >
                  <Download className="mr-2 h-4 w-4" /> Template
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select CSV File</label>
                  <Input
                    type="file"
                    accept=".csv,text/csv"
                    className="mt-1"
                    onChange={async (e) => {
                      const file = e.target.files?.[0] ?? null;
                      setBulkLinksCsv(null);
                      setBulkResults(null);
                      if (!file) {
                        setBulkRows([]);
                        return;
                      }
                      try {
                        const rows = await parseBulkCsvFile(file);
                        setBulkRows(rows);
                        toast.success(`Loaded ${rows.length} rows`);
                      } catch (err) {
                        setBulkRows([]);
                        toast.error((err as Error).message);
                      }
                    }}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Columns: <span className="font-medium text-foreground">email, password, role</span>, optional{" "}
                    <span className="font-medium text-foreground">display_name, phone</span>.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Audit Reason (Optional)</label>
                  <Input
                    value={govReason}
                    onChange={(e) => setGovReason(e.target.value)}
                    placeholder="e.g. Onboarding batch 2026"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  disabled={busy || bulkRows.length === 0 || !tenant.slug}
                  onClick={async () => {
                    try {
                      setBusy(true);
                      setBulkLinksCsv(null);
                      const res = await bulkInvoke({
                        mode: "dry_run",
                        schoolSlug: tenant.slug,
                        rows: bulkRows,
                        reason: govReason.trim() || undefined,
                      });
                      setBulkResults((res?.results ?? []) as BulkResult[]);
                      const ok = !!res?.ok;
                      toast[ok ? "success" : "error"](ok ? "Dry-run OK" : "Dry-run has errors");
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="flex-1"
                >
                  <FileUp className="mr-2 h-4 w-4" /> Dry-Run Validate
                </Button>

                <Button
                  variant="hero"
                  disabled={
                    busy ||
                    bulkRows.length === 0 ||
                    !bulkResults ||
                    bulkResults.some((r) => !r.ok) ||
                    !tenant.slug
                  }
                  onClick={async () => {
                    try {
                      setBusy(true);
                      const res = await bulkInvoke({
                        mode: "commit",
                        schoolSlug: tenant.slug,
                        rows: bulkRows,
                        reason: govReason.trim() || undefined,
                      });
                      const results = (res?.results ?? []) as BulkResult[];
                      setBulkResults(results);
                      toast.success("Import committed successfully!");
                      await refresh();
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="flex-1"
                >
                  Commit Import
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
