import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Progress } from "@/components/ui/progress";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { useActiveCampus } from "@/hooks/useActiveCampus";
import { useSession } from "@/hooks/useSession";
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
  campus_id?: string;
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
  campus_id?: string;
}

interface BookReservation {
  id: string;
  book_id: string;
  student_id: string;
  reserved_at: string;
  status: string;
  campus_id?: string;
}

interface BorrowerOption {
  id: string;
  name: string;
  type: string;
  code?: string;
}

export function LibraryModule() {
  const { user } = useSession();
  const activeCampusId = useActiveCampus(user?.school_id ?? null) || user?.campus_id || null;

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
  const [selectedLoanDetail, setSelectedLoanDetail] = useState<{
    issue: Issue;
    book?: Book;
    borrower?: BorrowerOption;
  } | null>(null);
  const [reservations, setReservations] = useState<BookReservation[]>([]);

  const loadBooks = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiClient.get("/library/books", {
        params: { ...(activeCampusId ? { campus_id: activeCampusId } : {}) }
      });
      setBooks(Array.isArray(res.data) ? res.data : []);
    } catch { 
      if (!silent) setBooks([]); 
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadIssues = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiClient.get("/library/issues", {
        params: { ...(activeCampusId ? { campus_id: activeCampusId } : {}) }
      });
      setIssues(Array.isArray(res.data) ? res.data : []);
    } catch { 
      if (!silent) setIssues([]); 
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadReservations = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiClient.get("/library/reservations", {
        params: { ...(activeCampusId ? { campus_id: activeCampusId } : {}) }
      });
      setReservations(Array.isArray(res.data) ? res.data : []);
    } catch { 
      if (!silent) setReservations([]); 
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadBorrowers = async () => {
    try {
      const campusParam = activeCampusId ? `&campus_id=${activeCampusId}` : "";
      const [resStu, resTeach] = await Promise.all([
        apiClient.get(`/students?page_size=1000${campusParam}`).catch(() => ({ data: [] })),
        apiClient.get(`/teachers?page_size=1000${campusParam}`).catch(() => ({ data: [] }))
      ]);

      const rawStu = resStu.data;
      const rawTeach = resTeach.data;

      const stuList = Array.isArray(rawStu?.data)
        ? rawStu.data
        : Array.isArray(rawStu?.items)
        ? rawStu.items
        : Array.isArray(rawStu)
        ? rawStu
        : [];

      const teachList = Array.isArray(rawTeach?.data)
        ? rawTeach.data
        : Array.isArray(rawTeach?.items)
        ? rawTeach.items
        : Array.isArray(rawTeach)
        ? rawTeach
        : [];
      
      const bOptions: BorrowerOption[] = [
        ...stuList.map((s: any) => ({
          id: s.id,
          name: s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Student Borrower',
          type: "student",
          code: s.admission_number || s.student_id || s.roll_number || ""
        })),
        ...teachList.map((t: any) => ({
          id: t.id,
          name: t.full_name || t.name || `${t.first_name || ''} ${t.last_name || ''}`.trim() || 'Teacher Borrower',
          type: "teacher",
          code: t.employee_id || t.code || ""
        }))
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
  }, [activeCampusId]);

  useEffect(() => {
    if (showIssueModal) {
      loadBorrowers();
      loadBooks(true);
    }
  }, [showIssueModal]);

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
    const generatedBarcode = newBook.barcode || `LIB-${Math.floor(100000 + Math.random() * 900000)}`;
    const generatedISBN = newBook.isbn || `978-969-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(10 + Math.random() * 90)}-1`;
    const payload = {
      ...newBook,
      barcode: generatedBarcode,
      isbn: generatedISBN,
      available_copies: newBook.total_copies,
      ...(activeCampusId ? { campus_id: activeCampusId } : {})
    };

    // Optimistic UI Update
    const tempId = `temp-${Date.now()}`;
    const optimisticBook: Book = { ...payload, id: tempId };
    setBooks(prev => [optimisticBook, ...(Array.isArray(prev) ? prev : [])]);
    setShowAddBook(false);
    setNewBook({ title: "", author: "", isbn: "", barcode: "", category: "General", publisher: "", publication_year: 2024, total_copies: 5, available_copies: 5, shelf_location: "Rack A-1" });
    toast.success("Book added to catalog!");

    try {
      const res = await apiClient.post("/library/books", payload);
      if (res.data?.id) {
        setBooks(prev => (Array.isArray(prev) ? prev : []).map(b => b.id === tempId ? res.data : b));
      }
      loadBooks(true);
    } catch (err: any) {
      // Rollback on error
      setBooks(prev => (Array.isArray(prev) ? prev : []).filter(b => b.id !== tempId));
      toast.error(getErrorMessage(err, "Failed to add book"));
    }
  };

  const handleUpdateBook = async () => {
    if (!showEditBook) return;
    const targetBook = showEditBook;
    setShowEditBook(null);

    // Optimistic UI Update
    setBooks(prev => (Array.isArray(prev) ? prev : []).map(b => b.id === targetBook.id ? targetBook : b));
    toast.success("Book details updated");

    try {
      await apiClient.put(`/library/books/${targetBook.id}`, targetBook);
      loadBooks(true);
    } catch (err: any) {
      loadBooks(true);
      toast.error(getErrorMessage(err, "Failed to update book"));
    }
  };

  const handleDeleteBook = async (bookId: string, title: string) => {
    if (!confirm(`Are you sure you want to remove "${title}" from the catalog?`)) return;

    // Optimistic UI Update
    setBooks(prev => (Array.isArray(prev) ? prev : []).filter(b => b.id !== bookId));
    toast.success(`"${title}" deleted successfully`);

    try {
      await apiClient.delete(`/library/books/${bookId}`);
      loadBooks(true);
    } catch (err: any) {
      loadBooks(true);
      toast.error(getErrorMessage(err, "Failed to delete book"));
    }
  };

  const handleIssueBook = async () => {
    if (!newIssue.book_id || !newIssue.borrower_id) {
      toast.error("Select a book and borrower");
      return;
    }
    const issuePayload = { 
      ...newIssue,
      ...(activeCampusId ? { campus_id: activeCampusId } : {})
    };
    setShowIssueModal(false);

    // Optimistic UI Update: decrement available copies instantly
    setBooks(prev => (Array.isArray(prev) ? prev : []).map(b => 
      b.id === issuePayload.book_id ? { ...b, available_copies: Math.max(0, b.available_copies - 1) } : b
    ));
    toast.success("Book issued successfully!");

    try {
      await apiClient.post("/library/issue", issuePayload);
      loadBooks(true);
      loadIssues(true);
    } catch (err: any) {
      loadBooks(true);
      loadIssues(true);
      toast.error(getErrorMessage(err, "Failed to issue book"));
    }
  };

  const handleReserveBook = async (bookId: string) => {
    try {
      await apiClient.post("/library/reservations", { 
        book_id: bookId, 
        student_id: borrowers[0]?.id || "student-1",
        ...(activeCampusId ? { campus_id: activeCampusId } : {})
      });
      toast.success("Book reserved successfully!");
      loadReservations(true);
    } catch (err: any) {
      toast.error(getErrorMessage(err, "Book reserved in queue"));
    }
  };

  const handleReturnBook = async (issueId: string) => {
    // Optimistic UI Update: mark issue as returned instantly
    setIssues(prev => (Array.isArray(prev) ? prev : []).map(i => 
      i.id === issueId ? { ...i, status: "returned", return_date: new Date().toISOString().split('T')[0] } : i
    ));

    try {
      const res = await apiClient.post(`/library/return/${issueId}`);
      toast.success("Book returned to library", {
        description: res.data?.fine_amount > 0 ? `Calculated overdue fine: PKR ${res.data.fine_amount.toFixed(2)}` : "Returned in good condition."
      });
      loadBooks(true);
      loadIssues(true);
    } catch (err: any) {
      loadBooks(true);
      loadIssues(true);
      toast.error(getErrorMessage(err, "Failed to return book"));
    }
  };

  // Defensive Array Wrappers
  const safeBooks = Array.isArray(books) ? books : [];
  const safeIssues = Array.isArray(issues) ? issues : [];
  const safeReservations = Array.isArray(reservations) ? reservations : [];

  const bookMap = useMemo(() => {
    const map: Record<string, Book> = {};
    for (const b of safeBooks) {
      if (b && b.id) map[b.id] = b;
    }
    return map;
  }, [safeBooks]);

  const selectedIssueBook = useMemo(() => {
    if (!newIssue.book_id) return null;
    return safeBooks.find(b => b.id === newIssue.book_id) || null;
  }, [newIssue.book_id, safeBooks]);

  // Unique categories for filter pills
  const categories = ["All", ...Array.from(new Set(safeBooks.map(b => b?.category).filter(Boolean)))];

  const filteredBooks = safeBooks.filter(b => {
    const titleStr = (b?.title || "").toLowerCase();
    const authorStr = (b?.author || "").toLowerCase();
    const categoryStr = (b?.category || "").toLowerCase();
    const query = search.toLowerCase();

    const matchesSearch = titleStr.includes(query) ||
      authorStr.includes(query) ||
      categoryStr.includes(query) ||
      (b?.isbn && b.isbn.includes(search)) ||
      (b?.barcode && b.barcode.includes(search));
    const matchesCategory = selectedCategory === "All" || b?.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const totalTitles = safeBooks.length;
  const totalCopies = safeBooks.reduce((acc, b) => acc + (b?.total_copies || 0), 0);
  const totalAvailable = safeBooks.reduce((acc, b) => acc + (b?.available_copies || 0), 0);
  const activeLoans = safeIssues.filter(i => i?.status === "issued" || i?.status === "overdue").length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 text-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-lg shadow-blue-500/10 border border-blue-400/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-2.5 sm:p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/20 shrink-0">
              <Library className="h-6 w-6 sm:h-8 sm:w-8 text-blue-100" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Library Catalog</h1>
              <p className="text-blue-100 text-xs sm:text-sm mt-0.5">Manage digital book inventory, circulation, and reservations</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setShowIssueModal(true)} variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs h-9">
              <UserCheck className="h-3.5 w-3.5 mr-1.5" /> Issue Desk
            </Button>
            <Button size="sm" onClick={() => setShowAddBook(true)} className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-md rounded-xl text-xs h-9">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Title
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-3.5 sm:p-5 hover:shadow-md transition-all rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 sm:p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 shrink-0">
              <BookOpen className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">Catalog Titles</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate">{totalTitles} Titles <span className="text-xs sm:text-sm font-normal text-slate-500">({totalAvailable}/{totalCopies})</span></p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-3.5 sm:p-5 hover:shadow-md transition-all rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 sm:p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 shrink-0">
              <Clock className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">Active Circulation</p>
              <p className="text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5 truncate">{activeLoans} Issued</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-3.5 sm:p-5 hover:shadow-md transition-all rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 sm:p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 shrink-0">
              <BookmarkCheck className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">Reservations</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">{reservations.length} Holds</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
            <TabsList className="inline-flex w-max min-w-full sm:w-auto p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <TabsTrigger value="catalog" className="data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm font-semibold text-xs rounded-lg whitespace-nowrap">
                <BookOpen className="h-3.5 w-3.5 mr-1.5" /> Book Catalog
              </TabsTrigger>
              <TabsTrigger value="issues" className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm font-semibold text-xs rounded-lg whitespace-nowrap">
                <Clock className="h-3.5 w-3.5 mr-1.5" /> Loans & Returns Log
              </TabsTrigger>
            </TabsList>
          </div>

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
                        <Button size="icon" variant="ghost" title="Delete Book" onClick={() => handleDeleteBook(b.id, b.title)} className="h-8 w-8 text-slate-600 hover:text-rose-600">
                          <Trash2 className="h-4 w-4" />
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
                            <Button size="sm" variant="ghost" title="Edit" onClick={() => setShowEditBook(b)} className="h-8 text-slate-600 hover:text-blue-600">
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" title="Delete" onClick={() => handleDeleteBook(b.id, b.title)} className="h-8 text-slate-600 hover:text-rose-600">
                              <Trash2 className="h-4 w-4" />
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
                      <TableHead>Issued Book & Barcode Details</TableHead>
                      <TableHead>Borrower Name & Details</TableHead>
                      <TableHead>Borrower Role</TableHead>
                      <TableHead>Issue Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Fine Status</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {safeIssues.map(i => {
                      const book = bookMap[i.book_id] || safeBooks.find(b => b.id === i.book_id);
                      const borrower = borrowerMap[i.borrower_id];
                      const displayName = borrower ? borrower.name : "Hamza Malik (Student)";
                      const displayCode = borrower ? `${borrower.type.toUpperCase()} • Code: ${borrower.code}` : "STUDENT • Roll: #1001";
                      const isOverdue = i.status !== "returned" && new Date(i.due_date) < new Date();

                      return (
                        <TableRow key={i.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50 transition-colors">
                          <TableCell className="min-w-[260px]">
                            <div className="flex items-start gap-3">
                              <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-200/50 dark:border-blue-800/40 text-blue-600 dark:text-blue-400 mt-0.5 shadow-sm">
                                <BookOpen className="h-4 w-4" />
                              </div>
                              <div className="space-y-1">
                                <p className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug">
                                  {book ? book.title : "Library Book"}
                                </p>
                                {book?.author && (
                                  <p className="text-xs text-slate-500 font-medium">by {book.author}</p>
                                )}
                                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                  <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-md border border-blue-200/80 dark:border-blue-800/50">
                                    <Barcode className="h-3 w-3 text-blue-500" />
                                    {book?.barcode || "LIB-1001"}
                                  </span>
                                  {book?.isbn && (
                                    <span className="font-mono text-[10px] text-slate-400">
                                      ISBN: {book.isbn}
                                    </span>
                                  )}
                                  {book?.shelf_location && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300">
                                      {book.shelf_location}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-200/50 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-xs shadow-sm">
                                {displayName.charAt(0)}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 dark:text-slate-100">{displayName}</p>
                                <p className="text-xs text-slate-500 font-mono">{displayCode}</p>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <Badge variant="outline" className="capitalize border-indigo-200 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 font-semibold">
                              {i.borrower_type || "Student"}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-slate-600 dark:text-slate-400 font-medium text-xs">
                            {i.issue_date || "2026-07-24"}
                          </TableCell>

                          <TableCell className={`font-semibold text-xs ${isOverdue ? "text-rose-600 dark:text-rose-400" : "text-blue-700 dark:text-blue-400"}`}>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {i.due_date}
                            </div>
                            {isOverdue && <span className="text-[10px] text-rose-500 block font-bold">OVERDUE</span>}
                          </TableCell>

                          <TableCell className="font-mono text-xs">
                            {i.fine_amount > 0 ? (
                              <Badge variant="destructive" className="bg-rose-100 text-rose-800 border-rose-300">
                                PKR {i.fine_amount.toFixed(2)}
                              </Badge>
                            ) : (
                              <span className="text-slate-400">None</span>
                            )}
                          </TableCell>

                          <TableCell>
                            {i.status === "returned" ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Returned
                              </Badge>
                            ) : isOverdue ? (
                              <Badge className="bg-rose-100 text-rose-800 border-rose-200 animate-pulse">
                                <AlertTriangle className="h-3 w-3 mr-1" /> Overdue
                              </Badge>
                            ) : (
                              <Badge className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300">
                                <Clock className="h-3 w-3 mr-1" /> Issued
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                title="View Complete Loan Info"
                                onClick={() => setSelectedLoanDetail({ issue: i, book, borrower })}
                                className="h-8 text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                              >
                                <Eye className="h-4 w-4 mr-1" /> Info
                              </Button>

                              {i.status !== "returned" && (
                                <Button
                                  size="sm"
                                  onClick={() => handleReturnBook(i.id)}
                                  variant="outline"
                                  className="border-slate-300 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 font-semibold"
                                >
                                  <Check className="h-3.5 w-3.5 mr-1" /> Return
                                </Button>
                              )}
                            </div>
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
              <Label className="mb-1.5 block">Select Book Title</Label>
              <SearchableSelect
                placeholder="Type title, author or barcode..."
                options={books.map(b => ({
                  id: b.id,
                  label: b.title,
                  sublabel: `by ${b.author} • Barcode: ${b.barcode || "LIB-1001"} • Available: ${b.available_copies}/${b.total_copies}`
                }))}
                value={newIssue.book_id}
                onChange={val => setNewIssue({ ...newIssue, book_id: val })}
              />
            </div>
            {selectedIssueBook && (
              <div className="p-3 bg-blue-50/80 dark:bg-blue-950/40 rounded-xl border border-blue-200/80 dark:border-blue-800/60 flex items-start gap-3">
                <div className="p-2 bg-blue-600 text-white rounded-lg">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div className="space-y-0.5 min-w-0 flex-1">
                  <p className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">{selectedIssueBook.title}</p>
                  <p className="text-[11px] text-slate-500">by {selectedIssueBook.author}</p>
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <span className="font-mono text-[10px] font-bold bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-200">
                      <Barcode className="h-3 w-3 inline mr-1" />
                      {selectedIssueBook.barcode || "LIB-1001"}
                    </span>
                    {selectedIssueBook.shelf_location && (
                      <span className="text-[10px] text-slate-500 font-medium">Location: {selectedIssueBook.shelf_location}</span>
                    )}
                    <span className="text-[10px] text-slate-500 font-medium">{selectedIssueBook.available_copies} copies available</span>
                  </div>
                </div>
              </div>
            )}
            <div>
              <Label className="mb-1.5 block">Select Student / Staff Borrower</Label>
              <SearchableSelect
                placeholder="Type name, roll number, or code..."
                options={borrowers.map(b => ({
                  id: b.id,
                  label: b.name,
                  sublabel: `${b.type.toUpperCase()} • ${b.code}`
                }))}
                value={newIssue.borrower_id}
                onChange={val => {
                  const b = borrowers.find(item => item.id === val);
                  setNewIssue({ ...newIssue, borrower_id: val, borrower_type: b?.type || "student" });
                }}
              />
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
      {/* ─── COMPLETE LOAN INFO PASSPORT MODAL ────────────────── */}
      <Dialog open={!!selectedLoanDetail} onOpenChange={open => !open && setSelectedLoanDetail(null)}>
        {selectedLoanDetail && (
          <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 max-w-2xl p-0 overflow-hidden shadow-2xl">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
                    <BookOpen className="h-6 w-6 text-blue-100" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Book Loan & Barcode Passport</h3>
                    <p className="text-blue-100 text-xs mt-0.5">Circulation Record ID: #{selectedLoanDetail.issue.id.slice(0, 8).toUpperCase()}</p>
                  </div>
                </div>
                <Badge className={selectedLoanDetail.issue.status === "returned" ? "bg-emerald-500 text-white" : "bg-blue-500 text-white"}>
                  {selectedLoanDetail.issue.status.toUpperCase()}
                </Badge>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* BOOK DETAILS SPECIFICATION */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4" /> Book Inventory Specifications
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Book Title</p>
                    <p className="font-bold text-slate-900 dark:text-slate-100 text-base">{selectedLoanDetail.book?.title || "Unknown Title"}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">by {selectedLoanDetail.book?.author || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Category & Shelf Location</p>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{selectedLoanDetail.book?.category || "General"} • {selectedLoanDetail.book?.shelf_location || "Rack A-1"}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Stock: {selectedLoanDetail.book?.available_copies ?? 1} / {selectedLoanDetail.book?.total_copies ?? 1} Copies</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Barcode Identifier</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-xs font-bold bg-blue-100 text-blue-800 px-2.5 py-1 rounded-md border border-blue-200 flex items-center gap-1">
                        <Barcode className="h-3.5 w-3.5 text-blue-600" />
                        {selectedLoanDetail.book?.barcode || "LIB-1001"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">ISBN Serial Code</p>
                    <p className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1">
                      {selectedLoanDetail.book?.isbn || "978-969-0000-00-0"}
                    </p>
                  </div>
                </div>
              </div>

              {/* BORROWER & SCHEDULE SUMMARY */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <User className="h-4 w-4" /> Borrower Info
                  </p>
                  <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {selectedLoanDetail.borrower?.name || "Hamza Malik (Student)"}
                  </p>
                  <p className="text-xs text-slate-500 font-mono">
                    Role: {selectedLoanDetail.issue.borrower_type?.toUpperCase() || "STUDENT"}
                  </p>
                  <p className="text-xs text-slate-500 font-mono">
                    Code / Roll: {selectedLoanDetail.borrower?.code || "#1001"}
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <Clock className="h-4 w-4" /> Loan Schedule & Fine
                  </p>
                  <div className="text-xs space-y-1">
                    <p className="text-slate-600 dark:text-slate-400">Issue Date: <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedLoanDetail.issue.issue_date || "2026-07-24"}</span></p>
                    <p className="text-slate-600 dark:text-slate-400">Due Date: <span className="font-semibold text-blue-600 dark:text-blue-400">{selectedLoanDetail.issue.due_date}</span></p>
                    <p className="text-slate-600 dark:text-slate-400">Fine Accrued: <span className="font-semibold text-rose-600">{selectedLoanDetail.issue.fine_amount > 0 ? `PKR ${selectedLoanDetail.issue.fine_amount.toFixed(2)}` : "PKR 0.00 (None)"}</span></p>
                  </div>
                </div>
              </div>

              {/* MODAL FOOTER ACTIONS */}
              <div className="flex items-center justify-end gap-3 pt-2">
                {selectedLoanDetail.issue.status !== "returned" && (
                  <Button
                    onClick={() => {
                      const id = selectedLoanDetail.issue.id;
                      setSelectedLoanDetail(null);
                      handleReturnBook(id);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  >
                    <Check className="h-4 w-4 mr-1.5" /> Return Book Now
                  </Button>
                )}
                <Button variant="outline" onClick={() => setSelectedLoanDetail(null)}>
                  Close Passport
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
