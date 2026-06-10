import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle, Clock, Send, Eye, Paperclip, WifiOff } from "lucide-react";
import { FileUploadArea } from "@/components/assignments/FileUploadArea";
import { AttachmentsList } from "@/components/assignments/AttachmentsList";
import { useOfflineAssignments, useOfflineHomework, useOfflineEnrollments } from "@/hooks/useOfflineData";
import { OfflineDataBanner } from "@/components/offline/OfflineDataBanner";

type Assignment = { 
  id: string; 
  title: string; 
  description: string | null;
  due_date: string | null; 
  status: string;
  max_marks: number;
};

type Submission = {
  id: string;
  assignment_id: string;
  content: string | null;
  attachment_urls: string[] | null;
  submitted_at: string;
  status: string;
  marks: number | null;
  feedback: string | null;
};

type Homework = { id: string; title: string; due_date: string; status: string };

const BUCKET_NAME = "assignment-submissions";

export function StudentAssignmentsModule({ myStudent, schoolId }: { myStudent: any; schoolId: string }) {
  const [submissions, setSubmissions] = useState<Map<string, Submission>>(new Map());
  
  // Use offline-first data hooks
  const { 
    data: cachedAssignments, 
    loading: assignmentsLoading, 
    isOffline, 
    isUsingCache: assignmentsFromCache 
  } = useOfflineAssignments(schoolId);
  
  const { 
    data: cachedHomework, 
    loading: homeworkLoading, 
    isUsingCache: homeworkFromCache 
  } = useOfflineHomework(schoolId);

  const {
    data: cachedEnrollments,
    isUsingCache: enrollmentsFromCache,
  } = useOfflineEnrollments(schoolId);

  const mySectionIds = useMemo(() => {
    if (myStudent.status !== "ready") return [] as string[];
    return cachedEnrollments
      .filter((e) => e.studentId === myStudent.studentId)
      .map((e) => e.classSectionId);
  }, [cachedEnrollments, myStudent]);

  // Convert cached data to display format
  const assignments = useMemo(() => {
    const allowed = new Set(mySectionIds);
    return cachedAssignments
      .filter((a) => !allowed.size || allowed.has(a.classSectionId))
      .map(a => ({
      id: a.id,
      title: a.title,
      description: a.description,
      due_date: a.dueDate,
      status: a.status,
      max_marks: a.maxMarks,
    })) as Assignment[];
  }, [cachedAssignments, mySectionIds]);

  const homework = useMemo(() => {
    const allowed = new Set(mySectionIds);
    return cachedHomework
      .filter((h) => !allowed.size || allowed.has(h.classSectionId))
      .map(h => ({
      id: h.id,
      title: h.title,
      due_date: h.dueDate || '',
      status: h.status,
    })) as Homework[];
  }, [cachedHomework, mySectionIds]);
  
  // Submit dialog state
  const [submitOpen, setSubmitOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [submissionText, setSubmissionText] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; path: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // View result dialog
  const [viewOpen, setViewOpen] = useState(false);
  const [viewSubmission, setViewSubmission] = useState<Submission | null>(null);

  // Fetch submissions (only when online)
  useEffect(() => {
    if (myStudent.status !== "ready" || isOffline) return;
    
    (async () => {
      const { data: subs } = await supabase
        .from("assignment_submissions")
        .select("id,assignment_id,content,attachment_urls,submitted_at,status,marks,feedback")
        .eq("school_id", schoolId)
        .eq("student_id", myStudent.studentId);
      
      const subMap = new Map<string, Submission>();
      (subs ?? []).forEach((s: any) => subMap.set(s.assignment_id, s as Submission));
      setSubmissions(subMap);
    })();
  }, [myStudent.status, myStudent.studentId, schoolId, isOffline]);

  const openSubmitDialog = (assignment: Assignment) => {
    if (isOffline) {
      toast.error("Cannot submit assignments while offline");
      return;
    }
    const existing = submissions.get(assignment.id);
    setSelectedAssignment(assignment);
    setSubmissionText(existing?.content || "");
    const existingFiles = (existing?.attachment_urls || []).map((path) => ({
      name: path.split("/").pop() || path,
      path,
    }));
    setUploadedFiles(existingFiles);
    setSubmitOpen(true);
  };

  const handleUploadFile = async (file: File): Promise<string | null> => {
    if (!selectedAssignment || myStudent.status !== "ready") return null;

    const ext = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const filePath = `${myStudent.studentId}/${selectedAssignment.id}/${fileName}`;

    setUploading(true);
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, { upsert: false });

    setUploading(false);

    if (error) {
      toast.error(`Upload failed: ${error.message}`);
      return null;
    }

    return filePath;
  };

  const handleSubmit = async () => {
    if (!selectedAssignment || myStudent.status !== "ready") return;
    
    if (!submissionText.trim() && uploadedFiles.length === 0) {
      toast.error("Please add text or attach files");
      return;
    }
    
    const isLate = selectedAssignment.due_date && new Date(selectedAssignment.due_date) < new Date();
    
    setSubmitting(true);
    const existing = submissions.get(selectedAssignment.id);
    const attachmentUrls = uploadedFiles.map((f) => f.path);
    
    if (existing) {
      const { error } = await supabase
        .from("assignment_submissions")
        .update({
          content: submissionText,
          attachment_urls: attachmentUrls.length > 0 ? attachmentUrls : null,
          status: isLate ? "late" : "submitted",
          submitted_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Submission updated!");
        setSubmitOpen(false);
      }
    } else {
      const { error } = await supabase
        .from("assignment_submissions")
        .insert({
          school_id: schoolId,
          assignment_id: selectedAssignment.id,
          student_id: myStudent.studentId,
          content: submissionText,
          attachment_urls: attachmentUrls.length > 0 ? attachmentUrls : null,
          status: isLate ? "late" : "submitted",
        });
      
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Assignment submitted!");
        setSubmitOpen(false);
      }
    }
    setSubmitting(false);
  };

  const openViewDialog = (assignment: Assignment) => {
    const sub = submissions.get(assignment.id);
    if (sub) {
      setViewSubmission(sub);
      setSelectedAssignment(assignment);
      setViewOpen(true);
    }
  };

  const getSubmissionStatus = (assignment: Assignment) => {
    const sub = submissions.get(assignment.id);
    if (!sub) return { label: "Not Submitted", variant: "outline" as const, icon: Clock };
    if (sub.status === "graded") return { label: `Graded: ${sub.marks}/${assignment.max_marks}`, variant: "default" as const, icon: CheckCircle };
    if (sub.status === "late") return { label: "Submitted Late", variant: "secondary" as const, icon: Send };
    return { label: "Submitted", variant: "secondary" as const, icon: CheckCircle };
  };

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const hasAttachments = (assignment: Assignment) => {
    const sub = submissions.get(assignment.id);
    return sub?.attachment_urls && sub.attachment_urls.length > 0;
  };

  const loading = assignmentsLoading || homeworkLoading;
  const isUsingCache = assignmentsFromCache || homeworkFromCache || enrollmentsFromCache;

  if (loading && !isUsingCache) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <OfflineDataBanner isOffline={isOffline} isUsingCache={isUsingCache} />
      
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Assignments & homework</p>
      </div>

      <Tabs defaultValue="assignments">
        <TabsList>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="homework">Homework</TabsTrigger>
        </TabsList>
        
        <TabsContent value="assignments" className="mt-4 space-y-3">
          {assignments.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                {isOffline ? (
                  <div className="flex flex-col items-center gap-2">
                    <WifiOff className="h-8 w-8" />
                    <p>No cached assignments available</p>
                  </div>
                ) : (
                  "No assignments found."
                )}
              </CardContent>
            </Card>
          ) : (
            assignments.map((a) => {
              const status = getSubmissionStatus(a);
              const sub = submissions.get(a.id);
              const overdue = isOverdue(a.due_date) && !sub;
              
              return (
                <Card key={a.id} className={overdue ? "border-destructive/50" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{a.title}</CardTitle>
                          <Badge variant="outline" className="text-xs capitalize">
                            assignment
                          </Badge>
                          {hasAttachments(a) && (
                            <Paperclip className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        {a.description && (
                          <CardDescription className="mt-1">{a.description}</CardDescription>
                        )}
                      </div>
                      <Badge variant={status.variant} className="flex items-center gap-1">
                        <status.icon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        <span>Max: {a.max_marks} marks</span>
                        {a.due_date && (
                          <span className={overdue ? "text-destructive ml-3" : "ml-3"}>
                            Due: {new Date(a.due_date).toLocaleDateString()}
                            {overdue && " (Overdue)"}
                          </span>
                        )}
                      </div>
                      {!isOffline && (
                        <div className="flex gap-2">
                          {sub?.status === "graded" && (
                            <Button size="sm" variant="outline" onClick={() => openViewDialog(a)}>
                              <Eye className="h-4 w-4 mr-1" /> View Result
                            </Button>
                          )}
                          {sub?.status !== "graded" && (
                            <Button size="sm" onClick={() => openSubmitDialog(a)}>
                              <Send className="h-4 w-4 mr-1" /> {sub ? "Update" : "Submit"}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
        
        <TabsContent value="homework" className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {homework.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">{h.title}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(h.due_date).toLocaleDateString()}</TableCell>
                  <TableCell className="text-muted-foreground">{h.status}</TableCell>
                </TableRow>
              ))}
              {homework.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-muted-foreground">
                    {isOffline ? "No cached homework available." : "No homework found."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      {/* Submit Assignment Dialog */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit Assignment</DialogTitle>
            <DialogDescription>
              {selectedAssignment?.title}
              {selectedAssignment?.due_date && (
                <span className="block mt-1">
                  Due: {new Date(selectedAssignment.due_date).toLocaleDateString()}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedAssignment?.due_date && new Date(selectedAssignment.due_date) < new Date() && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    This assignment is past due
                  </p>
                </div>
              </div>
            )}
            
            <div>
              <label className="text-sm font-medium">Your Answer / Work</label>
              <Textarea
                value={submissionText}
                onChange={(e) => setSubmissionText(e.target.value)}
                placeholder="Enter your answer or paste your work here..."
                rows={6}
                className="mt-2"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Attachments</label>
              <FileUploadArea
                files={uploadedFiles}
                onFilesChange={setUploadedFiles}
                onUpload={handleUploadFile}
                uploading={uploading}
                disabled={submitting}
                maxFiles={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmit} 
              disabled={submitting || uploading || (!submissionText.trim() && uploadedFiles.length === 0)}
            >
              {submitting ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Result Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assignment Result</DialogTitle>
            <DialogDescription>{selectedAssignment?.title}</DialogDescription>
          </DialogHeader>
          {viewSubmission && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Your Mark</p>
                  <p className="text-2xl font-bold">
                    {viewSubmission.marks ?? "—"} / {selectedAssignment?.max_marks}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Submitted</p>
                  <p className="font-medium">{new Date(viewSubmission.submitted_at).toLocaleString()}</p>
                </div>
              </div>
              
              {viewSubmission.feedback && (
                <div>
                  <p className="text-sm font-medium mb-1">Teacher Feedback</p>
                  <div className="rounded-lg bg-muted p-3 text-sm">{viewSubmission.feedback}</div>
                </div>
              )}
              
              {viewSubmission.content && (
                <div>
                  <p className="text-sm font-medium mb-1">Your Submission</p>
                  <div className="rounded-lg border p-3 text-sm whitespace-pre-wrap max-h-40 overflow-auto">
                    {viewSubmission.content}
                  </div>
                </div>
              )}
              
              {viewSubmission.attachment_urls && viewSubmission.attachment_urls.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Attachments</p>
                  <AttachmentsList attachmentUrls={viewSubmission.attachment_urls} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setViewOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
