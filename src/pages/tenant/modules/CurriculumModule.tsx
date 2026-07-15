import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api-client";
import {
  BookOpen,
  Plus,
  Trash2,
  FolderOpen,
  Layers,
  Award,
  Settings,
  Flame,
  CheckCircle,
  HelpCircle
} from "lucide-react";
import { toast } from "sonner";

interface CurriculumPreset {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_global: boolean;
  strand_definitions: any;
}

interface LearningOutcome {
  id: string;
  code: string;
  title: string;
  strand: string | null;
  sub_strand: string | null;
  grade_level: number | null;
}

interface GradeBoundary {
  id: string;
  label: string;
  min_percentage: number;
  max_percentage: number;
  gpa_equivalent: number | null;
  is_passing: boolean;
}

export default function CurriculumModule() {
  const [activeTab, setActiveTab] = useState("presets");
  const [loading, setLoading] = useState(false);

  // Curriculum presets
  const [presets, setPresets] = useState<CurriculumPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  // Learning Outcomes
  const [outcomes, setOutcomes] = useState<LearningOutcome[]>([]);
  const [newLoCode, setNewLoCode] = useState("");
  const [newLoTitle, setNewLoTitle] = useState("");
  const [newLoStrand, setNewLoStrand] = useState("");
  const [newLoSubStrand, setNewLoSubStrand] = useState("");
  const [newLoGrade, setNewLoGrade] = useState(5);

  // Grade boundaries override state
  const [boundaries, setBoundaries] = useState<GradeBoundary[]>([]);
  const [newGbLabel, setNewGbLabel] = useState("A*");
  const [newGbMin, setNewGbMin] = useState(90);
  const [newGbMax, setNewGbMax] = useState(100);
  const [newGbGpa, setNewGbGpa] = useState(4.0);

  const loadData = async () => {
    setLoading(true);
    try {
      const [presetsRes, boundsRes] = await Promise.all([
        apiClient.get("/curriculum/presets"),
        apiClient.get("/curriculum/grade-boundaries"),
      ]);
      setPresets(presetsRes.data || []);
      setBoundaries(boundsRes.data || []);

      if (presetsRes.data && presetsRes.data.length > 0 && !selectedPresetId) {
        setSelectedPresetId(presetsRes.data[0].id);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error loading curriculum framework details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch LOs when preset/view updates
  useEffect(() => {
    if (!selectedPresetId) return;
    apiClient
      .get("/curriculum/learning-outcomes", { params: { preset_id: selectedPresetId } })
      .then((res) => {
        setOutcomes(res.data || []);
      })
      .catch((err) => {
        console.error(err);
      });
  }, [selectedPresetId]);

  const handleAddOutcome = async () => {
    if (!newLoCode || !newLoTitle) {
      toast.error("Code and Title are required");
      return;
    }
    try {
      await apiClient.post("/curriculum/learning-outcomes", {
        preset_id: selectedPresetId,
        code: newLoCode,
        title: newLoTitle,
        strand: newLoStrand || "General",
        sub_strand: newLoSubStrand || "General",
        grade_level: newLoGrade,
      });
      toast.success("Learning Outcome mapped successfully!");
      setNewLoCode("");
      setNewLoTitle("");

      // Refresh outcomes
      const res = await apiClient.get("/curriculum/learning-outcomes", {
        params: { preset_id: selectedPresetId },
      });
      setOutcomes(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to add learning outcome");
    }
  };

  const handleAddBoundary = async () => {
    try {
      const updated = [...boundaries];
      // simplified bulk post override
      await apiClient.post("/curriculum/grade-boundaries", [
        ...boundaries.map((b) => ({
          label: b.label,
          min_percentage: b.min_percentage,
          max_percentage: b.max_percentage,
          gpa_equivalent: b.gpa_equivalent,
        })),
        {
          label: newGbLabel,
          min_percentage: newGbMin,
          max_percentage: newGbMax,
          gpa_equivalent: newGbGpa,
        },
      ]);
      toast.success("Grade boundaries updated!");
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update boundaries");
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      {/* Title Header */}
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Curriculum & Standards</h1>
        <p className="text-muted-foreground mt-1">
          Map academic standards, benchmark learning outcomes, and enforce grading boundaries across Cambridge, IB, and Punjab board guidelines.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted p-1 rounded-xl">
          <TabsTrigger value="presets" className="gap-2 rounded-lg">
            <BookOpen className="h-4 w-4" /> Curriculum Presets
          </TabsTrigger>
          <TabsTrigger value="outcomes" className="gap-2 rounded-lg">
            <Layers className="h-4 w-4" /> Learning Outcomes
          </TabsTrigger>
          <TabsTrigger value="boundaries" className="gap-2 rounded-lg">
            <Award className="h-4 w-4" /> Grading Boundaries
          </TabsTrigger>
        </TabsList>

        {/* Presets tab content */}
        <TabsContent value="presets" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {presets.map((p) => (
              <Card
                key={p.id}
                onClick={() => {
                  setSelectedPresetId(p.id);
                  setActiveTab("outcomes");
                }}
                className="shadow-soft cursor-pointer hover:border-primary/50 transition border border-border/80 relative overflow-hidden group"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition pointer-events-none" />
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg font-bold font-display text-primary">{p.name}</CardTitle>
                    {p.is_global && (
                      <Badge variant="outline" className="border-primary/30 text-primary uppercase text-[10px]">
                        Global Framework
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground min-h-[40px] leading-relaxed">
                    {p.description || "Fully customized curriculum preset mapping standards and custom outcomes."}
                  </p>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <FolderOpen className="h-4 w-4 text-muted-foreground/80" />
                    <span>Mapped subjects: {p.strand_definitions?.length || 0}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Outcomes Mapping tab content */}
        <TabsContent value="outcomes" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar Framework Selector */}
            <div className="lg:col-span-1 space-y-4">
              <Card className="shadow-soft border-border/60">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Select Framework
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 space-y-1">
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPresetId(p.id)}
                      className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all ${
                        selectedPresetId === p.id
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "hover:bg-muted text-foreground"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Main outcomes table & creator */}
            <div className="lg:col-span-3 space-y-6">
              {/* Creator block */}
              <Card className="shadow-soft border-border/60 bg-muted/20">
                <CardHeader>
                  <CardTitle className="text-sm font-bold tracking-tight text-foreground uppercase">
                    Map New Learning Outcome
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Outcome Code</Label>
                    <Input
                      placeholder="e.g. ENG-5-R-01"
                      value={newLoCode}
                      onChange={(e) => setNewLoCode(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Outcome Title</Label>
                    <Input
                      placeholder="e.g. Critical Reading Comprehension"
                      value={newLoTitle}
                      onChange={(e) => setNewLoTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Curriculum Strand</Label>
                    <Input
                      placeholder="e.g. Reading, Number Sense"
                      value={newLoStrand}
                      onChange={(e) => setNewLoStrand(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sub Strand</Label>
                    <Input
                      placeholder="e.g. Inference"
                      value={newLoSubStrand}
                      onChange={(e) => setNewLoSubStrand(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Grade Level (Class)</Label>
                    <Input
                      type="number"
                      value={newLoGrade}
                      onChange={(e) => setNewLoGrade(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleAddOutcome} className="w-full bg-primary text-primary-foreground font-semibold">
                      <Plus className="h-4 w-4 mr-2" /> Map Outcome
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Table */}
              <Card className="shadow-soft border-border/60">
                <CardHeader>
                  <CardTitle className="text-base font-bold font-display">Mapped Standards Matrix</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="font-semibold pl-6">Code</TableHead>
                        <TableHead className="font-semibold">Title</TableHead>
                        <TableHead className="font-semibold">Strand</TableHead>
                        <TableHead className="font-semibold text-center">Grade Level</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {outcomes.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">
                            No learning outcomes mapped for this preset. Add some above.
                          </TableCell>
                        </TableRow>
                      ) : (
                        outcomes.map((o) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-mono text-xs text-primary font-bold pl-6">{o.code}</TableCell>
                            <TableCell className="font-medium text-foreground">{o.title}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {o.strand} <span className="opacity-60">/ {o.sub_strand}</span>
                            </TableCell>
                            <TableCell className="text-center font-bold">{o.grade_level || "Any"}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Grading Boundaries tab content */}
        <TabsContent value="boundaries" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Boundary Creator */}
            <Card className="shadow-soft md:col-span-1 border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-bold font-display">Add Grade Boundary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Grade Label</Label>
                  <Input
                    placeholder="e.g. A*, A, B+"
                    value={newGbLabel}
                    onChange={(e) => setNewGbLabel(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Min %</Label>
                    <Input
                      type="number"
                      value={newGbMin}
                      onChange={(e) => setNewGbMin(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max %</Label>
                    <Input
                      type="number"
                      value={newGbMax}
                      onChange={(e) => setNewGbMax(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>GPA Equiv</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={newGbGpa}
                    onChange={(e) => setNewGbGpa(Number(e.target.value))}
                  />
                </div>
                <Button onClick={handleAddBoundary} className="w-full bg-primary text-primary-foreground font-semibold">
                  <Plus className="h-4 w-4 mr-2" /> Add Boundary
                </Button>
              </CardContent>
            </Card>

            {/* Boundary List */}
            <Card className="shadow-soft md:col-span-2 border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-bold font-display">Custom Grade Boundaries</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="font-semibold pl-6">Grade</TableHead>
                      <TableHead className="font-semibold text-center">Percent Range</TableHead>
                      <TableHead className="font-semibold text-center">GPA Equivalent</TableHead>
                      <TableHead className="font-semibold text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {boundaries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">
                          Using school-wide default grade scales. Add custom subject boundaries to override.
                        </TableCell>
                      </TableRow>
                    ) : (
                      boundaries.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium text-foreground pl-6">
                            <Badge variant="outline" className="font-bold border-primary/20 text-primary">
                              {b.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-semibold">
                            {b.min_percentage}% - {b.max_percentage}%
                          </TableCell>
                          <TableCell className="text-center font-medium">
                            {b.gpa_equivalent !== null ? b.gpa_equivalent.toFixed(2) : "-"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={b.is_passing ? "default" : "destructive"}>
                              {b.is_passing ? "Passing" : "Failing"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
