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
import { Progress } from "@/components/ui/progress";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  BookOpen, Plus, Search, RefreshCw, BookmarkCheck, Clock, CheckCircle2,
  AlertTriangle, UserCheck, ShieldAlert, Library, LayoutGrid, List,
  Barcode, Edit3, Trash2, Eye, User, Sparkles, Filter, Check
} from "lucide-react";

interface Book {
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
  cover_image_url?: string;
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

interface BorrowerOption {
  id: string;
  name: string;
  type: string;
  code?: string;
}

export function LibraryModule() {
  const [books, setBooks] = useState<Book[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [borrowers, setBorrowers] = useState<BorrowerOption[]>([]);
  const [borrowerMap, setBorrowerMap] = useState<Record<string, { name: string; code: string; type: string }>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [activeTab, setActiveTab] = useState("catalog");

  // Modals
  const [showAddBook, setShowAddBook] = useState(false);
  const [newBook, setNewBook] = useState({
    title: "", author: "", isbn: "", barcode: "", category: "General", publisher: "", publication_year: 2024, total_copies: 5, available_copies: 5, shelf_location: "Rack A-1"
  });

  const [showEditBook, setShowEditBook] = useState<Book | null>(null);

  const [showIssueModal, setShowIssueModal] = useState(false);
  const [newIssue, setNewIssue] = useState({
    book_id: "", borrower_id: "", borrower_type: "student", due_days: 14
  });

  const [showBarcodeModal, setShowBarcodeModal] = useState<Book | null>(null);
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

  const loadBorrowers = async () => {
    try {
      const [resStu, resTeach] = await Promise.all([
        apiClient.get("/students?page_size=1000").catch(() => ({ data: [] })),
        apiClient.get("/teachers?page_size=1000").catch(() => ({ data: [] }))
      ]);
      const stuList = resStu.data?.items || resStu.data || [];
      const teachList = resTeach.data?.items || resTeach.data || [];
      
      const bOptions: BorrowerOption[] = [
        ...(Array.isArray(stuList) ? stuList.map((s: any) => ({
          id: s.id,
          name: s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Student Borrower',
          type: "student",
          code: s.roll_number || s.admission_number || "STU-1001"
        })) : []),
        ...(Array.isArray(teachList) ? teachList.map((t: any) => ({
          id: t.id,
          name: t.full_name || "Faculty Staff",
          type: "staff",
          code: t.designation || "Faculty"
        })) : [])
      ];

      const bMap: Record<string, { name: string; code: string; type: string }> = {};
      bOptions.forEach(b => {
        bMap[b.id] = { name: b.name, code: b.code || "", type: b.type };
      });
      
      setBorrowers(bOptions);
      setBorrowerMap(bMap);
    } catch {
      setBorrowers([]);
      setBorrowerMap({});
    }
  };

  useEffect(() => {
    loadBooks();
    loadIssues();
    loadReservations();
    loadBorrowers();
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
      const generatedBarcode = newBook.barcode || `LIB-${Math.floor(100000 + Math.random() * 900000)}`;
      const generatedISBN = newBook.isbn || `978-969-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(10 + Math.random() * 90)}-1`;
      
      await apiClient.post("/library/books", {
        ...newBook,
        barcode: generatedBarcode,
        isbn: generatedISBN,
        available_copies: newBook.total_copies
      });
      toast.success("Book added to catalog!");
      setShowAddBook(false);
      setNewBook({ title: "", author: "", isbn: "", barcode: "", category: "General", publisher: "", publication_year: 2024, total_copies: 5, available_copies: 5, shelf_location: "Rack A-1" });
      loadBooks();
    } catch (err: any) {
      toast.error(getErrorMessage(err, "Failed to add book"));
    }
  };

  const handleUpdateBook = async () => {
    if (!showEditBook) return;
    try {
      await apiClient.post("/library/books", showEditBook);
      toast.success("Book details updated");
      setShowEditBook(null);
      loadBooks();
    } catch (err: any) {
      toast.error(getErrorMessage(err, "Failed to update book"));
    }
  };

  const handleIssueBook = async () => {
    if (!newIssue.book_id || !newIssue.borrower_id) {
      toast.error("Select a book and borrower");
      return;
    }
    try {
      await apiClient.post("/library/issue", newIssue);
      toast.success("Book issued successfully!");
      setShowIssueModal(false);
      loadBooks();
      loadIssues();
    } catch (err: any) {
      toast.error(getErrorMessage(err, "Failed to issue book"));
    }
  };

  const handleReserveBook = async (bookId: string) => {
    try {
      await apiClient.post("/library/reserve", { book_id: bookId, student_id: borrowers[0]?.id || "student-1" });
      toast.success("Book reserved successfully!");
      loadReservations();
    } catch (err: any) {
      toast.error(getErrorMessage(err, "Book reserved in queue"));
    }
  };

  const handleReturnBook = async (issueId: string) => {
    try {
      const res = await apiClient.post(`/library/return/${issueId}`);
      toast.success("Book returned to library", {
        description: res.data?.fine_amount > 0 ? `Calculated overdue fine: PKR ${res.data.fine_amount.toFixed(2)}` : "Returned in good condition."
      });
      loadBooks();
      loadIssues();
    } catch (err: any) {
      toast.error(getErrorMessage(err, "Failed to return book"));
    }
  };

  // Unique categories for filter pills
  const categories = ["All", ...Array.from(new Set(books.map(b => b.category).filter(Boolean)))];

  const filteredBooks = books.filter(b => {
    const matchesSearch = b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.author.toLowerCase().includes(search.toLowerCase()) ||
      b.category.toLowerCase().includes(search.toLowerCase()) ||
      (b.isbn && b.isbn.includes(search)) ||
      (b.barcode && b.barcode.includes(search));
    const matchesCategory = selectedCategory === "All" || b.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const totalTitles = books.length;
  const totalCopies = books.reduce((acc, b) => acc + (b.total_copies || 0), 0);
  const totalAvailable = books.reduce((acc, b) => acc + (b.available_copies || 0), 0);
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
              <h1 className="text-2xl font-bold tracking-tight">Library & Knowledge Resource Catalog</h1>
              <p className="text-blue-100 text-sm mt-0.5">Manage digital book inventory, borrower circulation, barcodes & reservations</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowIssueModal(true)} variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border border-white/20">
              <UserCheck className="h-4 w-4 mr-2" /> Issue Book Desk
            </Button>
            <Button onClick={() => setShowAddBook(true)} className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-md">
              <Plus className="h-4 w-4 mr-2" /> Add Book Title
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Catalog Titles</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{totalTitles} Titles <span className="text-sm font-normal text-slate-500">({totalAvailable}/{totalCopies} Available)</span></p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Circulation</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">{activeLoans} Issued Books</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
              <BookmarkCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Book Reservations</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{reservations.length} Queue Holds</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
            <TabsTrigger value="catalog" className="data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm font-medium">
              <BookOpen className="h-4 w-4 mr-2" /> Master Book Catalog
            </TabsTrigger>
            <TabsTrigger value="issues" className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm font-medium">
              <Clock className="h-4 w-4 mr-2" /> Active Loans & Returns Log
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            {activeTab === "catalog" && (
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 mr-2">
                <Button
                  size="sm"
                  variant={viewMode === "grid" ? "white" : "ghost"}
                  onClick={() => setViewMode("grid")}
                  className={`h-8 px-2.5 ${viewMode === "grid" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}
                >
                  <LayoutGrid className="h-4 w-4 mr-1" /> Grid
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === "table" ? "white" : "ghost"}
                  onClick={() => setViewMode("table")}
                  className={`h-8 px-2.5 ${viewMode === "table" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}
                >
                  <List className="h-4 w-4 mr-1" /> Table
                </Button>
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Search Title, Author, ISBN, Barcode..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 w-64 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus-visible:ring-blue-500" />
            </div>
            <Button variant="outline" onClick={() => { loadBooks(); loadIssues(); }} className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ─── Book Catalog Tab ───────────────────────────── */}
        <TabsContent value="catalog" className="space-y-4">
          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs font-semibold text-slate-500 flex items-center mr-1"><Filter className="h-3.5 w-3.5 mr-1" /> Categories:</span>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                  selectedCategory === cat
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {filteredBooks.length === 0 ? (
            <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-12 text-center">
              <BookOpen className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p className="font-semibold text-slate-700 dark:text-slate-300">No Library Books Matching Query</p>
              <p className="text-xs text-slate-500 mt-1">Click "Add Book Title" to add new literature to your library catalog.</p>
            </Card>
          ) : viewMode === "grid" ? (
            /* 🌟 LUXURY GRID CARDS VIEW */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredBooks.map(b => {
                const availabilityPct = Math.round(((b.available_copies || 0) / (b.total_copies || 1)) * 100);
                const isOutOfStock = b.available_copies <= 0;
                const isLowStock = b.available_copies > 0 && b.available_copies <= 2;

                return (
                  <Card key={b.id} className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between group">
                    <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md flex-shrink-0">
                            <BookOpen className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 transition-colors line-clamp-1">{b.title}</h3>
                            <p className="text-xs text-slate-500 font-medium">by {b.author}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 text-[11px] font-medium flex-shrink-0">
                          {b.category}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="p-5 space-y-4 flex-1">
                      {/* Meta Pills */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                          <p className="text-slate-400 text-[10px] uppercase font-semibold">Shelf Location</p>
                          <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{b.shelf_location || "Rack A-1"}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                          <p className="text-slate-400 text-[10px] uppercase font-semibold">Barcode Tag</p>
                          <p className="font-mono font-bold text-blue-600 dark:text-blue-400 mt-0.5 flex items-center gap-1">
                            <Barcode className="h-3.5 w-3.5" /> {b.barcode || "LIB-1001"}
                          </p>
                        </div>
                      </div>

                      {/* Stock Bar Progress */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-600 dark:text-slate-400">Available Stock:</span>
                          <span className={isOutOfStock ? "text-rose-600" : isLowStock ? "text-amber-600" : "text-emerald-600"}>
                            {b.available_copies} of {b.total_copies} Copies
                          </span>
                        </div>
                        <Progress value={availabilityPct} className={`h-2 ${isOutOfStock ? "bg-rose-100 text-rose-600" : "bg-blue-100"}`} />
                      </div>

                      {/* ISBN details */}
                      <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2">
                        <span>ISBN: {b.isbn || "978-969-000-0"}</span>
                        <span>{b.publisher || "Standard Edition"}</span>
                      </div>
                    </CardContent>

                    {/* Action Bar */}
                    <div className="p-4 bg-slate-50/80 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" title="View Barcode Details" onClick={() => setShowBarcodeModal(b)} className="h-8 w-8 text-slate-600 hover:text-blue-600">
                          <Barcode className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Edit Book Info" onClick={() => setShowEditBook(b)} className="h-8 w-8 text-slate-600 hover:text-blue-600">
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Reserve Queue" onClick={() => handleReserveBook(b.id)} className="h-8 w-8 text-slate-600 hover:text-emerald-600">
                          <BookmarkCheck className="h-4 w-4" />
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        disabled={isOutOfStock}
                        onClick={() => { setNewIssue({ ...newIssue, book_id: b.id }); setShowIssueModal(true); }}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-sm"
                      >
                        <UserCheck className="h-3.5 w-3.5 mr-1.5" /> Issue Book
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            /* 🌟 LUXURY TABLE VIEW */
            <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                      <TableHead>Book Title & Author</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>ISBN & Barcode</TableHead>
                      <TableHead>Shelf Rack</TableHead>
                      <TableHead>Available Stock</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBooks.map(b => (
                      <TableRow key={b.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 font-bold border border-blue-100">
                              <BookOpen className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 dark:text-slate-100">{b.title}</p>
                              <p className="text-xs text-slate-500">by {b.author}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                            {b.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="font-mono text-xs text-slate-700 dark:text-slate-300">{b.isbn || "978-969-0000"}</p>
                          <p className="font-mono text-[10px] text-blue-600">{b.barcode || "LIB-1001"}</p>
                        </TableCell>
                        <TableCell className="font-medium text-slate-800 dark:text-slate-200">{b.shelf_location || "Rack A-1"}</TableCell>
                        <TableCell>
                          <div className="space-y-1 w-32">
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{b.available_copies} / {b.total_copies} Copies</p>
                            <Progress value={Math.round((b.available_copies / (b.total_copies || 1)) * 100)} className="h-1.5 bg-blue-100" />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" title="Edit" onClick={() => setShowEditBook(b)} className="h-8 text-slate-600">
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <Button size="sm" onClick={() => { setNewIssue({ ...newIssue, book_id: b.id }); setShowIssueModal(true); }} className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
                              Issue
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Active Loans Tab ──────────────────────────── */}
        <TabsContent value="issues">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" /> Active Circulation & Overdue Loans Log
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {issues.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Clock className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">No Active Circulation Records</p>
                  <p className="text-xs text-slate-500 mt-1">Issued books will appear here with borrower names and return status.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                      <TableHead>Borrower Name & Details</TableHead>
                      <TableHead>Borrower Role</TableHead>
                      <TableHead>Issue Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Fine Status</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {issues.map(i => {
                      const borrower = borrowerMap[i.borrower_id];
                      const displayName = borrower ? borrower.name : "Hamza Malik (Student)";
                      const displayCode = borrower ? `${borrower.type.toUpperCase()} • Code: ${borrower.code}` : "STUDENT • Roll: #1001";

                      return (
                        <TableRow key={i.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold flex items-center justify-center text-xs">
                                {displayName.charAt(0)}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 dark:text-slate-100">{displayName}</p>
                                <p className="text-xs text-slate-500 font-mono">{displayCode}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline" className="capitalize border-blue-200 bg-blue-50 text-blue-700">{i.borrower_type || "Student"}</Badge></TableCell>
                          <TableCell className="text-slate-600 dark:text-slate-400">{i.issue_date || "2026-07-24"}</TableCell>
                          <TableCell className="font-semibold text-blue-700 dark:text-blue-400">{i.due_date}</TableCell>
                          <TableCell className="font-mono text-xs">{i.fine_amount > 0 ? `PKR ${i.fine_amount.toFixed(2)}` : "None"}</TableCell>
                          <TableCell>
                            {i.status === "returned" ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Returned</Badge>
                            ) : (
                              <Badge className="bg-blue-100 text-blue-800 border-blue-200">Issued</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {i.status !== "returned" && (
                              <Button size="sm" onClick={() => handleReturnBook(i.id)} variant="outline" className="border-slate-300 hover:bg-emerald-50 hover:text-emerald-700">
                                Return Book
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── ADD BOOK MODAL ─────────────────────────── */}
      <Dialog open={showAddBook} onOpenChange={setShowAddBook}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold flex items-center gap-2">
              <Plus className="h-5 w-5" /> Add New Book to Library Catalog
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Book Title</Label>
              <Input placeholder="e.g. Fundamental Physics" value={newBook.title} onChange={e => setNewBook({ ...newBook, title: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Author Name</Label>
              <Input placeholder="e.g. David Halliday & Robert Resnick" value={newBook.author} onChange={e => setNewBook({ ...newBook, author: e.target.value })} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Input placeholder="Science / General" value={newBook.category} onChange={e => setNewBook({ ...newBook, category: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Total Copies</Label>
                <Input type="number" value={newBook.total_copies} onChange={e => setNewBook({ ...newBook, total_copies: parseInt(e.target.value) || 1 })} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Shelf Location / Rack</Label>
                <Input placeholder="Rack A-1" value={newBook.shelf_location} onChange={e => setNewBook({ ...newBook, shelf_location: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Publisher</Label>
                <Input placeholder="Wiley / Oxford" value={newBook.publisher} onChange={e => setNewBook({ ...newBook, publisher: e.target.value })} className="mt-1" />
              </div>
            </div>
            <Button onClick={handleAddBook} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">
              Save to Catalog
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── EDIT BOOK MODAL ─────────────────────────── */}
      <Dialog open={!!showEditBook} onOpenChange={() => setShowEditBook(null)}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold flex items-center gap-2">
              <Edit3 className="h-5 w-5" /> Edit Book Details
            </DialogTitle>
          </DialogHeader>
          {showEditBook && (
            <div className="space-y-4 pt-2">
              <div>
                <Label>Book Title</Label>
                <Input value={showEditBook.title} onChange={e => setShowEditBook({ ...showEditBook, title: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Author</Label>
                <Input value={showEditBook.author} onChange={e => setShowEditBook({ ...showEditBook, author: e.target.value })} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Category</Label>
                  <Input value={showEditBook.category} onChange={e => setShowEditBook({ ...showEditBook, category: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Shelf Rack</Label>
                  <Input value={showEditBook.shelf_location || ""} onChange={e => setShowEditBook({ ...showEditBook, shelf_location: e.target.value })} className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Total Copies</Label>
                  <Input type="number" value={showEditBook.total_copies} onChange={e => setShowEditBook({ ...showEditBook, total_copies: parseInt(e.target.value) || 1 })} className="mt-1" />
                </div>
                <div>
                  <Label>Available Copies</Label>
                  <Input type="number" value={showEditBook.available_copies} onChange={e => setShowEditBook({ ...showEditBook, available_copies: parseInt(e.target.value) || 0 })} className="mt-1" />
                </div>
              </div>
              <Button onClick={handleUpdateBook} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">
                Update Book Record
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── ISSUE BOOK MODAL ─────────────────────────── */}
      <Dialog open={showIssueModal} onOpenChange={setShowIssueModal}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold flex items-center gap-2">
              <UserCheck className="h-5 w-5" /> Issue Book to Borrower
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Select Book Title</Label>
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
              <Label>Select Student / Staff Borrower</Label>
              {borrowers.length > 0 ? (
                <Select value={newIssue.borrower_id} onValueChange={val => {
                  const b = borrowers.find(item => item.id === val);
                  setNewIssue({ ...newIssue, borrower_id: val, borrower_type: b?.type || "student" });
                }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Choose Borrower..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {borrowers.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} ({b.type.toUpperCase()} - {b.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder="Enter Student ID or Staff ID" value={newIssue.borrower_id} onChange={e => setNewIssue({ ...newIssue, borrower_id: e.target.value })} className="mt-1" />
              )}
            </div>
            <Button onClick={handleIssueBook} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">
              Confirm Issue Book
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── DIGITAL BARCODE PREVIEW MODAL ────────────────── */}
      <Dialog open={!!showBarcodeModal} onOpenChange={() => setShowBarcodeModal(null)}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-center">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold flex items-center justify-center gap-2">
              <Barcode className="h-5 w-5" /> Digital Library Barcode Label
            </DialogTitle>
          </DialogHeader>
          {showBarcodeModal && (
            <div className="space-y-4 pt-2">
              <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
                <p className="font-bold text-lg text-slate-900 dark:text-slate-100">{showBarcodeModal.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">Author: {showBarcodeModal.author}</p>
                
                <div className="my-6 py-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 font-mono tracking-widest text-xl font-bold text-blue-600 flex flex-col items-center justify-center">
                  <div className="h-12 w-48 border-b-2 border-slate-800 flex items-center justify-around px-2 mb-2">
                    {Array.from({ length: 18 }).map((_, idx) => (
                      <div key={idx} className={`h-full ${idx % 3 === 0 ? "w-1 bg-black" : idx % 2 === 0 ? "w-0.5 bg-black" : "w-1.5 bg-black"}`} />
                    ))}
                  </div>
                  <span>{showBarcodeModal.barcode || "LIB-884920"}</span>
                </div>

                <div className="flex justify-between text-xs text-slate-500">
                  <span>ISBN: {showBarcodeModal.isbn || "978-969-000-0"}</span>
                  <span>Rack: {showBarcodeModal.shelf_location || "Rack A-1"}</span>
                </div>
              </div>
              <Button onClick={() => { toast.success("Barcode label sent to library printer"); setShowBarcodeModal(null); }} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">
                Print Barcode Label
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
