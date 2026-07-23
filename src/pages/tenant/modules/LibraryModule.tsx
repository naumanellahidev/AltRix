import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  BookOpen, Plus, Search, RefreshCw, BookmarkCheck, CheckCircle2,
  AlertCircle, Barcode, Calendar, User, BookMarked, DollarSign, Clock, Hash
} from "lucide-react";

interface LibraryBook {
  id: string;
  title: string;
  author: string;
  isbn?: string;
  barcode?: string;
  category: string;
  publisher?: string;
  publication_year?: number;
  total_copies: number;
  available_copies: number;
  shelf_location?: string;
}

interface BookIssue {
  id: string;
  book_id: string;
  borrower_id: string;
  borrower_type: string;
  issue_date?: string;
  due_date: string;
  return_date?: string;
  fine_amount: number;
  fine_paid: boolean;
  status: string;
}

interface BookReservation {
  id: string;
  book_id: string;
  student_id: string;
  reserved_at?: string;
  status: string;
}

export function LibraryModule() {
  const [activeTab, setActiveTab] = useState("catalog");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Books State
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [showAddBook, setShowAddBook] = useState(false);
  const [newBook, setNewBook] = useState({
    title: "", author: "", isbn: "", barcode: "", category: "General",
    publisher: "", total_copies: 1, available_copies: 1, shelf_location: "Rack A-1"
  });

  // Issue / Return State
  const [issues, setIssues] = useState<BookIssue[]>([]);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [newIssue, setNewIssue] = useState({
    book_id: "", borrower_id: "", borrower_type: "student", due_days: 14
  });

  // Reservations State
  const [reservations, setReservations] = useState<BookReservation[]>([]);

  const loadBooks = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/library/books");
      setBooks(res.data ?? []);
    } catch { setBooks([]); }
    setLoading(false);
  };

  const loadIssues = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/library/issues");
      setIssues(res.data ?? []);
    } catch { setIssues([]); }
    setLoading(false);
  };

  const loadReservations = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/library/reservations");
      setReservations(res.data ?? []);
    } catch { setReservations([]); }
    setLoading(false);
  };

  useEffect(() => {
    loadBooks();
    loadIssues();
    loadReservations();
  }, []);

  const getErrorMessage = (err: any, fallback: string): string => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map((e: any) => e.msg || e.message || "Invalid input").join(", ");
    }
    return fallback;
  };

  const handleAddBook = async () => {
    if (!newBook.title || !newBook.author) {
      toast.error("Please provide book title and author");
      return;
    }
    try {
      await apiClient.post("/library/books", {
        ...newBook,
        available_copies: newBook.total_copies
      });
      toast.success("Book added to catalog");
      setShowAddBook(false);
      setNewBook({ title: "", author: "", isbn: "", barcode: "", category: "General", publisher: "", total_copies: 1, available_copies: 1, shelf_location: "Rack A-1" });
      loadBooks();
    } catch (err: any) {
      toast.error(getErrorMessage(err, "Failed to add book"));
    }
  };

  const handleIssueBook = async () => {
    if (!newIssue.book_id || !newIssue.borrower_id) {
      toast.error("Select a book and provide borrower ID");
      return;
    }
    try {
      await apiClient.post("/library/issue", newIssue);
      toast.success("Book issued successfully");
      setShowIssueModal(false);
      loadBooks();
      loadIssues();
    } catch (err: any) {
      toast.error(getErrorMessage(err, "Failed to issue book"));
    }
  };

  const handleReturnBook = async (issueId: string) => {
    try {
      const res = await apiClient.post(`/library/return/${issueId}`);
      toast.success("Book returned to library", {
        description: res.data.fine_amount > 0 ? `Calculated overdue fine: $${res.data.fine_amount.toFixed(2)}` : undefined
      });
      loadBooks();
      loadIssues();
    } catch (err: any) {
      toast.error(getErrorMessage(err, "Failed to return book"));
    }
  };

  const categories = Array.from(new Set(["General", "Science", "Mathematics", "Fiction", "History", "Literature", ...books.map(b => b.category)]));

  const totalTitles = books.length;
  const totalCopies = books.reduce((acc, b) => acc + (b.total_copies || 0), 0);
  const activeLoans = issues.filter(i => i.status === "issued" || i.status === "overdue").length;
  const overdueCount = issues.filter(i => i.status === "overdue" || (i.status === "issued" && new Date(i.due_date) < new Date())).length;

  return (
    <div className="space-y-6 text-zinc-100">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-950 border-zinc-800/50 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-400">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Catalog Titles</p>
              <p className="text-xl font-bold text-white mt-0.5">{totalTitles}</p>
            </div>
          </div>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800/50 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg border border-violet-500/30 bg-violet-500/5 text-violet-400">
              <Hash className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Total Copies</p>
              <p className="text-xl font-bold text-white mt-0.5">{totalCopies}</p>
            </div>
          </div>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800/50 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-emerald-400">
              <BookMarked className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Active Loans</p>
              <p className="text-xl font-bold text-white mt-0.5">{activeLoans}</p>
            </div>
          </div>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800/50 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-400">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Overdue Fines</p>
              <p className="text-xl font-bold text-amber-400 mt-0.5">{overdueCount}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs Bar */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="catalog" className="data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400">
              <BookOpen className="h-4 w-4 mr-2" /> Book Catalog
            </TabsTrigger>
            <TabsTrigger value="issues" className="data-[state=active]:bg-violet-500/10 data-[state=active]:text-violet-400">
              <BookMarked className="h-4 w-4 mr-2" /> Book Issues & Returns
            </TabsTrigger>
            <TabsTrigger value="reservations" className="data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400">
              <BookmarkCheck className="h-4 w-4 mr-2" /> Queue & Reservations
            </TabsTrigger>
          </TabsList>
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Search Title, Author, ISBN..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 w-64 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-cyan-500/30"
              />
            </div>
            <Button variant="outline" onClick={() => { loadBooks(); loadIssues(); loadReservations(); }}
              className="border-zinc-800 bg-zinc-950/60 text-zinc-200 hover:bg-cyan-500/10 hover:text-cyan-300">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ─── Catalog Tab ──────────────────────────────────── */}
        <TabsContent value="catalog">
          <Card className="bg-zinc-950 border-zinc-800/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-cyan-400" /> Library Book Catalog
              </CardTitle>
              <Dialog open={showAddBook} onOpenChange={setShowAddBook}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-zinc-950 font-bold">
                    <Plus className="h-4 w-4 mr-2" /> Add New Book
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-white">Add Book to Catalog</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 mt-3">
                    <div>
                      <Label className="text-zinc-400 text-xs">Book Title</Label>
                      <Input value={newBook.title} onChange={e => setNewBook(p => ({ ...p, title: e.target.value }))}
                        className="bg-zinc-900 border-zinc-800 text-white" placeholder="Principles of Physics" />
                    </div>
                    <div>
                      <Label className="text-zinc-400 text-xs">Author Name</Label>
                      <Input value={newBook.author} onChange={e => setNewBook(p => ({ ...p, author: e.target.value }))}
                        className="bg-zinc-900 border-zinc-800 text-white" placeholder="Halliday & Resnick" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-zinc-400 text-xs">Category</Label>
                        <Select value={newBook.category} onValueChange={v => setNewBook(p => ({ ...p, category: v }))}>
                          <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-zinc-400 text-xs">Shelf Location</Label>
                        <Input value={newBook.shelf_location} onChange={e => setNewBook(p => ({ ...p, shelf_location: e.target.value }))}
                          className="bg-zinc-900 border-zinc-800 text-white" placeholder="Rack A-3" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-zinc-400 text-xs">Barcode / Acc #</Label>
                        <Input value={newBook.barcode} onChange={e => setNewBook(p => ({ ...p, barcode: e.target.value }))}
                          className="bg-zinc-900 border-zinc-800 text-white" placeholder="LIB-10023" />
                      </div>
                      <div>
                        <Label className="text-zinc-400 text-xs">Total Copies</Label>
                        <Input type="number" value={newBook.total_copies} onChange={e => setNewBook(p => ({ ...p, total_copies: parseInt(e.target.value) || 1 }))}
                          className="bg-zinc-900 border-zinc-800 text-white" />
                      </div>
                    </div>
                    <Button onClick={handleAddBook} className="w-full bg-gradient-to-r from-cyan-500 to-cyan-600 text-zinc-950 font-bold mt-2">
                      Add to Catalog
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Barcode</TableHead>
                    <TableHead className="text-zinc-400">Title & Author</TableHead>
                    <TableHead className="text-zinc-400">Category</TableHead>
                    <TableHead className="text-zinc-400">Location</TableHead>
                    <TableHead className="text-zinc-400">Availability</TableHead>
                    <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {books.length === 0 ? (
                    <TableRow className="border-zinc-800">
                      <TableCell colSpan={6} className="text-center text-zinc-500 py-12">
                        <BookOpen className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
                        <p className="text-sm">No books registered in library catalog yet</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    books.filter(b => !search || b.title.toLowerCase().includes(search.toLowerCase()) || b.author.toLowerCase().includes(search.toLowerCase())).map(b => (
                      <TableRow key={b.id} className="border-zinc-800 hover:bg-zinc-900/50">
                        <TableCell className="font-mono text-xs font-bold text-cyan-400">{b.barcode || "—"}</TableCell>
                        <TableCell>
                          <p className="font-semibold text-white">{b.title}</p>
                          <p className="text-xs text-zinc-400">by {b.author}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-300">
                            {b.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-zinc-400 text-xs font-mono">{b.shelf_location || "Unassigned"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${
                            b.available_copies > 0 ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" : "border-red-500/20 text-red-400 bg-red-500/5"
                          }`}>
                            {b.available_copies} / {b.total_copies} available
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => { setNewIssue(p => ({ ...p, book_id: b.id })); setShowIssueModal(true); }}
                            disabled={b.available_copies <= 0}
                            className="h-7 text-[10px] font-bold border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10">
                            Issue Book
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Issues & Returns Tab ─────────────────────────── */}
        <TabsContent value="issues">
          <Card className="bg-zinc-950 border-zinc-800/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <BookMarked className="h-5 w-5 text-violet-400" /> Active Circulation Ledger
              </CardTitle>
              <Button onClick={() => setShowIssueModal(true)} className="bg-gradient-to-r from-violet-500 to-violet-600 text-white font-bold">
                <Plus className="h-4 w-4 mr-2" /> New Loan Issue
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800">
                    <TableHead className="text-zinc-400">Borrower ID</TableHead>
                    <TableHead className="text-zinc-400">Type</TableHead>
                    <TableHead className="text-zinc-400">Issue Date</TableHead>
                    <TableHead className="text-zinc-400">Due Date</TableHead>
                    <TableHead className="text-zinc-400">Fine</TableHead>
                    <TableHead className="text-zinc-400">Status</TableHead>
                    <TableHead className="text-zinc-400 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues.length === 0 ? (
                    <TableRow className="border-zinc-800">
                      <TableCell colSpan={7} className="text-center text-zinc-500 py-12">
                        <BookMarked className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
                        <p className="text-sm">No book loan records active</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    issues.map(iss => {
                      const isOverdue = new Date(iss.due_date) < new Date() && iss.status !== "returned";
                      return (
                        <TableRow key={iss.id} className="border-zinc-800 hover:bg-zinc-900/50">
                          <TableCell className="font-mono text-xs font-bold text-white">{iss.borrower_id}</TableCell>
                          <TableCell className="capitalize text-xs text-zinc-300">{iss.borrower_type}</TableCell>
                          <TableCell className="text-xs text-zinc-400">{iss.issue_date}</TableCell>
                          <TableCell className={`text-xs font-mono font-bold ${isOverdue ? "text-red-400" : "text-zinc-300"}`}>
                            {iss.due_date}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-amber-400">
                            {iss.fine_amount > 0 ? `$${iss.fine_amount.toFixed(2)}` : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${
                              iss.status === "returned" ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" :
                              isOverdue ? "border-red-500/20 text-red-400 bg-red-500/5" :
                              "border-violet-500/20 text-violet-400 bg-violet-500/5"
                            }`}>
                              {iss.status === "returned" ? "Returned" : isOverdue ? "Overdue" : "Issued"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {iss.status !== "returned" && (
                              <Button size="sm" variant="outline" onClick={() => handleReturnBook(iss.id)}
                                className="h-7 text-[10px] font-bold border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                                Return Book
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Queue & Reservations Tab ─────────────────────── */}
        <TabsContent value="reservations">
          <Card className="bg-zinc-950 border-zinc-800/50">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <BookmarkCheck className="h-5 w-5 text-emerald-400" /> Book Reservation Queue
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reservations.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <BookmarkCheck className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
                  <p className="text-sm">No book reservations pending</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800">
                      <TableHead className="text-zinc-400">Student ID</TableHead>
                      <TableHead className="text-zinc-400">Reserved Date</TableHead>
                      <TableHead className="text-zinc-400">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reservations.map(r => (
                      <TableRow key={r.id} className="border-zinc-800">
                        <TableCell className="font-mono text-xs text-white">{r.student_id}</TableCell>
                        <TableCell className="text-xs text-zinc-400">{r.reserved_at ? new Date(r.reserved_at).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] border-emerald-500/20 text-emerald-400">
                            {r.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Issue Modal */}
      <Dialog open={showIssueModal} onOpenChange={setShowIssueModal}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Issue Book Loan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-3">
            <div>
              <Label className="text-zinc-400 text-xs">Select Book</Label>
              <Select value={newIssue.book_id} onValueChange={v => setNewIssue(p => ({ ...p, book_id: v }))}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectValue placeholder="Choose available book" />
                </SelectTrigger>
                <SelectContent>
                  {books.filter(b => b.available_copies > 0).map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.title} (Acc #{b.barcode || b.id.slice(0, 4)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Borrower Profile/Student ID</Label>
              <Input value={newIssue.borrower_id} onChange={e => setNewIssue(p => ({ ...p, borrower_id: e.target.value }))}
                className="bg-zinc-900 border-zinc-800 text-white" placeholder="Enter Student or Staff UUID" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs">Borrower Type</Label>
                <Select value={newIssue.borrower_type} onValueChange={v => setNewIssue(p => ({ ...p, borrower_type: v }))}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Loan Duration (Days)</Label>
                <Input type="number" value={newIssue.due_days} onChange={e => setNewIssue(p => ({ ...p, due_days: parseInt(e.target.value) || 14 }))}
                  className="bg-zinc-900 border-zinc-800 text-white" />
              </div>
            </div>
            <Button onClick={handleIssueBook} className="w-full bg-gradient-to-r from-violet-500 to-violet-600 text-white font-bold mt-2">
              Confirm Loan Issue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LibraryModule;
