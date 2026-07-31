import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, CheckCircle2, AlertCircle, Calendar } from "lucide-react";

export function ParentLibraryModule({ child }: { child?: any }) {
  const [childLoans] = useState([
    { id: "1", title: "Fundamentals of Physics 11th Ed.", author: "Halliday & Resnick", issue_date: "2026-07-15", due_date: "2026-08-05", status: "issued", code: "PHY-101-A" },
    { id: "2", title: "Calculus & Analytical Geometry", author: "George B. Thomas", issue_date: "2026-07-10", due_date: "2026-07-28", status: "overdue", code: "MATH-202-B" },
  ]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-700 text-white rounded-2xl p-6 shadow-lg border border-blue-400/20">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
            <BookOpen className="h-8 w-8 text-blue-100" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Parent Library Desk</h1>
            <p className="text-blue-100 text-sm mt-0.5">
              View books issued to <span className="font-semibold text-white">{child?.full_name || "your child"}</span>, return due dates, and fine status.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {childLoans.map(loan => (
          <Card key={loan.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <Badge variant="outline" className="text-[10px] font-mono mb-1">{loan.code}</Badge>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">{loan.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Author: {loan.author}</p>
              </div>
              {loan.status === "overdue" ? (
                <Badge className="bg-rose-100 text-rose-800 border-rose-200 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Overdue
                </Badge>
              ) : (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Active Loan
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl">
              <div>
                <span className="text-slate-400 font-medium">Issue Date:</span>
                <p className="font-semibold text-slate-700 dark:text-slate-300">{loan.issue_date}</p>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Due Date:</span>
                <p className={`font-bold ${loan.status === "overdue" ? "text-rose-600" : "text-slate-900 dark:text-slate-100"}`}>{loan.due_date}</p>
              </div>
            </div>

            {loan.status === "overdue" && (
              <p className="text-xs text-rose-600 font-medium bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-lg border border-rose-200/50">
                * Please remind your child to return this book to avoid daily library fine accruals.
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

export default ParentLibraryModule;
