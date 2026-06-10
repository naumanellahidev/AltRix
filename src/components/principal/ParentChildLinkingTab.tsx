import { useEffect, useState } from "react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Link2, Plus, Search, Trash2, UserCheck, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Guardian {
  id: string;
  student_id: string;
  user_id: string | null;
  full_name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  student_first_name?: string;
  student_last_name?: string;
}

interface StudentOption {
  id: string;
  first_name: string;
  last_name: string | null;
}

interface ParentUser {
  user_id: string;
  email: string;
  full_name: string;
}

interface Props {
  schoolId: string;
}

export function ParentChildLinkingTab({ schoolId }: Props) {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [parentUsers, setParentUsers] = useState<ParentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    student_id: "",
    full_name: "",
    relationship: "father",
    phone: "",
    email: "",
    user_id: "",
    is_primary: true,
  });

  useEffect(() => {
    loadData();
  }, [schoolId]);

  const loadData = async () => {
    setLoading(true);
    try {
      let guardianData: any[] = [];
      let studentData: any[] = [];
      let parentList: ParentUser[] = [];

      if (USE_FASTAPI) {
        const [guardiansRes, studentsRes, parentsRes] = await Promise.all([
          apiClient.get("/students/guardians"),
          apiClient.get("/students", { params: { page_size: 1000 } }),
          apiClient.get("/students/parents"),
        ]);

        guardianData = guardiansRes.data || [];
        studentData = studentsRes.data?.items || studentsRes.data || [];
        parentList = (parentsRes.data || []).map((p: any) => ({
          user_id: p.user_id,
          email: p.email || "",
          full_name: p.full_name || p.email || "Parent",
        }));
      } else {
        // Load guardians with student names
        const { data: gd } = await (supabase as any)
          .from("student_guardians")
          .select("*")
          .order("created_at", { ascending: false });

        // Load students
        const { data: sd } = await supabase
          .from("students")
          .select("id, first_name, last_name")
          .eq("school_id", schoolId)
          .order("first_name");

        // Load parent users from user_roles
        const { data: parentRoles } = await (supabase as any)
          .from("user_roles")
          .select("user_id")
          .eq("school_id", schoolId)
          .eq("role", "parent");

        guardianData = gd || [];
        studentData = sd || [];

        if (parentRoles && parentRoles.length > 0) {
          const parentUserIds = parentRoles.map((p: any) => p.user_id);
          const { data: profiles } = await (supabase as any)
            .from("profiles")
            .select("id, email, full_name")
            .in("id", parentUserIds);
          
          parentList = (profiles || []).map((p: any) => ({
            user_id: p.id,
            email: p.email || "",
            full_name: p.full_name || p.email || "Parent",
          }));
        }
      }

      const studentMap = new Map((studentData || []).map((s: any) => [s.id, s]));

      // Enrich guardians with student names
      const enriched = (guardianData || []).map((g: any) => {
        const student = studentMap.get(g.student_id) as StudentOption | undefined;
        return {
          ...g,
          student_first_name: student?.first_name || "Unknown",
          student_last_name: student?.last_name || "",
        };
      });

      setGuardians(enriched);
      setStudents(studentData || []);
      setParentUsers(parentList);
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.student_id || !form.full_name.trim()) {
      toast.error("Student and guardian name are required");
      return;
    }

    setSaving(true);
    if (USE_FASTAPI) {
      try {
        await apiClient.post("/students/guardians", {
          student_id: form.student_id,
          full_name: form.full_name.trim(),
          relationship: form.relationship || null,
          phone: form.phone || null,
          email: form.email || null,
          user_id: form.user_id || null,
          is_primary: form.is_primary,
        });
        toast.success("Guardian linked to student successfully!");
        setShowAdd(false);
        setForm({ student_id: "", full_name: "", relationship: "father", phone: "", email: "", user_id: "", is_primary: true });
        loadData();
      } catch (err: any) {
        toast.error(err?.response?.data?.detail || err.message || "Failed to link guardian");
      }
    } else {
      const { error } = await (supabase as any)
        .from("student_guardians")
        .insert({
          student_id: form.student_id,
          full_name: form.full_name.trim(),
          relationship: form.relationship || null,
          phone: form.phone || null,
          email: form.email || null,
          user_id: form.user_id || null,
          is_primary: form.is_primary,
          school_id: schoolId,
        });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Guardian linked to student successfully!");
        setShowAdd(false);
        setForm({ student_id: "", full_name: "", relationship: "father", phone: "", email: "", user_id: "", is_primary: true });
        loadData();
      }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (USE_FASTAPI) {
      try {
        await apiClient.delete(`/students/guardians/${id}`);
        toast.success("Guardian link removed");
        loadData();
      } catch (err: any) {
        toast.error(err.message || "Failed to remove guardian link");
      }
    } else {
      const { error } = await (supabase as any)
        .from("student_guardians")
        .delete()
        .eq("id", id);

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Guardian link removed");
        loadData();
      }
    }
  };

  const handleLinkUser = async (guardianId: string, userId: string) => {
    if (USE_FASTAPI) {
      try {
        await apiClient.patch(`/students/guardians/${guardianId}`, {
          user_id: userId,
        });
        toast.success("Parent account linked!");
        loadData();
      } catch (err: any) {
        toast.error(err.message || "Failed to link parent account");
      }
    } else {
      const { error } = await (supabase as any)
        .from("student_guardians")
        .update({ user_id: userId })
        .eq("id", guardianId);

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Parent account linked!");
        loadData();
      }
    }
  };

  const filtered = guardians.filter((g) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      g.full_name?.toLowerCase().includes(q) ||
      g.student_first_name?.toLowerCase().includes(q) ||
      g.student_last_name?.toLowerCase().includes(q) ||
      g.email?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Parent-Student Linking
              </CardTitle>
              <CardDescription>
                Link parent accounts to student profiles for synchronized access
              </CardDescription>
            </div>
            <Dialog open={showAdd} onOpenChange={setShowAdd}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" /> Link Parent
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Link Parent to Student</DialogTitle>
                  <DialogDescription>
                    Create a guardian record and optionally link to a parent user account
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Student *</Label>
                    <Select value={form.student_id} onValueChange={(v) => setForm((p) => ({ ...p, student_id: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select student" />
                      </SelectTrigger>
                      <SelectContent>
                        {students.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.first_name} {s.last_name || ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Guardian Full Name *</Label>
                    <Input
                      value={form.full_name}
                      onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                      placeholder="e.g., Ahmad Khan"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Relationship</Label>
                      <Select value={form.relationship} onValueChange={(v) => setForm((p) => ({ ...p, relationship: v }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="father">Father</SelectItem>
                          <SelectItem value="mother">Mother</SelectItem>
                          <SelectItem value="guardian">Guardian</SelectItem>
                          <SelectItem value="sibling">Sibling</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={form.phone}
                        onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="+92..."
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      placeholder="parent@email.com"
                    />
                  </div>

                  {parentUsers.length > 0 && (
                    <div className="space-y-2">
                      <Label>Link to Parent Account (optional)</Label>
                      <Select value={form.user_id} onValueChange={(v) => setForm((p) => ({ ...p, user_id: v }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select parent account" />
                        </SelectTrigger>
                        <SelectContent>
                          {parentUsers.map((p) => (
                            <SelectItem key={p.user_id} value={p.user_id}>
                              {p.full_name} ({p.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Link Parent"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by parent name, student, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Link2 className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No parent-student links found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Click "Link Parent" to connect a parent account to a student profile
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parent/Guardian</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Relationship</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.full_name}</TableCell>
                      <TableCell>{g.student_first_name} {g.student_last_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {g.relationship || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          {g.phone && <p>{g.phone}</p>}
                          {g.email && <p className="text-muted-foreground">{g.email}</p>}
                          {!g.phone && !g.email && <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {g.user_id ? (
                          <Badge className="bg-primary/10 text-primary border-primary/20">
                            <UserCheck className="h-3 w-3 mr-1" /> Linked
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Not linked</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(g.id)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
