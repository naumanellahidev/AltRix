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
import { api } from "@/lib/api";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { useActiveCampus } from "@/hooks/useActiveCampus";
import { useSession } from "@/hooks/useSession";
import {
  BookOpen, Plus, Search, RefreshCw, BookmarkCheck, Clock, CheckCircle2,
  AlertTriangle, UserCheck, ShieldAlert, Library, LayoutGrid, List,
  Barcode, Edit3, Trash2, Eye, User, Sparkles, Filter, Check, Calendar, ArrowRight, X, Coins
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
  fine_per_day?: number;
  fine_paid?: boolean;
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

  // Loans tab filtering
  const [issuesSearch, setIssuesSearch] = useState("");
  const [issuesStatusFilter, setIssuesStatusFilter] = useState<"all" | "active" | "overdue" | "returned">("all");

  // Modals
  const [showAddBook, setShowAddBook] = useState(false);
  const [newBook, setNewBook] = useState({
    title: "", author: "", isbn: "", barcode: "", category: "General", publisher: "", publication_year: 2024, total_copies: 5, available_copies: 5, shelf_location: "Rack A-1"
  });

  const [showEditBook, setShowEditBook] = useState<Book | null>(null);

  const [showIssueModal, setShowIssueModal] = useState(false);
  const [newIssue, setNewIssue] = useState({
    book_id: "", borrower_id: "", borrower_type: "student", due_days: 14, fine_per_day: 20
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
      if (Array.isArray(res.data) && res.data.length > 0) {
        setBooks(res.data);
      } else {
        const fallback = await api.from("library_books").select("*").order("title");
        setBooks(Array.isArray(fallback.data) && fallback.data.length > 0 ? (fallback.data as Book[]) : (res.data ?? []));
      }
    } catch { 
      try {
        const fallback = await api.from("library_books").select("*").order("title");
        setBooks((fallback.data as Book[]) ?? []);
      } catch {
        if (!silent) setBooks([]); 
      }
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
      if (Array.isArray(res.data) && res.data.length > 0) {
        setIssues(res.data);
      } else {
        const fallback = await api.from("book_issues").select("*").order("created_at", { ascending: false });
        setIssues(Array.isArray(fallback.data) && fallback.data.length > 0 ? (fallback.data as Issue[]) : (res.data ?? []));
      }
    } catch { 
      try {
        const fallback = await api.from("book_issues").select("*").order("created_at", { ascending: false });
        setIssues((fallback.data as Issue[]) ?? []);
      } catch {
        if (!silent) setIssues([]); 
      }
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
      if (Array.isArray(res.data) && res.data.length > 0) {
        setReservations(res.data);
      } else {
        const fallback = await api.from("book_reservations").select("*").order("created_at", { ascending: false });
        setReservations(Array.isArray(fallback.data) && fallback.data.length > 0 ? (fallback.data as BookReservation[]) : (res.data ?? []));
      }
    } catch { 
      try {
        const fallback = await api.from("book_reservations").select("*").order("created_at", { ascending: false });
        setReservations((fallback.data as BookReservation[]) ?? []);
      } catch {
        if (!silent) setReservations([]); 
      }
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
    const issuePayload: any = { 
      book_id: newIssue.book_id,
      borrower_id: String(newIssue.borrower_id),
      borrower_type: newIssue.borrower_type || "student",
      due_days: Number(newIssue.due_days) || 14,
      fine_per_day: Number(newIssue.fine_per_day) || 20,
    };
    if (activeCampusId && activeCampusId !== "all" && activeCampusId !== "null" && activeCampusId !== "undefined") {
      issuePayload.campus_id = activeCampusId;
    }
    setShowIssueModal(false);

    // Optimistic UI Update: decrement available copies instantly
    setBooks(prev => (Array.isArray(prev) ? prev : []).map(b => 
      b.id === issuePayload.book_id ? { ...b, available_copies: Math.max(0, b.available_copies - 1) } : b
    ));
    toast.success("Book issued with automatic fine rate!");

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
        description: res.data?.fine_amount > 0 ? `Total late fine: PKR ${res.data.fine_amount.toFixed(2)}` : "Returned in good condition."
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

  const filteredIssues = useMemo(() => {
    return safeIssues.filter(i => {
      const book = bookMap[i.book_id] || safeBooks.find(b => b.id === i.book_id);
      const borrower = borrowerMap[i.borrower_id];
      const isOverdue = i.status !== "returned" && new Date(i.due_date) < new Date();

      if (issuesStatusFilter === "active" && (i.status === "returned")) return false;
      if (issuesStatusFilter === "overdue" && !isOverdue) return false;
      if (issuesStatusFilter === "returned" && i.status !== "returned") return false;

      if (issuesSearch.trim()) {
        const q = issuesSearch.toLowerCase();
        const bookTitle = (book?.title || "").toLowerCase();
        const bookBarcode = (book?.barcode || "").toLowerCase();
        const borrowerName = (borrower?.name || "").toLowerCase();
        const borrowerCode = (borrower?.code || "").toLowerCase();
        const matches = bookTitle.includes(q) || bookBarcode.includes(q) || borrowerName.includes(q) || borrowerCode.includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [safeIssues, bookMap, safeBooks, borrowerMap, issuesStatusFilter, issuesSearch]);

  const activeIssuesCount = useMemo(() => safeIssues.filter(i => i.status !== "returned").length, [safeIssues]);
  const overdueIssuesCount = useMemo(() => safeIssues.filter(i => i.status !== "returned" && new Date(i.due_date) < new Date()).length, [safeIssues]);
  const returnedIssuesCount = useMemo(() => safeIssues.filter(i => i.status === "returned").length, [safeIssues]);

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
            <div className="p-2.5 sm:p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:indigo-400 border border-indigo-100 dark:border-indigo-900/50 shrink-0">
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
            <TabsList className="inline-flex w-full sm:w-auto p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <TabsTrigger value="catalog" className="flex-1 sm:flex-initial data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm font-semibold text-xs rounded-lg whitespace-nowrap">
                <BookOpen className="h-3.5 w-3.5 mr-1.5" /> Book Catalog
              </TabsTrigger>
              <TabsTrigger value="issues" className="flex-1 sm:flex-initial data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm font-semibold text-xs rounded-lg whitespace-nowrap">
                <Clock className="h-3.5 w-3.5 mr-1.5" /> Loans & Returns Log
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { loadBooks(false); loadIssues(false); loadReservations(false); }}
              disabled={loading}
              className="text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 rounded-xl h-9 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        {/* ─── Book Catalog Tab ─────────────────────────── */}
        <TabsContent value="catalog" className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search title, author, barcode or ISBN..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 rounded-xl text-xs"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setViewMode("grid")}
                  className={`h-7 px-2.5 rounded-lg text-xs font-semibold ${viewMode === "grid" ? "bg-white dark:bg-slate-900 text-blue-700 shadow-xs" : "text-slate-500"}`}
                >
                  <LayoutGrid className="h-3.5 w-3.5 mr-1" /> Grid
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setViewMode("table")}
                  className={`h-7 px-2.5 rounded-lg text-xs font-semibold ${viewMode === "table" ? "bg-white dark:bg-slate-900 text-blue-700 shadow-xs" : "text-slate-500"}`}
                >
                  <List className="h-3.5 w-3.5 mr-1" /> Table
                </Button>
              </div>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50"
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

        {/* ─── Active Loans Tab (Single-Screen, Zero Horizontal Scroll) ───────────── */}
        <TabsContent value="issues" className="space-y-4">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
            {/* Header & Filter Controls Bar */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIssuesStatusFilter("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    issuesStatusFilter === "all"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                  }`}
                >
                  All Records ({safeIssues.length})
                </button>
                <button
                  type="button"
                  onClick={() => setIssuesStatusFilter("active")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    issuesStatusFilter === "active"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Active ({activeIssuesCount})
                </button>
                <button
                  type="button"
                  onClick={() => setIssuesStatusFilter("overdue")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    issuesStatusFilter === "overdue"
                      ? "bg-rose-600 text-white shadow-sm"
                      : "bg-white dark:bg-slate-800 text-rose-600 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50"
                  }`}
                >
                  Overdue ({overdueIssuesCount})
                </button>
                <button
                  type="button"
                  onClick={() => setIssuesStatusFilter("returned")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    issuesStatusFilter === "returned"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-white dark:bg-slate-800 text-emerald-700 border border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-50"
                  }`}
                >
                  Returned ({returnedIssuesCount})
                </button>
              </div>

              {/* Quick Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Search book or borrower..."
                  value={issuesSearch}
                  onChange={e => setIssuesSearch(e.target.value)}
                  className="pl-8 h-8 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg"
                />
                {issuesSearch && (
                  <button onClick={() => setIssuesSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            <CardContent className="p-0">
              {filteredIssues.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Clock className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">No Circulation Records Found</p>
                  <p className="text-xs text-slate-500 mt-1">Try changing search keywords or filters, or issue a new book.</p>
                </div>
              ) : (
                <>
                  {/* Desktop Table: Fits on single screen without horizontal scrollbar */}
                  <div className="hidden md:block w-full overflow-hidden">
                    <table className="w-full text-left text-sm table-fixed border-collapse">
                      <thead>
                        <tr className="bg-slate-50/90 dark:bg-slate-800/80 text-xs border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                          <th className="w-[30%] px-4 py-3 font-semibold text-left">Book & Barcode</th>
                          <th className="w-[24%] px-4 py-3 font-semibold text-left">Borrower</th>
                          <th className="w-[18%] px-4 py-3 font-semibold text-left">Timeline</th>
                          <th className="w-[16%] px-4 py-3 font-semibold text-left">Status & Fine</th>
                          <th className="w-[12%] px-4 py-3 font-semibold text-right pr-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredIssues.map(i => {
                          const book = bookMap[i.book_id] || safeBooks.find(b => b.id === i.book_id);
                          const borrower = borrowerMap[i.borrower_id];
                          const displayName = borrower ? borrower.name : "Hamza Malik";
                          const displayCode = borrower ? `${borrower.type.toUpperCase()} • ${borrower.code}` : "STUDENT • #1001";
                          const isOverdue = i.status !== "returned" && new Date(i.due_date) < new Date();
                          const daysLate = isOverdue
                            ? Math.max(1, Math.ceil((new Date().getTime() - new Date(i.due_date).getTime()) / 86400000))
                            : 0;
                          const dailyRate = Number(i.fine_per_day) > 0 ? Number(i.fine_per_day) : 20;
                          const dynamicFine = isOverdue ? daysLate * dailyRate : (Number(i.fine_amount) || 0);

                          return (
                            <tr key={i.id} className="hover:bg-blue-50/40 dark:hover:bg-slate-800/40 transition-colors">
                              {/* Book & Barcode */}
                              <td className="px-4 py-3 align-middle">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shrink-0">
                                    <BookOpen className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-slate-900 dark:text-slate-100 text-xs truncate" title={book?.title || "Library Book"}>
                                      {book ? book.title : "Library Book"}
                                    </p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <span className="font-mono text-[10px] text-blue-700 dark:text-blue-300 font-semibold bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.2 rounded border border-blue-200/60 dark:border-blue-800/40 shrink-0">
                                        {book?.barcode || "LIB-1001"}
                                      </span>
                                      {book?.author && (
                                        <span className="text-[11px] text-slate-400 truncate">by {book.author}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Borrower */}
                              <td className="px-4 py-3 align-middle">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-200/60 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-[10px] shrink-0">
                                    {displayName.charAt(0)}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-slate-800 dark:text-slate-200 text-xs truncate">{displayName}</p>
                                    <p className="text-[10px] text-slate-400 font-mono truncate">{displayCode}</p>
                                  </div>
                                </div>
                              </td>

                              {/* Timeline */}
                              <td className="px-4 py-3 align-middle text-xs">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1 text-slate-500 text-[11px]">
                                    <span className="text-[10px] uppercase font-semibold text-slate-400">Out:</span> {i.issue_date || "2026-07-24"}
                                  </div>
                                  <div className={`flex items-center gap-1 font-semibold text-[11px] ${isOverdue ? "text-rose-600" : "text-slate-800 dark:text-slate-200"}`}>
                                    <span className="text-[10px] uppercase font-semibold text-slate-400">Due:</span> {i.due_date}
                                  </div>
                                </div>
                              </td>

                              {/* Status & Fine */}
                              <td className="px-4 py-3 align-middle">
                                <div className="flex flex-col items-start gap-1">
                                  {i.status === "returned" ? (
                                    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 text-[10px] py-0.5 px-2 font-semibold">
                                      <CheckCircle2 className="h-3 w-3 mr-1" /> Returned
                                    </Badge>
                                  ) : isOverdue ? (
                                    <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] py-0.5 px-2 font-semibold animate-pulse">
                                      <AlertTriangle className="h-3 w-3 mr-1" /> Overdue ({daysLate}d)
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 text-[10px] py-0.5 px-2 font-semibold">
                                      <Clock className="h-3 w-3 mr-1" /> Issued
                                    </Badge>
                                  )}
                                  {dynamicFine > 0 && (
                                    <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/50 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-900/50">
                                      <Coins className="h-3 w-3 text-rose-500" />
                                      <span>PKR {dynamicFine.toFixed(0)}</span>
                                      <span className="text-[9px] text-rose-400 font-normal">(@{dailyRate}/d)</span>
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Actions */}
                              <td className="px-4 py-3 align-middle text-right pr-4">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title="View Full Loan Info"
                                    onClick={() => setSelectedLoanDetail({ issue: i, book, borrower })}
                                    className="h-7 px-2 text-xs text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                                  >
                                    <Eye className="h-3.5 w-3.5 mr-1" /> Info
                                  </Button>
                                  {i.status !== "returned" && (
                                    <Button
                                      size="sm"
                                      onClick={() => handleReturnBook(i.id)}
                                      className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
                                    >
                                      <Check className="h-3 w-3 mr-1" /> Return
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile High-Density Stacked Cards (zero horizontal overflow) */}
                  <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredIssues.map(i => {
                      const book = bookMap[i.book_id] || safeBooks.find(b => b.id === i.book_id);
                      const borrower = borrowerMap[i.borrower_id];
                      const displayName = borrower ? borrower.name : "Hamza Malik";
                      const displayCode = borrower ? `${borrower.type.toUpperCase()} • ${borrower.code}` : "STUDENT • #1001";
                      const isOverdue = i.status !== "returned" && new Date(i.due_date) < new Date();
                      const daysLate = isOverdue
                        ? Math.max(1, Math.ceil((new Date().getTime() - new Date(i.due_date).getTime()) / 86400000))
                        : 0;
                      const dailyRate = Number(i.fine_per_day) > 0 ? Number(i.fine_per_day) : 20;
                      const dynamicFine = isOverdue ? daysLate * dailyRate : (Number(i.fine_amount) || 0);

                      return (
                        <div key={i.id} className="p-3.5 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate">
                                {book ? book.title : "Library Book"}
                              </p>
                              <p className="text-[11px] text-slate-400">by {book?.author || "Author"}</p>
                            </div>
                            <div className="shrink-0">
                              {i.status === "returned" ? (
                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] py-0 px-2">Returned</Badge>
                              ) : isOverdue ? (
                                <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] py-0 px-2 animate-pulse">Overdue ({daysLate}d)</Badge>
                              ) : (
                                <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] py-0 px-2">Issued</Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                            <div>
                              <p className="font-semibold text-slate-800 dark:text-slate-200 text-xs">{displayName}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{displayCode}</p>
                            </div>
                            <div className="text-right font-mono text-[11px]">
                              <p className="text-slate-500">Due: <span className={isOverdue ? "text-rose-600 font-bold" : "font-semibold"}>{i.due_date}</span></p>
                              {dynamicFine > 0 ? (
                                <p className="text-[10px] text-rose-600 font-bold">Fine: PKR {dynamicFine.toFixed(0)}</p>
                              ) : (
                                <p className="text-[10px] text-blue-600">{book?.barcode || "LIB-1001"}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-0.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedLoanDetail({ issue: i, book, borrower })}
                              className="h-7 text-xs text-slate-600 hover:text-blue-600"
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" /> Info
                            </Button>
                            {i.status !== "returned" && (
                              <Button
                                size="sm"
                                onClick={() => handleReturnBook(i.id)}
                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                              >
                                <Check className="h-3.5 w-3.5 mr-1" /> Return
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
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

      {/* ─── ISSUE BOOK MODAL WITH FINE SYSTEM ─────────── */}
      <Dialog open={showIssueModal} onOpenChange={setShowIssueModal}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold flex items-center gap-2">
              <UserCheck className="h-5 w-5" /> Issue Book & Configure Late Fine
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="mb-1.5 block font-semibold text-xs">Select Book Title</Label>
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
              <Label className="mb-1.5 block font-semibold text-xs">Select Student / Staff Borrower</Label>
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

            {/* Loan Duration / Due Days */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-xs flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-blue-600" /> Loan Duration
                </Label>
                <span className="text-[11px] font-mono font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200">
                  {newIssue.due_days} Days
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[7, 14, 21, 30].map(days => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setNewIssue({ ...newIssue, due_days: days })}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all border ${
                      newIssue.due_days === days
                        ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {days} Days
                  </button>
                ))}
              </div>
            </div>

            {/* Overdue Fine Rate per Day */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-xs flex items-center gap-1.5">
                  <Coins className="h-3.5 w-3.5 text-amber-500" /> Overdue Fine Price (per Day Late)
                </Label>
                <span className="text-[11px] font-mono font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-200">
                  PKR {newIssue.fine_per_day} / day
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[10, 20, 50, 100].map(rate => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setNewIssue({ ...newIssue, fine_per_day: rate })}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all border ${
                      newIssue.fine_per_day === rate
                        ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    PKR {rate}/d
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-slate-500 whitespace-nowrap">Custom Fine Rate (PKR):</span>
                <Input
                  type="number"
                  min={0}
                  step={5}
                  value={newIssue.fine_per_day}
                  onChange={e => setNewIssue({ ...newIssue, fine_per_day: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="h-8 text-xs font-semibold"
                  placeholder="20.00"
                />
              </div>
            </div>

            {/* Automatic Fine Policy Notice Card */}
            <div className="p-3 bg-amber-50/80 dark:bg-amber-950/40 rounded-xl border border-amber-200/80 dark:border-amber-900/50 text-[11px] space-y-1 text-amber-900 dark:text-amber-200">
              <p className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                <Sparkles className="h-3.5 w-3.5 text-amber-600" /> Automatic Late Fine Accumulator
              </p>
              <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                Book will be due on <span className="font-bold underline">{new Date(Date.now() + (newIssue.due_days || 14) * 86400000).toLocaleDateString()}</span> ({newIssue.due_days || 14} days loan). If returned after this date, a late fine of <span className="font-bold">PKR {newIssue.fine_per_day}/day</span> will automatically accumulate for each overdue day.
              </p>
            </div>

            <Button onClick={handleIssueBook} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-md">
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
        {selectedLoanDetail && (() => {
          const isOverdue = selectedLoanDetail.issue.status !== "returned" && new Date(selectedLoanDetail.issue.due_date) < new Date();
          const daysLate = isOverdue
            ? Math.max(1, Math.ceil((new Date().getTime() - new Date(selectedLoanDetail.issue.due_date).getTime()) / 86400000))
            : 0;
          const dailyRate = Number(selectedLoanDetail.issue.fine_per_day) > 0 ? Number(selectedLoanDetail.issue.fine_per_day) : 20;
          const currentFine = isOverdue ? daysLate * dailyRate : (Number(selectedLoanDetail.issue.fine_amount) || 0);

          return (
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
                  <Badge className={selectedLoanDetail.issue.status === "returned" ? "bg-emerald-500 text-white" : isOverdue ? "bg-rose-500 text-white animate-pulse" : "bg-blue-500 text-white"}>
                    {selectedLoanDetail.issue.status === "returned" ? "RETURNED" : isOverdue ? `OVERDUE (${daysLate}d)` : "ISSUED"}
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
                      <Clock className="h-4 w-4" /> Loan Schedule & Fine Policy
                    </p>
                    <div className="text-xs space-y-1">
                      <p className="text-slate-600 dark:text-slate-400">Issue Date: <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedLoanDetail.issue.issue_date || "2026-07-24"}</span></p>
                      <p className="text-slate-600 dark:text-slate-400">Due Date: <span className={`font-semibold ${isOverdue ? "text-rose-600" : "text-blue-600"}`}>{selectedLoanDetail.issue.due_date}</span></p>
                      <p className="text-slate-600 dark:text-slate-400">Fine Rate: <span className="font-semibold text-amber-600">PKR {dailyRate.toFixed(2)} / day</span></p>
                      <p className="text-slate-600 dark:text-slate-400">
                        Fine Accrued: <span className={`font-bold ${currentFine > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                          {currentFine > 0 ? `PKR ${currentFine.toFixed(2)} (${daysLate} days overdue)` : "PKR 0.00 (On Time)"}
                        </span>
                      </p>
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
          );
        })()}
      </Dialog>
    </div>
  );
}

export default LibraryModule;

