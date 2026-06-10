import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Calendar, Star } from "lucide-react";

export function HrReviewsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);
  const qc = useQueryClient();

  const [cycleOpen, setCycleOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [cycleForm, setCycleForm] = useState({ name: "", period_start: "", period_end: "", notes: "" });
  const [reviewForm, setReviewForm] = useState({ user_id: "", review_date: new Date().toISOString().slice(0, 10), rating: "3", comments: "", status: "draft" });

  const { data: cycles = [] } = useQuery({
    queryKey: ["hr_performance_cycles", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_performance_cycles").select("*").eq("school_id", schoolId!).order("period_start", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["hr_reviews", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_reviews").select("*").eq("school_id", schoolId!).order("review_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["hr_staff_dir_reviews", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_school_staff_directory", { _school_id: schoolId! });
      if (error) throw error;
      return data || [];
    },
  });

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    (staff as any[]).forEach((s) => m.set(s.user_id, s.display_name || s.email));
    return m;
  }, [staff]);

  const createCycle = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hr_performance_cycles").insert({
        school_id: schoolId,
        name: cycleForm.name,
        period_start: cycleForm.period_start,
        period_end: cycleForm.period_end,
        status: "active",
        notes: cycleForm.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cycle created");
      qc.invalidateQueries({ queryKey: ["hr_performance_cycles"] });
      setCycleOpen(false);
      setCycleForm({ name: "", period_start: "", period_end: "", notes: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createReview = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase.from("hr_reviews").insert({
        school_id: schoolId,
        user_id: reviewForm.user_id,
        reviewer_id: user?.id,
        review_date: reviewForm.review_date,
        rating: Number(reviewForm.rating),
        comments: reviewForm.comments || null,
        status: reviewForm.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Review saved");
      qc.invalidateQueries({ queryKey: ["hr_reviews"] });
      setReviewOpen(false);
      setReviewForm({ user_id: "", review_date: new Date().toISOString().slice(0, 10), rating: "3", comments: "", status: "draft" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Performance Reviews</h1>
      </div>

      <Tabs defaultValue="reviews">
        <TabsList>
          <TabsTrigger value="reviews">Reviews ({reviews.length})</TabsTrigger>
          <TabsTrigger value="cycles">Cycles ({cycles.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="reviews" className="space-y-4 mt-4">
          <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New Review</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Review</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Employee</Label>
                  <Select value={reviewForm.user_id} onValueChange={(v) => setReviewForm({ ...reviewForm, user_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{(staff as any[]).map((s) => (<SelectItem key={s.user_id} value={s.user_id}>{s.display_name || s.email}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div><Label>Review Date</Label><Input type="date" value={reviewForm.review_date} onChange={(e) => setReviewForm({ ...reviewForm, review_date: e.target.value })} /></div>
                <div><Label>Rating (1-5)</Label>
                  <Select value={reviewForm.rating} onValueChange={(v) => setReviewForm({ ...reviewForm, rating: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{[1, 2, 3, 4, 5].map((n) => (<SelectItem key={n} value={String(n)}>{n}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div><Label>Comments</Label><Textarea value={reviewForm.comments} onChange={(e) => setReviewForm({ ...reviewForm, comments: e.target.value })} /></div>
                <div><Label>Status</Label>
                  <Select value={reviewForm.status} onValueChange={(v) => setReviewForm({ ...reviewForm, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="acknowledged">Acknowledged</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter><Button onClick={() => createReview.mutate()} disabled={!reviewForm.user_id || createReview.isPending}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="space-y-2">
            {reviews.length === 0 && <p className="text-sm text-muted-foreground">No reviews yet.</p>}
            {reviews.map((r: any) => (
              <Card key={r.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{nameById.get(r.user_id) || r.user_id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{r.review_date}</p>
                    {r.comments && <p className="text-sm mt-1">{r.comments}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-amber-500">
                      {Array.from({ length: 5 }).map((_, i) => (<Star key={i} className={`h-4 w-4 ${i < Math.round(Number(r.rating || 0)) ? "fill-current" : "opacity-30"}`} />))}
                    </div>
                    <Badge variant="outline" className="capitalize">{r.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="cycles" className="space-y-4 mt-4">
          <Dialog open={cycleOpen} onOpenChange={setCycleOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New Cycle</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Performance Cycle</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={cycleForm.name} onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })} placeholder="Q1 2026" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Start</Label><Input type="date" value={cycleForm.period_start} onChange={(e) => setCycleForm({ ...cycleForm, period_start: e.target.value })} /></div>
                  <div><Label>End</Label><Input type="date" value={cycleForm.period_end} onChange={(e) => setCycleForm({ ...cycleForm, period_end: e.target.value })} /></div>
                </div>
                <div><Label>Notes</Label><Textarea value={cycleForm.notes} onChange={(e) => setCycleForm({ ...cycleForm, notes: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={() => createCycle.mutate()} disabled={!cycleForm.name || !cycleForm.period_start || !cycleForm.period_end || createCycle.isPending}>Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="space-y-2">
            {cycles.length === 0 && <p className="text-sm text-muted-foreground">No cycles defined.</p>}
            {cycles.map((c: any) => (
              <Card key={c.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium flex items-center gap-2"><Calendar className="h-4 w-4" />{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.period_start} → {c.period_end}</p>
                    {c.notes && <p className="text-sm mt-1">{c.notes}</p>}
                  </div>
                  <Badge variant={c.status === "active" ? "default" : "outline"} className="capitalize">{c.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
