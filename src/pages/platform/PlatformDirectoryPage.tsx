import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, LogOut, Search, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
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
        const query = supabase
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
        const query = (supabase as any)
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
        const query = supabase
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
        const query = supabase
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
    <SuperAdminShell title="Owners & Admins" subtitle="Search across schools, users, students and leads">
      <div className="space-y-4 text-zinc-100 bg-transparent rounded-xl p-1">
        <div className="-mx-1 -my-1 p-4">

        {!authz.loading && !authz.allowed && (
          <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardContent className="pt-6">
              <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-4 text-sm text-rose-400">{authz.message ?? "Access denied."}</div>
            </CardContent>
          </Card>
        )}

        {authz.allowed && (
          <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative flex-1 md:max-w-md">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                  <Input className="pl-9 bg-zinc-900 border-amber-500/15 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
                </div>
                <Button disabled={busy} onClick={runSearch} className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20 shadow-md">
                  Run search
                </Button>
              </div>

              <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                <TabsList className="w-full bg-zinc-900 border border-zinc-850 p-1">
                  <TabsTrigger value="schools" className="flex-1 text-zinc-400 data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-950 font-semibold">
                    Schools
                  </TabsTrigger>
                  <TabsTrigger value="users" className="flex-1 text-zinc-400 data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-950 font-semibold">
                    Users
                  </TabsTrigger>
                  <TabsTrigger value="students" className="flex-1 text-zinc-400 data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-950 font-semibold">
                    Students
                  </TabsTrigger>
                  <TabsTrigger value="leads" className="flex-1 text-zinc-400 data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-950 font-semibold">
                    Leads
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="schools" className="mt-4">
                  <div className="overflow-auto rounded-2xl border border-zinc-800 bg-black/40">
                    <Table>
                      <TableHeader className="border-b border-zinc-850">
                        <TableRow className="hover:bg-transparent border-b border-zinc-800">
                          <TableHead className="text-zinc-400 font-medium">School</TableHead>
                          <TableHead className="text-zinc-400 font-medium">Slug</TableHead>
                          <TableHead className="text-zinc-400 font-medium">Status</TableHead>
                          <TableHead className="text-right text-zinc-400 font-medium">Open</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {schools.map((s) => (
                          <TableRow key={s.id} className="hover:bg-zinc-900/20 border-b border-zinc-900">
                            <TableCell className="font-semibold text-white">{s.name}</TableCell>
                            <TableCell className="text-zinc-300">/{s.slug}</TableCell>
                            <TableCell className="text-zinc-300">{s.is_active ? "Active" : "Disabled"}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" asChild className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20 shadow-md">
                                <a href={`/${s.slug}/super_admin`}>
                                  <ExternalLink className="mr-2 h-4 w-4" /> Open
                                </a>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {schools.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-zinc-500 py-8">
                              No results.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="users" className="mt-4">
                  <div className="overflow-auto rounded-2xl border border-zinc-800 bg-black/40">
                    <Table>
                      <TableHeader className="border-b border-zinc-850">
                        <TableRow className="hover:bg-transparent border-b border-zinc-800">
                          <TableHead className="text-zinc-400 font-medium">Email</TableHead>
                          <TableHead className="text-zinc-400 font-medium">Name</TableHead>
                          <TableHead className="text-zinc-400 font-medium">School ID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((u) => (
                          <TableRow key={u.id} className="hover:bg-zinc-900/20 border-b border-zinc-900">
                            <TableCell className="font-semibold text-white">{u.email}</TableCell>
                            <TableCell className="text-zinc-300">{u.display_name ?? "—"}</TableCell>
                            <TableCell className="text-zinc-400 font-mono text-xs">{u.school_id}</TableCell>
                          </TableRow>
                        ))}
                        {users.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-zinc-500 py-8">
                              No results.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="students" className="mt-4">
                  <div className="overflow-auto rounded-2xl border border-zinc-800 bg-black/40">
                    <Table>
                      <TableHeader className="border-b border-zinc-850">
                        <TableRow className="hover:bg-transparent border-b border-zinc-800">
                          <TableHead className="text-zinc-400 font-medium">Name</TableHead>
                          <TableHead className="text-zinc-400 font-medium">Status</TableHead>
                          <TableHead className="text-zinc-400 font-medium">School ID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {students.map((s) => (
                          <TableRow key={s.id} className="hover:bg-zinc-900/20 border-b border-zinc-900">
                            <TableCell className="font-semibold text-white">{s.first_name} {s.last_name ?? ""}</TableCell>
                            <TableCell className="text-zinc-300">{s.status}</TableCell>
                            <TableCell className="text-zinc-400 font-mono text-xs">{s.school_id}</TableCell>
                          </TableRow>
                        ))}
                        {students.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-zinc-500 py-8">
                              No results.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="leads" className="mt-4">
                  <div className="overflow-auto rounded-2xl border border-zinc-800 bg-black/40">
                    <Table>
                      <TableHeader className="border-b border-zinc-850">
                        <TableRow className="hover:bg-transparent border-b border-zinc-800">
                          <TableHead className="text-zinc-400 font-medium">Name</TableHead>
                          <TableHead className="text-zinc-400 font-medium">Contact</TableHead>
                          <TableHead className="text-zinc-400 font-medium">Status</TableHead>
                          <TableHead className="text-zinc-400 font-medium">School ID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {leads.map((l) => (
                          <TableRow key={l.id} className="hover:bg-zinc-900/20 border-b border-zinc-900">
                            <TableCell className="font-semibold text-white">{l.full_name}</TableCell>
                            <TableCell className="text-zinc-300">{l.email ?? l.phone ?? "—"}</TableCell>
                            <TableCell className="text-zinc-300">{l.status}</TableCell>
                            <TableCell className="text-zinc-400 font-mono text-xs">{l.school_id}</TableCell>
                          </TableRow>
                        ))}
                        {leads.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-zinc-500 py-8">
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

