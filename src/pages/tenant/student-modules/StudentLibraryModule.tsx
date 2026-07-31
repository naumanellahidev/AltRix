import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BookOpen, Search, Clock, CheckCircle2, Bookmark, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

export function StudentLibraryModule({ myStudent, schoolId }: { myStudent?: any; schoolId?: string | null }) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"my_books" | "catalog">("my_books");

  // Mock / DB student loans state
  const [myLoans, setMyLoans] = useState([
    { id: "1", title: "Fundamentals of Physics 11th Ed.", author: "Halliday & Resnick", issue_date: "2026-07-15", due_date: "2026-08-05", status: "issued", code: "PHY-101-A" },
    { id: "2", title: "Calculus & Analytical Geometry", author: "George B. Thomas", issue_date: "2026-07-10", due_date: "2026-07-28", status: "overdue", code: "MATH-202-B" },
  ]);

  const [catalog, setCatalog] = useState([
    { id: "c1", title: "Organic Chemistry Principles", author: "Paula Yurkanis Bruice", category: "Science", available: true, copies: 4, isbn: "978-0134042220" },
    { id: "c2", title: "Introduction to Algorithms", author: "Cormen, Leiserson, Rivest", category: "Computer Science", available: true, copies: 2, isbn: "978-0262033848" },
    { id: "c3", title: "World History: Patterns of Interaction", author: "Roger B. Beck", category: "Social Studies", available: false, copies: 0, isbn: "978-0547491127" },
    { id: "c4", title: "English Grammar in Use", author: "Raymond Murphy", category: "English", available: true, copies: 6, isbn: "978-1108457651" }
  ]);

  const handleReserve = (title: string) => {
    toast.success(`Book reservation request submitted for "${title}"!`, {
      description: "The librarian will notify you when it's ready for collection."
    });
  };

  const filteredCatalog = catalog.filter(b => 
    b.title.toLowerCase().includes(search.toLowerCase()) || 
    b.author.toLowerCase().includes(search.toLowerCase()) ||
    b.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-700 text-white rounded-2xl p-6 shadow-lg border border-blue-400/20">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
            <BookOpen className="h-8 w-8 text-blue-100" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Student Library Desk</h1>
            <p className="text-blue-100 text-sm mt-0.5">Track your issued books, due dates, reserve catalog titles, and view overdue status.</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <Button 
          variant={activeTab === "my_books" ? "default" : "ghost"} 
          onClick={() => setActiveTab("my_books")}
          className="font-semibold"
        >
          <BookOpen className="h-4 w-4 mr-2" /> My Issued Books ({myLoans.length})
        </Button>
        <Button 
          variant={activeTab === "catalog" ? "default" : "ghost"} 
          onClick={() => setActiveTab("catalog")}
          className="font-semibold"
        >
          <Search className="h-4 w-4 mr-2" /> Search Library Catalog
        </Button>
      </div>

      {activeTab === "my_books" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {myLoans.map(loan => (
            <Card key={loan.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <Badge variant="outline" className="text-[10px] font-mono mb-1">{loan.code}</Badge>
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base leading-tight">{loan.title}</h3>
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
                    <span className="text-slate-400 font-medium">Return Due Date:</span>
                    <p className={`font-bold ${loan.status === "overdue" ? "text-rose-600" : "text-slate-900 dark:text-slate-100"}`}>{loan.due_date}</p>
                  </div>
                </div>

                {loan.status === "overdue" && (
                  <p className="text-xs text-rose-600 font-medium bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-lg border border-rose-200/50">
                    * Please return this book to the library desk to avoid overdue fine charges.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search books by title, author, or subject category..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 h-10 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredCatalog.map(book => (
              <Card key={book.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <Badge variant="secondary" className="text-[10px] mb-1.5">{book.category}</Badge>
                    <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{book.title}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">By {book.author}</p>
                  </div>
                  <Button 
                    disabled={!book.available} 
                    onClick={() => handleReserve(book.title)}
                    size="sm"
                    className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                  >
                    <Bookmark className="h-3.5 w-3.5 mr-1" /> Reserve
                  </Button>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-400 border-t pt-2 border-slate-100 dark:border-slate-800">
                  <span>ISBN: {book.isbn}</span>
                  <span className={book.available ? "text-emerald-600 font-semibold" : "text-rose-500 font-semibold"}>
                    {book.available ? `${book.copies} Copies Available` : "Out of Stock"}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default StudentLibraryModule;
