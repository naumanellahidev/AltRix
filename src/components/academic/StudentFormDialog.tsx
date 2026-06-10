import { useEffect, useMemo, useState } from "react";
import { Loader2, Upload, UserPlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface SectionOption {
  id: string;
  name: string;
  class_id: string;
}

export interface ClassOption {
  id: string;
  name: string;
}

export interface SubjectOption {
  id: string;
  name: string;
}

export interface ParentUserOption {
  user_id: string;
  email: string;
  full_name: string;
}

export interface StudentFormValues {
  // Basic
  first_name: string;
  last_name: string;
  gender: string;
  date_of_birth: string;
  profile_image_url: string;
  // Identification
  roll_number: string;
  registration_number: string;
  student_code: string;
  admission_date: string;
  status: string;
  // Academic
  section_id: string;
  subject_ids: string[];
  // Parent
  parent_mode: "existing" | "new";
  parent_user_id: string;
  parent_full_name: string;
  parent_phone: string;
  parent_email: string;
  parent_relationship: string;
  // Address
  address: string;
  city: string;
  area: string;
  // Optional
  phone: string;
  emergency_contact: string;
  medical_notes: string;
  notes: string;
}

export const EMPTY_STUDENT_FORM: StudentFormValues = {
  first_name: "",
  last_name: "",
  gender: "",
  date_of_birth: "",
  profile_image_url: "",
  roll_number: "",
  registration_number: "",
  student_code: "",
  admission_date: "",
  status: "enrolled",
  section_id: "",
  subject_ids: [],
  parent_mode: "new",
  parent_user_id: "",
  parent_full_name: "",
  parent_phone: "",
  parent_email: "",
  parent_relationship: "father",
  address: "",
  city: "",
  area: "",
  phone: "",
  emergency_contact: "",
  medical_notes: "",
  notes: "",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  initial?: Partial<StudentFormValues>;
  studentId?: string | null; // present in edit mode
  classes: ClassOption[];
  sections: SectionOption[];
  subjects: SubjectOption[];
  parentUsers: ParentUserOption[];
  onSaved: () => void;
}

export function StudentFormDialog({
  open,
  onOpenChange,
  schoolId,
  initial,
  studentId,
  classes,
  sections,
  subjects,
  parentUsers,
  onSaved,
}: Props) {
  const [form, setForm] = useState<StudentFormValues>({ ...EMPTY_STUDENT_FORM, ...(initial ?? {}) });
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sectionSubjectIds, setSectionSubjectIds] = useState<string[]>([]);
  const [loadingSectionSubjects, setLoadingSectionSubjects] = useState(false);
  const isEdit = !!studentId;

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_STUDENT_FORM, ...(initial ?? {}) });
    }
  }, [open, initial]);

  // Load subjects mapped to the currently selected section's class
  useEffect(() => {
    if (!open || !form.section_id) {
      setSectionSubjectIds([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingSectionSubjects(true);
      try {
        const { data, error } = await supabase
          .from("class_section_subjects")
          .select("subject_id")
          .eq("school_id", schoolId)
          .eq("class_section_id", form.section_id);
        if (error) throw error;
        if (!cancelled) {
          const ids = (data ?? []).map((r: { subject_id: string }) => r.subject_id);
          setSectionSubjectIds(ids);
          setForm((prev) => ({
            ...prev,
            subject_ids: prev.subject_ids.filter((sid) => ids.includes(sid)),
          }));
        }
      } catch {
        if (!cancelled) setSectionSubjectIds([]);
      } finally {
        if (!cancelled) setLoadingSectionSubjects(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, form.section_id, schoolId]);

  const sectionLabel = useMemo(() => {
    const map = new Map(classes.map((c) => [c.id, c.name]));
    return (s: SectionOption) => `${map.get(s.class_id) ?? "Class"} • ${s.name}`;
  }, [classes]);

  const sectionSubjects = useMemo(() => {
    if (!form.section_id) return [] as SubjectOption[];
    const idSet = new Set(sectionSubjectIds);
    return subjects.filter((s) => idSet.has(s.id));
  }, [subjects, sectionSubjectIds, form.section_id]);

  const update = <K extends keyof StudentFormValues>(key: K, value: StudentFormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handlePhotoUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${schoolId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("student-photos")
        .upload(path, file, { upsert: false, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("student-photos").getPublicUrl(path);
      update("profile_image_url", pub.publicUrl);
      toast.success("Photo uploaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Photo upload failed");
    } finally {
      setUploading(false);
    }
  };

  const validate = (): string | null => {
    if (!form.first_name.trim()) return "First name is required";
    if (!form.section_id) return "Please select a class & section";
    if (!isEdit) {
      if (form.parent_mode === "existing" && !form.parent_user_id)
        return "Select an existing parent account";
      if (form.parent_mode === "new" && !form.parent_full_name.trim())
        return "Parent name is required";
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);
    try {
      // Resolve parent user id from email if mode === new + email matches existing membership
      let resolvedParentUserId: string | null =
        form.parent_mode === "existing" && form.parent_user_id ? form.parent_user_id : null;

      if (!resolvedParentUserId && form.parent_mode === "new" && form.parent_email.trim()) {
        const { data: foundId } = await (supabase as any).rpc("find_parent_user_by_email", {
          _school_id: schoolId,
          _email: form.parent_email.trim(),
        });
        if (foundId) resolvedParentUserId = foundId as string;
      }

      const studentPayload: Record<string, any> = {
        school_id: schoolId,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim() || null,
        gender: form.gender || null,
        date_of_birth: form.date_of_birth || null,
        admission_date: form.admission_date || null,
        status: form.status || "enrolled",
        roll_number: form.roll_number.trim() || null,
        registration_number: form.registration_number.trim() || null,
        student_code: form.student_code.trim() || null,
        profile_image_url: form.profile_image_url || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        area: form.area.trim() || null,
        phone: form.phone.trim() || null,
        emergency_contact: form.emergency_contact.trim() || null,
        medical_notes: form.medical_notes.trim() || null,
        notes: form.notes.trim() || null,
        // legacy parent quick-fields
        parent_name: form.parent_full_name.trim() || null,
        parent_phone: form.parent_phone.trim() || null,
        parent_email: form.parent_email.trim() || null,
      };

      let resultStudentId = studentId ?? null;
      if (isEdit && studentId) {
        const { error } = await supabase
          .from("students")
          .update(studentPayload)
          .eq("id", studentId)
          .eq("school_id", schoolId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("students")
          .insert(studentPayload)
          .select("id")
          .single();
        if (error) throw error;
        resultStudentId = data.id as string;
      }

      // Enrollment (upsert latest section)
      if (resultStudentId && form.section_id) {
        // Close any existing open enrollment if section changes
        const { data: openEnr } = await supabase
          .from("student_enrollments")
          .select("id, class_section_id")
          .eq("school_id", schoolId)
          .eq("student_id", resultStudentId)
          .is("end_date", null)
          .maybeSingle();

        if (openEnr && openEnr.class_section_id !== form.section_id) {
          await supabase
            .from("student_enrollments")
            .update({ end_date: new Date().toISOString().slice(0, 10) })
            .eq("id", openEnr.id);
        }
        if (!openEnr) {
          await supabase.from("student_enrollments").insert({
            school_id: schoolId,
            student_id: resultStudentId,
            class_section_id: form.section_id,
            start_date: new Date().toISOString().slice(0, 10),
          });
        } else if (openEnr.class_section_id !== form.section_id) {
          await supabase.from("student_enrollments").insert({
            school_id: schoolId,
            student_id: resultStudentId,
            class_section_id: form.section_id,
            start_date: new Date().toISOString().slice(0, 10),
          });
        }
      }

      // Guardian link (only on create OR if "new" parent specified)
      if (resultStudentId && !isEdit) {
        const guardianPayload = {
          school_id: schoolId,
          student_id: resultStudentId,
          full_name: form.parent_full_name.trim() || null,
          phone: form.parent_phone.trim() || null,
          email: form.parent_email.trim() || null,
          relationship: form.parent_relationship || null,
          user_id: resolvedParentUserId,
          is_primary: true,
        };
        // Avoid duplicate guardians: check by user_id or by email
        const { data: existing } = await (supabase as any)
          .from("student_guardians")
          .select("id")
          .eq("student_id", resultStudentId)
          .or(
            `user_id.eq.${resolvedParentUserId ?? "00000000-0000-0000-0000-000000000000"},email.eq.${form.parent_email.trim() || "_noemail_"}`,
          )
          .maybeSingle();
        if (!existing) {
          const { error: gErr } = await (supabase as any)
            .from("student_guardians")
            .insert(guardianPayload);
          if (gErr) console.warn("Guardian link failed:", gErr.message);
        }
      }

      toast.success(isEdit ? "Student updated" : "Student created");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      const msg = e?.message ?? "Save failed";
      if (msg.includes("students_school_roll_unique")) {
        toast.error("Roll number is already taken in this school");
      } else if (msg.includes("students_school_regno_unique")) {
        toast.error("Registration number is already taken");
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <UserPlus className="h-5 w-5 text-primary" />
            {isEdit ? "Edit student" : "Add new student"}
          </DialogTitle>
          <DialogDescription>
            Complete all required details. Optional sections help with safety, communication, and reporting.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="px-6">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="academic">Academic</TabsTrigger>
            <TabsTrigger value="parent">Parent</TabsTrigger>
            <TabsTrigger value="more">More</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[55vh] mt-4 pr-3">
            {/* BASIC */}
            <TabsContent value="basic" className="space-y-4 mt-0">
              <div className="flex items-start gap-4">
                <label
                  className={cn(
                    "relative flex h-24 w-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-colors",
                    form.profile_image_url
                      ? "border-transparent"
                      : "border-border bg-muted/40 hover:bg-muted",
                  )}
                >
                  {form.profile_image_url ? (
                    <>
                      <img
                        src={form.profile_image_url}
                        alt="Student"
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          update("profile_image_url", "");
                        }}
                        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-background/90 shadow-soft"
                        aria-label="Remove photo"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                      {uploading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Upload className="h-5 w-5" />
                      )}
                      <span className="text-[10px]">Upload</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handlePhotoUpload(f);
                    }}
                  />
                </label>
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>First name *</Label>
                    <Input
                      value={form.first_name}
                      onChange={(e) => update("first_name", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Last name</Label>
                    <Input
                      value={form.last_name}
                      onChange={(e) => update("last_name", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Gender</Label>
                    <Select value={form.gender} onValueChange={(v) => update("gender", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date of birth</Label>
                    <Input
                      type="date"
                      value={form.date_of_birth}
                      onChange={(e) => update("date_of_birth", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Roll number</Label>
                  <Input
                    value={form.roll_number}
                    onChange={(e) => update("roll_number", e.target.value)}
                    placeholder="Unique within school"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Registration number</Label>
                  <Input
                    value={form.registration_number}
                    onChange={(e) => update("registration_number", e.target.value)}
                    placeholder="Auto or manual"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Student ID code</Label>
                  <Input
                    value={form.student_code}
                    onChange={(e) => update("student_code", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Admission date</Label>
                  <Input
                    type="date"
                    value={form.admission_date}
                    onChange={(e) => update("admission_date", e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>

            {/* ACADEMIC */}
            <TabsContent value="academic" className="space-y-4 mt-0">
              <div className="space-y-1.5">
                <Label>Class & Section *</Label>
                <Select value={form.section_id} onValueChange={(v) => update("section_id", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {sectionLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => update("status", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enrolled">Enrolled</SelectItem>
                    <SelectItem value="inquiry">Inquiry</SelectItem>
                    <SelectItem value="withdrawn">Withdrawn</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Subjects (optional)</Label>
                {!form.section_id ? (
                  <p className="text-xs text-muted-foreground">
                    Select a class & section first to see assigned subjects.
                  </p>
                ) : loadingSectionSubjects ? (
                  <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading subjects for this class…
                  </p>
                ) : sectionSubjects.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No subjects are assigned to this class yet. Add them in the Academic module first.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {sectionSubjects.map((s) => {
                        const active = form.subject_ids.includes(s.id);
                        return (
                          <button
                            type="button"
                            key={s.id}
                            onClick={() => {
                              const next = active
                                ? form.subject_ids.filter((x) => x !== s.id)
                                : [...form.subject_ids, s.id];
                              update("subject_ids", next);
                            }}
                            className={cn(
                              "rounded-full border px-3 py-1 text-xs transition-colors",
                              active
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-surface hover:bg-accent",
                            )}
                          >
                            {s.name}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Showing only subjects assigned to this class. Leave blank to inherit the full curriculum.
                    </p>
                  </>
                )}
              </div>
            </TabsContent>

            {/* PARENT */}
            <TabsContent value="parent" className="space-y-4 mt-0">
              {!isEdit && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => update("parent_mode", "new")}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors",
                      form.parent_mode === "new"
                        ? "border-primary bg-primary/5"
                        : "hover:bg-accent",
                    )}
                  >
                    <p className="text-sm font-medium">Create / link new parent</p>
                    <p className="text-[11px] text-muted-foreground">Enter parent details below</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => update("parent_mode", "existing")}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors",
                      form.parent_mode === "existing"
                        ? "border-primary bg-primary/5"
                        : "hover:bg-accent",
                    )}
                  >
                    <p className="text-sm font-medium">Use existing parent</p>
                    <p className="text-[11px] text-muted-foreground">
                      Pick from parent accounts ({parentUsers.length})
                    </p>
                  </button>
                </div>
              )}

              {form.parent_mode === "existing" && !isEdit ? (
                <div className="space-y-1.5">
                  <Label>Existing parent account</Label>
                  <Select
                    value={form.parent_user_id}
                    onValueChange={(v) => update("parent_user_id", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose parent" />
                    </SelectTrigger>
                    <SelectContent>
                      {parentUsers.map((p) => (
                        <SelectItem key={p.user_id} value={p.user_id}>
                          {p.full_name} • {p.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    The student will appear in this parent's child list immediately.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Parent full name {!isEdit && "*"}</Label>
                      <Input
                        value={form.parent_full_name}
                        onChange={(e) => update("parent_full_name", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Relationship</Label>
                      <Select
                        value={form.parent_relationship}
                        onValueChange={(v) => update("parent_relationship", v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="father">Father</SelectItem>
                          <SelectItem value="mother">Mother</SelectItem>
                          <SelectItem value="guardian">Guardian</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Parent phone</Label>
                      <Input
                        value={form.parent_phone}
                        onChange={(e) => update("parent_phone", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Parent email</Label>
                      <Input
                        type="email"
                        value={form.parent_email}
                        onChange={(e) => update("parent_email", e.target.value)}
                      />
                    </div>
                  </div>
                  {!isEdit && (
                    <p className="text-[11px] text-muted-foreground">
                      If a parent account already exists with this email, we'll automatically link
                      the new student to it.
                    </p>
                  )}
                </>
              )}

              {isEdit && (
                <Badge variant="secondary" className="text-[11px]">
                  Parent links can be managed from the "Parent–Student linking" tab.
                </Badge>
              )}
            </TabsContent>

            {/* MORE */}
            <TabsContent value="more" className="space-y-4 mt-0">
              <div className="space-y-1.5">
                <Label>Address</Label>
                <Textarea
                  rows={2}
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                  placeholder="Street, building, etc."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>City</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Area / neighborhood</Label>
                  <Input
                    value={form.area}
                    onChange={(e) => update("area", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Student phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Emergency contact</Label>
                  <Input
                    value={form.emergency_contact}
                    onChange={(e) => update("emergency_contact", e.target.value)}
                    placeholder="Name & phone"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Medical notes</Label>
                <Textarea
                  rows={2}
                  value={form.medical_notes}
                  onChange={(e) => update("medical_notes", e.target.value)}
                  placeholder="Allergies, conditions, medication"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Internal notes</Label>
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                />
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="gap-2 border-t bg-muted/30 px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={submitting || uploading}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : isEdit ? (
              "Save changes"
            ) : (
              "Create student"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
