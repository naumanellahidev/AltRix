import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  BookOpen, Plus, Search, RefreshCw, BookmarkCheck, Clock, CheckCircle2,
  AlertTriangle, UserCheck, ShieldAlert, Library
} from "lucide-react";

interface Book {
  id: string;
  title: string;
  author: string;
  isbn?: string;
  barcode?: string;
  category: string;
  total_copies: number;
  available_copies: number;
  shelf_location?: string;
}

interface Issue {
  id: string;
  book_id: string;
  borrower_id: string;
  borrower_type: string;
  issue_date: string;
  due_date: string;
  return_date?: string;
  fine_amount: number;
  status: string;
}

interface BookReservation {
  id: string;
  book_id: string;
  student_id: string;
  reserved_at: string;
  status: string;
}

export function LibraryModule() {
  const [books, setBooks] = useState<Book[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("catalog");

  const [showAddBook, setShowAddBook] = useState(false);
  const [newBook, setNewBook] = useState({
    title: "", author: "", isbn: "", barcode: "", category: "General", publisher: "", total_copies: 1, available_copies: 1, shelf_location: "Rack A-1"
  });

  const [showIssueModal, setShowIssueModal] = useState(false);
  const [newIssue, setNewIssue] = useState({
    book_id: "", borrower_id: "", borrower_type: "student", due_days: 14
  });

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
        description: res.data.fine_amount > 0 ? `Calculated overdue fine: PKR ${res.data.fine_amount.toFixed(2)}` : undefined
      });
      loadBooks();
      loadIssues();
    } catch (err: any) {
      toast.error(getErrorMessage(err, "Failed to return book"));
    }
  };

  const filteredBooks = books.filter(b =>
    b.title.toLowerCase().includes(search.toLowerCase()) ||
    b.author.toLowerCase().includes(search.toLowerCase()) ||
    b.category.toLowerCase().includes(search.toLowerCase())
  );

  const totalTitles = books.length;
  const totalCopies = books.reduce((acc, b) => acc + (b.total_copies || 0), 0);
  const activeLoans = issues.filter(i => i.status === "issued" || i.status === "overdue").length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 text-white rounded-2xl p-6 shadow-lg shadow-blue-500/10 border border-blue-400/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
              <Library className="h-8 w-8 text-blue-100" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Library & Resource Catalog</h1>
              <p className="text-blue-100 text-sm mt-0.5">Manage book catalog, loans, fines, reservations & digital barcode tracking</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowIssueModal(true)} variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border border-white/20">
              <UserCheck className="h-4 w-4 mr-2" /> Issue Book
            </Button>
            <Button onClick={() => setShowAddBook(true)} className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-md">
              <Plus className="h-4 w-4 mr-2" /> Add Book
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Catalog Titles</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{totalTitles} ({totalCopies} Copies)</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Book Loans</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">{activeLoans} Issued</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
              <BookmarkCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Reservations</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{reservations.length} Pending</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
            <TabsTrigger value="catalog" className="data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm font-medium">
              <BookOpen className="h-4 w-4 mr-2" /> Book Catalog
            </TabsTrigger>
            <TabsTrigger value="issues" className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm font-medium">
              <Clock className="h-4 w-4 mr-2" /> Active Loans & Returns
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Search Title, Author, Category..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 w-64 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus-visible:ring-blue-500" />
            </div>
            <Button variant="outline" onClick={() => { loadBooks(); loadIssues(); }} className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ─── Book Catalog Tab ───────────────────────────── */}
        <TabsContent value="catalog">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-blue-600" /> Master Book Inventory
              </CardTitle>
              <Button onClick={() => setShowAddBook(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">
                <Plus className="h-4 w-4 mr-2" /> Add Book to Catalog
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              {filteredBooks.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <BookOpen className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">No Books Found in Catalog</p>
                  <p className="text-xs text-slate-500 mt-1">Click "Add Book to Catalog" to populate your library inventory.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                      <TableHead>Title & Author</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Shelf Location</TableHead>
                      <TableHead>Available Copies</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBooks.map(b => (
                      <TableRow key={b.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50">
                        <TableCell>
                          <p className="font-bold text-slate-900 dark:text-slate-100">{b.title}</p>
                          <p className="text-xs text-slate-500">by {b.author}</p>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">{b.category}</Badge></TableCell>
                        <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-400">{b.shelf_location || "Unassigned"}</TableCell>
                        <TableCell className="font-semibold">{b.available_copies} / {b.total_copies}</TableCell>
                        <TableCell>
                          <Button size="sm" onClick={() => { setNewIssue({ ...newIssue, book_id: b.id }); setShowIssueModal(true); }}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
                            Issue Book
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Active Loans Tab ──────────────────────────── */}
        <TabsContent value="issues">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" /> Active Circulation & Overdue Loans
              </CardTitle>
            </CardHeader>
            <CardContent>
              {issues.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <p>No active book circulation records found.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                      <TableHead>Borrower ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Issue Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {issues.map(i => (
                      <TableRow key={i.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50">
                        <TableCell className="font-bold text-slate-900 dark:text-slate-100">{i.borrower_id}</TableCell>
                        <TableCell className="capitalize">{i.borrower_type}</TableCell>
                        <TableCell>{i.issue_date}</TableCell>
                        <TableCell className="font-semibold text-blue-700 dark:text-blue-400">{i.due_date}</TableCell>
                        <TableCell>
                          {i.status === "returned" ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Returned</Badge>
                          ) : (
                            <Badge className="bg-blue-100 text-blue-800 border-blue-200">Issued</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {i.status !== "returned" && (
                            <Button size="sm" onClick={() => handleReturnBook(i.id)} variant="outline" className="border-slate-300">
                              Return Book
                            </Button>
                          )}
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

      {/* Dialogs */}
      <Dialog open={showAddBook} onOpenChange={setShowAddBook}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold">Add New Book to Library</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Book Title</Label>
              <Input value={newBook.title} onChange={e => setNewBook({ ...newBook, title: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Author</Label>
              <Input value={newBook.author} onChange={e => setNewBook({ ...newBook, author: e.target.value })} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Input value={newBook.category} onChange={e => setNewBook({ ...newBook, category: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Copies</Label>
                <Input type="number" value={newBook.total_copies} onChange={e => setNewBook({ ...newBook, total_copies: parseInt(e.target.value) || 1 })} className="mt-1" />
              </div>
            </div>
            <Button onClick={handleAddBook} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">Save to Catalog</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showIssueModal} onOpenChange={setShowIssueModal}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold">Issue Book to Borrower</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Select Book</Label>
              <Select value={newIssue.book_id} onValueChange={val => setNewIssue({ ...newIssue, book_id: val })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose Book..." />
                </SelectTrigger>
                <SelectContent>
                  {books.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.title} (Available: {b.available_copies})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Borrower ID / Roll Number</Label>
              <Input placeholder="Enter Student ID or Staff ID" value={newIssue.borrower_id} onChange={e => setNewIssue({ ...newIssue, borrower_id: e.target.value })} className="mt-1" />
            </div>
            <Button onClick={handleIssueBook} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">Confirm Issue</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
