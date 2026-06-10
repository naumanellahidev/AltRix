import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileDown, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props { schoolId: string; }

interface Item {
  id: string; exam_id: string; student_id: string; file_path: string; generated_at: string;
  exams?: { name: string; term_label: string | null };
  students?: { first_name: string; last_name: string };
}

export default function ParentDatesheetsCard({ schoolId }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any)
        .from("exam_datesheet_distributions")
        .select("id,exam_id,student_id,file_path,generated_at,exams(name,term_label),students(first_name,last_name)")
        .eq("school_id", schoolId)
        .order("generated_at", { ascending: false });
      if (!error) setItems(data || []);
      setLoading(false);
    })();
  }, [schoolId]);

  const download = async (path: string, name: string) => {
    const { data, error } = await (supabase as any).storage.from("exam-datesheets").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return toast.error(error?.message || "Could not generate link");
    const a = document.createElement("a");
    a.href = data.signedUrl; a.download = name; a.target = "_blank";
    document.body.appendChild(a); a.click(); a.remove();
  };

  if (loading) return null;
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" /> Exam Datesheets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((it) => {
          const childName = it.students ? `${it.students.first_name} ${it.students.last_name}` : "Child";
          return (
            <div key={it.id} className="flex items-center justify-between rounded-md border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{it.exams?.name || "Exam"}</p>
                <p className="text-xs text-muted-foreground">
                  {childName}
                  {it.exams?.term_label && ` · ${it.exams.term_label}`}
                  {` · ${format(new Date(it.generated_at), "MMM d, yyyy")}`}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => download(it.file_path, `datesheet-${childName}.pdf`)}>
                <FileDown className="mr-1 h-4 w-4" />Download
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
