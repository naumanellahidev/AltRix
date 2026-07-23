import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  BookOpenCheck, Layers, Award, Plus, Search, RefreshCw, CheckCircle, GraduationCap
} from "lucide-react";

interface Preset {
  id: string;
  name: string;
  code: string;
  description?: string;
  is_global: boolean;
}

interface Boundary {
  id: string;
  label: string;
  min_percentage: number;
  max_percentage: number;
  gpa_equivalent?: number;
}

export function CurriculumModule() {
  const [activeTab, setActiveTab] = useState("presets");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [boundaries, setBoundaries] = useState<Boundary[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [resPresets, resBoundaries] = await Promise.all([
        apiClient.get("/curriculum/presets"),
        apiClient.get("/curriculum/grade-boundaries")
      ]);
      setPresets(resPresets.data ?? []);
      setBoundaries(resBoundaries.data ?? []);
    } catch {
      setPresets([]);
      setBoundaries([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 text-white rounded-2xl p-6 shadow-lg shadow-blue-500/10 border border-blue-400/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
              <GraduationCap className="h-8 w-8 text-blue-100" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Curriculum & Outcome Standards Engine</h1>
              <p className="text-blue-100 text-sm mt-0.5">Cambridge, Oxford, Single National Curriculum (SNC) presets & GPA grading scales</p>
            </div>
          </div>
          <Button onClick={loadData} className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-md">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh Engine
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Curriculum Presets</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{presets.length} Systems Active</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
              <Award className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Grade Boundaries</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">{boundaries.length} Configured</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
              <BookOpenCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rubric Evaluation</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">Active</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 mb-4">
          <TabsTrigger value="presets" className="data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm font-medium">
            <Layers className="h-4 w-4 mr-2" /> Global & Custom Presets
          </TabsTrigger>
          <TabsTrigger value="boundaries" className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm font-medium">
            <Award className="h-4 w-4 mr-2" /> Grade Boundaries & GPA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="presets">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Layers className="h-5 w-5 text-blue-600" /> Active Educational Frameworks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                    <TableHead>Preset Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {presets.map(p => (
                    <TableRow key={p.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50">
                      <TableCell className="font-bold text-slate-900 dark:text-slate-100">{p.name}</TableCell>
                      <TableCell className="font-mono text-blue-600 dark:text-blue-400">{p.code}</TableCell>
                      <TableCell>{p.is_global ? <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">Global Standard</Badge> : <Badge className="bg-emerald-100 text-emerald-800">School Custom</Badge>}</TableCell>
                      <TableCell><Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Active</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="boundaries">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Award className="h-5 w-5 text-blue-600" /> Grade Scales & Percentile Thresholds
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                    <TableHead>Grade Label</TableHead>
                    <TableHead>Min %</TableHead>
                    <TableHead>Max %</TableHead>
                    <TableHead>GPA Equiv.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {boundaries.map(b => (
                    <TableRow key={b.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50">
                      <TableCell className="font-bold text-blue-700 dark:text-blue-400">{b.label}</TableCell>
                      <TableCell>{b.min_percentage}%</TableCell>
                      <TableCell>{b.max_percentage}%</TableCell>
                      <TableCell className="font-semibold">{b.gpa_equivalent || "N/A"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default CurriculumModule;
