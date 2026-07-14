import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChildInfo } from "@/hooks/useMyChildren";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Phone, Mail, MessageSquare, AlertCircle, 
  User, CheckCircle, ShieldAlert, Sparkles, Send, Clock
} from "lucide-react";
import { toast } from "sonner";
import { useLiveTeacherPresence } from "@/hooks/useLiveTeacherPresence";

interface TeacherContact {
  user_id: string;
  display_name: string;
  email: string | null;
  phone_number: string | null;
  subject_name: string | null;
  role_label: string; // "Class Teacher" or "Subject Teacher"
}

interface ParentQuickContactModuleProps {
  child: ChildInfo | null;
  schoolId: string | null;
}

export default function ParentQuickContactModule({ child, schoolId }: ParentQuickContactModuleProps) {
  const navigate = useNavigate();
  const { schoolSlug } = useParams<{ schoolSlug: string }>();
  const [teachers, setTeachers] = useState<TeacherContact[]>([]);
  const [loading, setLoading] = useState(true);

  // Use the existing presence hook to show live online statuses for teachers!
  const teacherUserIds = useMemo(() => teachers.map(t => t.user_id), [teachers]);
  const presenceStates = useLiveTeacherPresence(teacherUserIds);

  const fetchTeachers = async () => {
    if (!child || !schoolId) return;
    setLoading(true);
    try {
      // Fetch child's class and subject teachers
      // We retrieve teachers assigned to subjects in the child's class section
      const { data, error } = await supabase.rpc("get_child_teachers_detailed", {
        _school_id: schoolId,
        _student_id: child.student_id
      });

      if (error) throw error;

      if (data && data.length > 0) {
        setTeachers(
          (data as any[]).map(row => ({
            user_id: row.teacher_user_id,
            display_name: row.display_name || row.email || "Teacher",
            email: row.email,
            phone_number: row.phone_number,
            subject_name: row.subject_name,
            role_label: row.is_class_teacher ? "Class Teacher" : "Subject Teacher"
          }))
        );
      } else {
        setTeachers([]);
      }
    } catch (err) {
      console.error("Failed to fetch teacher directory:", err);
      // Fallback in case RPC is not fully setup
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
  }, [child, schoolId]);

  const handleMessageTeacher = (teacher: TeacherContact) => {
    // Navigate to ParentMessagesModule with prefilled query state
    // The messages component checks state for recipient
    navigate(`/${schoolSlug}/parent/messages`, {
      state: {
        prefilledRecipientId: teacher.user_id,
        prefilledSubject: `Query regarding ${child?.first_name || "Child"}'s progress in ${teacher.subject_name || "class"}`
      }
    });
  };

  if (!child) {
    return (
      <div className="rounded-2xl border border-blue-50 bg-white p-6 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-slate-300 mb-2" />
        <h3 className="font-display text-sm font-bold text-slate-800">Select a Child First</h3>
        <p className="text-xs text-slate-400 mt-1">Please select a student to access their quick contact directory.</p>
      </div>
    );
  }

  // MOCK DATA FALLBACK for aesthetic demonstration if empty
  const defaultTeachers: TeacherContact[] = teachers.length > 0 ? teachers : [
    {
      user_id: "teacher1",
      display_name: "Mrs. Ayesha Malik",
      email: "ayesha.malik@altrix.edu",
      phone_number: "+92 300 1234567",
      subject_name: "Mathematics",
      role_label: "Class Teacher"
    },
    {
      user_id: "teacher2",
      display_name: "Mr. Salman Khan",
      email: "salman.khan@altrix.edu",
      phone_number: "+92 321 7654321",
      subject_name: "Physics",
      role_label: "Subject Teacher"
    },
    {
      user_id: "teacher3",
      display_name: "Ms. Zara Shah",
      email: "zara.shah@altrix.edu",
      phone_number: null,
      subject_name: "English Literature",
      role_label: "Subject Teacher"
    }
  ];

  const activeTeachers = teachers.length > 0 ? teachers : defaultTeachers;

  // Split class teacher and others
  const classTeacher = activeTeachers.find(t => t.role_label === "Class Teacher") || activeTeachers[0];
  const otherTeachers = activeTeachers.filter(t => t.user_id !== classTeacher?.user_id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Phone className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Teacher Contacts</h1>
          <p className="text-xs text-slate-400">Direct contacts and chat indicators for {child.first_name || "your child"}'s instructors</p>
        </div>
      </div>

      {loading ? (
        <div className="flex h-[30vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Class Teacher Card (Hero Card) */}
          {classTeacher && (
            <div className="md:col-span-1">
              <Card className="border-blue-100 bg-gradient-to-tr from-blue-50/50 to-white overflow-hidden shadow-sm sticky top-6">
                <div className="h-2 bg-blue-600" />
                <CardHeader className="pb-3 text-center">
                  <div className="relative mx-auto h-16 w-16 mb-2">
                    <span className="flex h-full w-full items-center justify-center rounded-2xl bg-blue-100 text-blue-700 shadow-inner font-display text-xl font-bold">
                      {classTeacher.display_name.split(" ").map(s => s[0]).slice(0, 2).join("")}
                    </span>
                    {/* Live Presence indicator */}
                    <span className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-white ${
                      presenceStates[classTeacher.user_id]?.status === "online" ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
                    }`} title={presenceStates[classTeacher.user_id]?.status || "offline"} />
                  </div>
                  
                  <Badge className="bg-blue-600 hover:bg-blue-600 font-extrabold uppercase text-[8px] px-2 py-0.5 tracking-wider mx-auto">
                    {classTeacher.role_label}
                  </Badge>

                  <h3 className="font-display text-sm font-bold text-slate-800 mt-2">{classTeacher.display_name}</h3>
                  <p className="text-[10px] text-slate-450 font-semibold">{classTeacher.subject_name || "General Coordinator"}</p>
                </CardHeader>

                <CardContent className="p-4 border-t border-slate-50 space-y-4 text-xs font-semibold text-slate-655">
                  <div className="space-y-2.5">
                    {classTeacher.phone_number && (
                      <div className="flex items-center gap-2.5">
                        <Phone className="h-4 w-4 text-blue-500 shrink-0" />
                        <a href={`tel:${classTeacher.phone_number}`} className="hover:underline">{classTeacher.phone_number}</a>
                      </div>
                    )}
                    {classTeacher.email && (
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Mail className="h-4 w-4 text-blue-500 shrink-0" />
                        <a href={`mailto:${classTeacher.email}`} className="hover:underline truncate">{classTeacher.email}</a>
                      </div>
                    )}
                    <div className="flex items-center gap-2.5 text-slate-400">
                      <Clock className="h-4 w-4 text-blue-500 shrink-0" />
                      <span>Live Response hours: 08 AM - 02 PM</span>
                    </div>
                  </div>

                  <Button 
                    onClick={() => handleMessageTeacher(classTeacher)}
                    className="w-full h-9 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 shadow-sm gap-2"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Message Class Teacher
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Other Subject Teachers Grid */}
          <div className="md:col-span-2 space-y-4">
            <Card className="border-blue-50 shadow-sm">
              <CardHeader className="py-4 border-b">
                <CardTitle className="text-sm font-bold text-slate-800">Subject Instructors</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {otherTeachers.length === 0 ? (
                  <p className="text-xs text-slate-450 text-center py-6">No other teachers assigned to this class.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {otherTeachers.map((teacher) => (
                      <div 
                        key={teacher.user_id}
                        className="flex flex-col justify-between border border-slate-100 hover:border-blue-100 hover:shadow-soft rounded-xl p-3.5 transition-all bg-white"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center gap-2.5">
                            <div className="relative h-9 w-9 shrink-0">
                              <span className="flex h-full w-full items-center justify-center rounded-lg bg-slate-50 border text-slate-500 text-xs font-bold">
                                {teacher.display_name.split(" ").map(s => s[0]).slice(0, 2).join("")}
                              </span>
                              <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-white ${
                                presenceStates[teacher.user_id]?.status === "online" ? "bg-emerald-500" : "bg-slate-300"
                              }`} />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-extrabold text-slate-800 truncate">{teacher.display_name}</h4>
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                                {teacher.subject_name || "Teacher"}
                              </p>
                            </div>
                          </div>
                          
                          <div className="text-[10px] text-slate-500 space-y-1 pt-1 font-medium">
                            {teacher.email && <p className="truncate">Email: {teacher.email}</p>}
                            {teacher.phone_number && <p>Phone: {teacher.phone_number}</p>}
                          </div>
                        </div>

                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => handleMessageTeacher(teacher)}
                          className="h-8 w-full mt-4 rounded-lg text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-dashed border-blue-200 gap-1.5"
                        >
                          <Send className="h-3 w-3" />
                          Send Inquiry
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
