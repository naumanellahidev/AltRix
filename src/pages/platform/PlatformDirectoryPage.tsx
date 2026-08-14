import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, LogOut, Search, ShieldCheck } from "lucide-react";

import { api } from "@/lib/api";
import { useSession } from "@/hooks/useSession";
import { usePlatformSuperAdmin } from "@/hooks/usePlatformSuperAdmin";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";

type SchoolRow = { id: string; slug: string; name: string; is_active: boolean; created_at: string };
type StudentRow = { id: string; school_id: string; first_name: string; last_name: string | null; status: string; created_at: string };
type LeadRow = { id: string; school_id: string; full_name: string; email: string | null; phone: string | null; status: string; created_at: string };
type DirRow = { id: string; school_id: string; email: string; display_name: string | null; user_id: string; created_at: string };

 import { Navigate } from "react-router-dom";
 
 export default function PlatformDirectoryPage() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const authz = usePlatformSuperAdmin(user?.id);

  const [tab, setTab] = useState<"schools" | "users" | "students" | "leads">("schools");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [users, setUsers] = useState<DirRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);

  const needle = useMemo(() => q.trim(), [q]);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/auth", { replace: true });
  }, [loading, user, navigate]);

  const runSearch = async () => {
    if (!user || !authz.allowed) return;
    setBusy(true);
    try {
      if (tab === "schools") {
        const query = api
          .from("schools")
          .select("id,slug,name,is_active,created_at")
          .order("created_at", { ascending: false })
          .limit(100);

        const { data } = needle
          ? await query.or(`name.ilike.%${needle}%,slug.ilike.%${needle}%`)
          : await query;
        setSchools((data ?? []) as SchoolRow[]);
      }

      if (tab === "users") {
        const query = (api as any)
          .from("school_user_directory")
          .select("id,school_id,email,display_name,user_id,created_at")
          .order("created_at", { ascending: false })
          .limit(100);

        const { data } = needle
          ? await query.or(`email.ilike.%${needle}%,display_name.ilike.%${needle}%`)
          : await query;
        setUsers((data ?? []) as unknown as DirRow[]);
      }

      if (tab === "students") {
        const query = api
          .from("students")
          .select("id,school_id,first_name,last_name,status,created_at")
          .order("created_at", { ascending: false })
          .limit(100);

        const { data } = needle
          ? await query.or(`first_name.ilike.%${needle}%,last_name.ilike.%${needle}%,status.ilike.%${needle}%`)
          : await query;
        setStudents((data ?? []) as StudentRow[]);
      }

      if (tab === "leads") {
        const query = api
          .from("crm_leads")
          .select("id,school_id,full_name,email,phone,status,created_at")
          .order("created_at", { ascending: false })
          .limit(100);

        const { data } = needle
          ? await query.or(`full_name.ilike.%${needle}%,email.ilike.%${needle}%,phone.ilike.%${needle}%,status.ilike.%${needle}%`)
          : await query;
        setLeads((data ?? []) as LeadRow[]);
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (authz.loading) return;
    if (!authz.allowed) return;
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, authz.loading, authz.allowed, user?.id]);

  if (loading) {
    return null;
  }
  
  if (!authz.loading && !authz.allowed) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <SuperAdminShell title="03. Global User Matrix & Identity Center" subtitle="Cross-tenant search across students, parents, teachers, HR staff, and school owners">
      <div className="space-y-4 text-slate-900 bg-transparent rounded-xl p-1">
        <div className="-mx-1 -my-1 p-4">

        {!authz.loading && !authz.allowed && (
          <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardContent className="pt-6">
              <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-4 text-sm text-rose-400">{authz.message ?? "Access denied."}</div>
            </CardContent>
          </Card>
        )}

        {authz.allowed && (
          <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative flex-1 md:max-w-md">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input className="pl-9 bg-slate-50 border-amber-500/15 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500/30" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
                </div>
                <Button disabled={busy} onClick={runSearch} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-zinc-950 font-bold border border-0 shadow-md">
                  Run search
                </Button>
              </div>

              <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                <TabsList className="w-full bg-slate-50 border border-zinc-850 p-1">
                  <TabsTrigger value="schools" className="flex-1 text-slate-500 data-[state=active]:bg-blue-600 data-[state=active]:text-zinc-950 font-semibold">
                    Schools
                  </TabsTrigger>
                  <TabsTrigger value="users" className="flex-1 text-slate-500 data-[state=active]:bg-blue-600 data-[state=active]:text-zinc-950 font-semibold">
                    Users
                  </TabsTrigger>
                  <TabsTrigger value="students" className="flex-1 text-slate-500 data-[state=active]:bg-blue-600 data-[state=active]:text-zinc-950 font-semibold">
                    Students
                  </TabsTrigger>
                  <TabsTrigger value="leads" className="flex-1 text-slate-500 data-[state=active]:bg-blue-600 data-[state=active]:text-zinc-950 font-semibold">
                    Leads
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="schools" className="mt-4">
                  <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
                    <Table>
                      <TableHeader className="border-b border-zinc-850">
                        <TableRow className="hover:bg-transparent border-b border-slate-200">
                          <TableHead className="text-slate-500 font-medium">School</TableHead>
                          <TableHead className="text-slate-500 font-medium">Slug</TableHead>
                          <TableHead className="text-slate-500 font-medium">Status</TableHead>
                          <TableHead className="text-right text-slate-500 font-medium">Open</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {schools.map((s) => (
                          <TableRow key={s.id} className="hover:bg-slate-50/20 border-b border-slate-200">
                            <TableCell className="font-semibold text-slate-900">{s.name}</TableCell>
                            <TableCell className="text-slate-700">/{s.slug}</TableCell>
                            <TableCell className="text-slate-700">{s.is_active ? "Active" : "Disabled"}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" asChild className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-zinc-950 font-bold border border-0 shadow-md">
                                <a href={`/${s.slug}/super_admin`}>
                                  <ExternalLink className="mr-2 h-4 w-4" /> Open
                                </a>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {schools.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-slate-400 py-8">
                              No results.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="users" className="mt-4">
                  <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
                    <Table>
                      <TableHeader className="border-b border-zinc-850">
                        <TableRow className="hover:bg-transparent border-b border-slate-200">
                          <TableHead className="text-slate-500 font-medium">Email</TableHead>
                          <TableHead className="text-slate-500 font-medium">Name</TableHead>
                          <TableHead className="text-slate-500 font-medium">School ID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((u) => (
                          <TableRow key={u.id} className="hover:bg-slate-50/20 border-b border-slate-200">
                            <TableCell className="font-semibold text-slate-900">{u.email}</TableCell>
                            <TableCell className="text-slate-700">{u.display_name ?? "—"}</TableCell>
                            <TableCell className="text-slate-500 font-mono text-xs">{u.school_id}</TableCell>
                          </TableRow>
                        ))}
                        {users.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-slate-400 py-8">
                              No results.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="students" className="mt-4">
                  <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
                    <Table>
                      <TableHeader className="border-b border-zinc-850">
                        <TableRow className="hover:bg-transparent border-b border-slate-200">
                          <TableHead className="text-slate-500 font-medium">Name</TableHead>
                          <TableHead className="text-slate-500 font-medium">Status</TableHead>
                          <TableHead className="text-slate-500 font-medium">School ID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {students.map((s) => (
                          <TableRow key={s.id} className="hover:bg-slate-50/20 border-b border-slate-200">
                            <TableCell className="font-semibold text-slate-900">{s.first_name} {s.last_name ?? ""}</TableCell>
                            <TableCell className="text-slate-700">{s.status}</TableCell>
                            <TableCell className="text-slate-500 font-mono text-xs">{s.school_id}</TableCell>
                          </TableRow>
                        ))}
                        {students.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-slate-400 py-8">
                              No results.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="leads" className="mt-4">
                  <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
                    <Table>
                      <TableHeader className="border-b border-zinc-850">
                        <TableRow className="hover:bg-transparent border-b border-slate-200">
                          <TableHead className="text-slate-500 font-medium">Name</TableHead>
                          <TableHead className="text-slate-500 font-medium">Contact</TableHead>
                          <TableHead className="text-slate-500 font-medium">Status</TableHead>
                          <TableHead className="text-slate-500 font-medium">School ID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {leads.map((l) => (
                          <TableRow key={l.id} className="hover:bg-slate-50/20 border-b border-slate-200">
                            <TableCell className="font-semibold text-slate-900">{l.full_name}</TableCell>
                            <TableCell className="text-slate-700">{l.email ?? l.phone ?? "—"}</TableCell>
                            <TableCell className="text-slate-700">{l.status}</TableCell>
                            <TableCell className="text-slate-500 font-mono text-xs">{l.school_id}</TableCell>
                          </TableRow>
                        ))}
                        {leads.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-slate-400 py-8">
                              No results.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
        </div>
      </div>
    </SuperAdminShell>
  );
}

