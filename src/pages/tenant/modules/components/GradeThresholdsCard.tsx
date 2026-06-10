import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Save, GraduationCap } from "lucide-react";

type GradeThreshold = {
  id: string;
  grade_label: string;
  min_percentage: number;
  max_percentage: number;
  grade_points: number;
  sort_order: number;
};

const DEFAULT_THRESHOLDS = [
  { grade_label: "A+", min_percentage: 90, max_percentage: 100, grade_points: 4.0, sort_order: 1 },
  { grade_label: "A", min_percentage: 85, max_percentage: 89.99, grade_points: 3.7, sort_order: 2 },
  { grade_label: "B+", min_percentage: 80, max_percentage: 84.99, grade_points: 3.3, sort_order: 3 },
  { grade_label: "B", min_percentage: 75, max_percentage: 79.99, grade_points: 3.0, sort_order: 4 },
  { grade_label: "C+", min_percentage: 70, max_percentage: 74.99, grade_points: 2.7, sort_order: 5 },
  { grade_label: "C", min_percentage: 65, max_percentage: 69.99, grade_points: 2.3, sort_order: 6 },
  { grade_label: "D", min_percentage: 50, max_percentage: 64.99, grade_points: 1.0, sort_order: 7 },
  { grade_label: "F", min_percentage: 0, max_percentage: 49.99, grade_points: 0.0, sort_order: 8 },
];

export function GradeThresholdsCard({ schoolId }: { schoolId: string }) {
  const [thresholds, setThresholds] = useState<GradeThreshold[]>([]);
  const [newThreshold, setNewThreshold] = useState({
    grade_label: "",
    min_percentage: 0,
    max_percentage: 100,
    grade_points: 0,
  });
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    const { data } = await supabase
      .from("grade_thresholds")
      .select("*")
      .eq("school_id", schoolId)
      .order("sort_order");
    setThresholds((data ?? []) as GradeThreshold[]);
  };

  useEffect(() => {
    refresh();
  }, [schoolId]);

  const addThreshold = async () => {
    if (!newThreshold.grade_label.trim()) {
      toast.error("Grade label is required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("grade_thresholds").insert({
      school_id: schoolId,
      grade_label: newThreshold.grade_label.trim(),
      min_percentage: newThreshold.min_percentage,
      max_percentage: newThreshold.max_percentage,
      grade_points: newThreshold.grade_points,
      sort_order: thresholds.length + 1,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Threshold added");
      setNewThreshold({ grade_label: "", min_percentage: 0, max_percentage: 100, grade_points: 0 });
      refresh();
    }
  };

  const updateThreshold = async (id: string, field: keyof GradeThreshold, value: string | number) => {
    setThresholds((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  };

  const saveAllThresholds = async () => {
    setSaving(true);
    for (const t of thresholds) {
      await supabase
        .from("grade_thresholds")
        .update({
          grade_label: t.grade_label,
          min_percentage: t.min_percentage,
          max_percentage: t.max_percentage,
          grade_points: t.grade_points,
          sort_order: t.sort_order,
        })
        .eq("id", t.id);
    }
    setSaving(false);
    toast.success("All thresholds saved");
    refresh();
  };

  const deleteThreshold = async (id: string) => {
    const { error } = await supabase.from("grade_thresholds").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Threshold deleted");
      refresh();
    }
  };

  const loadDefaults = async () => {
    setSaving(true);
    for (const t of DEFAULT_THRESHOLDS) {
      await supabase.from("grade_thresholds").upsert({
        school_id: schoolId,
        grade_label: t.grade_label,
        min_percentage: t.min_percentage,
        max_percentage: t.max_percentage,
        grade_points: t.grade_points,
        sort_order: t.sort_order,
      }, { onConflict: "school_id,grade_label" });
    }
    setSaving(false);
    toast.success("Default thresholds loaded");
    refresh();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          Grade Thresholds
        </CardTitle>
        <div className="flex gap-2">
          {thresholds.length === 0 && (
            <Button variant="outline" size="sm" onClick={loadDefaults} disabled={saving}>
              Load Defaults
            </Button>
          )}
          <Button size="sm" onClick={saveAllThresholds} disabled={saving || thresholds.length === 0}>
            <Save className="h-4 w-4 mr-1" />
            Save All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Configure grade labels and percentage ranges. Grades are auto-calculated when marks are entered.
        </p>

        {thresholds.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Grade</TableHead>
                <TableHead>Min %</TableHead>
                <TableHead>Max %</TableHead>
                
                <TableHead>Order</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {thresholds.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Input
                      value={t.grade_label}
                      onChange={(e) => updateThreshold(t.id, "grade_label", e.target.value)}
                      className="w-20"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={t.min_percentage}
                      onChange={(e) => updateThreshold(t.id, "min_percentage", parseFloat(e.target.value) || 0)}
                      className="w-20"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={t.max_percentage}
                      onChange={(e) => updateThreshold(t.id, "max_percentage", parseFloat(e.target.value) || 0)}
                      className="w-20"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={t.sort_order}
                      onChange={(e) => updateThreshold(t.id, "sort_order", parseInt(e.target.value) || 0)}
                      className="w-16"
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => deleteThreshold(t.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="border-t pt-4">
          <p className="text-sm font-medium mb-2">Add New Threshold</p>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <Label className="text-xs">Grade</Label>
              <Input
                placeholder="e.g., A+"
                value={newThreshold.grade_label}
                onChange={(e) => setNewThreshold({ ...newThreshold, grade_label: e.target.value })}
                className="w-20"
              />
            </div>
            <div>
              <Label className="text-xs">Min %</Label>
              <Input
                type="number"
                value={newThreshold.min_percentage}
                onChange={(e) => setNewThreshold({ ...newThreshold, min_percentage: parseFloat(e.target.value) || 0 })}
                className="w-20"
              />
            </div>
            <div>
              <Label className="text-xs">Max %</Label>
              <Input
                type="number"
                value={newThreshold.max_percentage}
                onChange={(e) => setNewThreshold({ ...newThreshold, max_percentage: parseFloat(e.target.value) || 0 })}
                className="w-20"
              />
            </div>
            <Button onClick={addThreshold} disabled={saving}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
