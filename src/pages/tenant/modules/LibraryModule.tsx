import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { useActiveCampus } from "@/hooks/useActiveCampus";
import { useSession } from "@/hooks/useSession";
import {
  BookOpen, Plus, Search, RefreshCw, BookmarkCheck, Clock, CheckCircle2,
  AlertTriangle, UserCheck, Library, LayoutGrid, List,
  Barcode, Edit3, Trash2, Eye, User, Sparkles, Filter, Check, Calendar, ArrowRight, X, Coins,
  BookMarked, Layers, ShieldCheck, Printer
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
  type: "student" | "teacher";
  code?: string;
  details?: string;
}

export function LibraryModule() {
  const { user } = useSession();
  const activeCampusId = useActiveCampus(user?.school_id ?? null) || user?.campus_id || null;

  const [books, setBooks] = useState<Book[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [borrowers, setBorrowers] = useState<BorrowerOption[]>([]);
  const [borrowerMap, setBorrowerMap] = useState<Record<string, { name: string; code: string; type: string; details?: string }>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [activeTab, setActiveTab] = useState("catalog");
  const [borrowerCategoryFilter, setBorrowerCategoryFilter] = useState<"all" | "student" | "teacher">("all");

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

  const loadBorrowers = async () => {
    try {
      // 1. Fetch only active students of current school/campus
      let studentQuery = api
        .from("students")
        .select("id, first_name, last_name, roll_number, student_code, status, class_name, section");
      
      if (user?.school_id) {
        studentQuery = studentQuery.eq("school_id", user.school_id);
      }
      if (activeCampusId && activeCampusId !== "all") {
        studentQuery = studentQuery.eq("campus_id", activeCampusId);
      }

      // 2. Fetch only teachers/faculty (strictly exclude parents, admins, cleaners, accountants, support staff)
      let teachersQuery = api
        .from("profiles")
        .select("id, display_name, email, role, phone, designation")
        .in("role", ["teacher", "faculty", "instructor"]);

      const [stRes, teachRes] = await Promise.all([
        studentQuery.limit(500),
        teachersQuery.limit(150)
      ]);

      const list: BorrowerOption[] = [];
      const map: Record<string, { name: string; code: string; type: string; details?: string }> = {};

      (stRes.data ?? []).forEach((s: any) => {
        if (s.status === "inactive" || s.status === "withdrawn" || s.status === "graduated" || s.status === "deleted") return;
        const name = `${s.first_name || ""} ${s.last_name || ""}`.trim() || "Student";
        const code = s.student_code || s.roll_number || "STU";
        const details = s.class_name ? `Class ${s.class_name}${s.section ? `-${s.section}` : ""}` : "Student";
        list.push({ id: s.id, name, type: "student", code, details });
        map[s.id] = { name, code, type: "student", details };
      });

      (teachRes.data ?? []).forEach((p: any) => {
        const name = p.display_name || p.email || "Faculty Member";
        const code = `FAC-${p.id.slice(0, 4).toUpperCase()}`;
        const details = p.designation || "Teacher / Faculty";
        list.push({ id: p.id, name, type: "teacher", code, details });
        map[p.id] = { name, code, type: "teacher", details };
      });

      list.sort((a, b) => a.name.localeCompare(b.name));
      setBorrowers(list);
      setBorrowerMap(map);
    } catch { /* graceful fallback */ }
  };

  const loadReservations = async (silent = false) => {
    try {
      const res = await apiClient.get("/library/reservations", {
        params: { ...(activeCampusId ? { campus_id: activeCampusId } : {}) }
      });
      if (Array.isArray(res.data)) {
        setReservations(res.data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadBooks();
    loadIssues();
    loadBorrowers();
    loadReservations(true);
  }, [activeCampusId]);

  const getErrorMessage = (err: any, fallback: string) => {
    const raw = err?.response?.data?.detail || err?.response?.data?.message || err?.message;
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((item: any) => item.msg || JSON.stringify(item)).join(", ");
    }
    return fallback;
  };

  const handleAddBook = async () => {
    if (!newBook.title || !newBook.author) {
      toast.error("Book title and author are required");
      return;
    }
    const bookPayload: any = {
      title: newBook.title.trim(),
      author: newBook.author.trim(),
      isbn: newBook.isbn.trim() || `978-969-${Math.floor(1000 + Math.random() * 9000)}-0`,
      barcode: newBook.barcode.trim() || `LIB-${Math.floor(1000 + Math.random() * 9000)}`,
      category: newBook.category.trim() || "General",
      publisher: newBook.publisher.trim() || "Standard Edition",
      publication_year: Number(newBook.publication_year) || new Date().getFullYear(),
      total_copies: Number(newBook.total_copies) || 1,
      available_copies: Number(newBook.total_copies) || 1,
      shelf_location: newBook.shelf_location.trim() || "Rack A-1",
    };

    if (activeCampusId && activeCampusId !== "all" && activeCampusId !== "null" && activeCampusId !== "undefined") {
      bookPayload.campus_id = activeCampusId;
    }

    setShowAddBook(false);
    setNewBook({
      title: "", author: "", isbn: "", barcode: "", category: "General", publisher: "", publication_year: 2024, total_copies: 5, available_copies: 5, shelf_location: "Rack A-1"
    });

    // Optimistic UI Update
    const tempBook: Book = { id: `temp-${Date.now()}`, ...bookPayload };
    setBooks(prev => [tempBook, ...(Array.isArray(prev) ? prev : [])]);
    toast.success("New book registered to catalog!");

    try {
      const res = await apiClient.post("/library/books", bookPayload);
      if (res.data && res.data.id) {
        setBooks(prev => prev.map(b => b.id === tempBook.id ? res.data : b));
      } else {
        loadBooks(true);
      }
    } catch (err: any) {
      loadBooks(true);
      toast.error(getErrorMessage(err, "Failed to create book"));
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
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto p-2.5 sm:p-6">
      {/* 🌟 Executive Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-700 text-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl shadow-blue-500/10 border border-blue-400/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-3 sm:p-3.5 bg-white/10 rounded-2xl backdrop-blur-md border border-white/20 shrink-0 shadow-inner">
              <Library className="h-6 w-6 sm:h-8 sm:w-8 text-blue-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-3xl font-bold tracking-tight">Library & Circulation</h1>
                <Badge className="bg-white/20 text-white border-white/30 text-[10px] sm:text-xs">Digital LMS</Badge>
              </div>
              <p className="text-blue-100 text-xs sm:text-sm mt-1">
                Catalog indexing, automated overdue fine accumulator, barcode scanning, and multi-campus circulation.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => setShowIssueModal(true)}
              className="bg-white/15 hover:bg-white/25 text-white border border-white/25 rounded-xl text-xs h-9 font-semibold shadow-xs"
            >
              <UserCheck className="h-3.5 w-3.5 mr-1.5 text-blue-200" /> Issue Desk
            </Button>
            <Button
              size="sm"
              onClick={() => setShowAddBook(true)}
              className="bg-white text-blue-700 hover:bg-blue-50 font-bold shadow-md rounded-xl text-xs h-9"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Title
            </Button>
          </div>
        </div>
      </div>

      {/* 🌟 KPI Stat Cards (Responsive & Non-Truncating) */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-3.5 sm:p-4.5 hover:shadow-md transition-all rounded-2xl flex flex-col justify-between min-h-[105px]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] sm:text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Catalog</p>
              <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">
                {totalTitles} <span className="text-xs sm:text-sm font-semibold text-slate-500">Titles</span>
              </p>
            </div>
            <div className="p-2 sm:p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 shrink-0">
              <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <p className="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-2 truncate">
            {totalAvailable} / {totalCopies} Available
          </p>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-3.5 sm:p-4.5 hover:shadow-md transition-all rounded-2xl flex flex-col justify-between min-h-[105px]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] sm:text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active Loans</p>
              <p className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {activeLoans} <span className="text-xs sm:text-sm font-semibold text-slate-500">Issued</span>
              </p>
            </div>
            <div className="p-2 sm:p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 shrink-0">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <p className="text-[10px] sm:text-xs text-slate-500 font-semibold mt-2 truncate">
            {activeIssuesCount} Active Borrowers
          </p>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-3.5 sm:p-4.5 hover:shadow-md transition-all rounded-2xl flex flex-col justify-between min-h-[105px]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] sm:text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Overdue Returns</p>
              <p className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                {overdueIssuesCount} <span className="text-xs sm:text-sm font-semibold text-slate-500">Overdue</span>
              </p>
            </div>
            <div className="p-2 sm:p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50 shrink-0">
              <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <p className="text-[10px] sm:text-xs text-rose-600 font-bold mt-2 truncate">
            Late Fine Accumulating
          </p>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-3.5 sm:p-4.5 hover:shadow-md transition-all rounded-2xl flex flex-col justify-between min-h-[105px]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] sm:text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Reservations</p>
              <p className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {safeReservations.length} <span className="text-xs sm:text-sm font-semibold text-slate-500">Holds</span>
              </p>
            </div>
            <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 shrink-0">
              <BookmarkCheck className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <p className="text-[10px] sm:text-xs text-slate-500 font-semibold mt-2 truncate">
            {returnedIssuesCount} Returned All-Time
          </p>
        </Card>
      </div>

      {/* 🌟 Tabbed Views Container */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-2.5 sm:p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <TabsList className="inline-flex w-full sm:w-auto p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <TabsTrigger
              value="catalog"
              className="flex-1 sm:flex-initial data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm font-bold text-xs rounded-lg whitespace-nowrap py-1.5"
            >
              <BookOpen className="h-3.5 w-3.5 mr-1.5" /> Book Catalog ({safeBooks.length})
            </TabsTrigger>
            <TabsTrigger
              value="issues"
              className="flex-1 sm:flex-initial data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm font-bold text-xs rounded-lg whitespace-nowrap py-1.5"
            >
              <Clock className="h-3.5 w-3.5 mr-1.5" /> Circulation Log ({safeIssues.length})
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className="h-8.5 text-xs rounded-xl font-bold"
            >
              <LayoutGrid className="h-3.5 w-3.5 mr-1" /> Grid
            </Button>
            <Button
              variant={viewMode === "table" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="h-8.5 text-xs rounded-xl font-bold"
            >
              <ListFilter className="h-3.5 w-3.5 mr-1" /> Table
            </Button>
          </div>
        </div>

        {/* ─── TAB 1: CATALOG VIEW ─────────────────────────── */}
        <TabsContent value="catalog" className="space-y-4 m-0">
          {/* Search and Category Filter Strip */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by title, author, category, ISBN, or barcode tag..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs sm:text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { loadBooks(); loadIssues(); }}
                className="h-10 text-xs rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 font-semibold"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
          </div>

          {/* Category Quick Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
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
            <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-12 text-center rounded-2xl">
              <BookOpen className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p className="font-bold text-slate-700 dark:text-slate-300">No Library Books Matching Query</p>
              <p className="text-xs text-slate-500 mt-1">Try adjusting search filters or click "Add Title" to register new books.</p>
            </Card>
          ) : viewMode === "grid" ? (
            /* 🌟 LUXURY RESPONSIVE GRID VIEW (2 cols on tablet, 3 on laptop, 4 on wide) */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5">
              {filteredBooks.map(b => {
                const availabilityPct = Math.round(((b.available_copies || 0) / (b.total_copies || 1)) * 100);
                const isOutOfStock = b.available_copies <= 0;
                const isLowStock = b.available_copies > 0 && b.available_copies <= 2;

                return (
                  <Card key={b.id} className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between group rounded-2xl">
                    <CardHeader className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="p-2.5 sm:p-3 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shrink-0">
                            <BookOpen className="h-5 w-5 sm:h-6 sm:w-6" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 transition-colors line-clamp-1 text-sm sm:text-base">{b.title}</h3>
                            <p className="text-xs text-slate-500 font-medium truncate mt-0.5">by {b.author}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 text-[10px] sm:text-[11px] font-bold shrink-0">
                          {b.category}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 sm:p-5 space-y-3.5 flex-1">
                      {/* Meta Details Box */}
                      <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 text-[10px] uppercase font-extrabold">Shelf Location</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{b.shelf_location || "Rack A-1"}</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-slate-200/50 dark:border-slate-700/50 pt-1.5">
                          <span className="text-slate-400 text-[10px] uppercase font-extrabold">Barcode Tag</span>
                          <span className="font-mono font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <Barcode className="h-3.5 w-3.5" /> {b.barcode || "LIB-1001"}
                          </span>
                        </div>
                      </div>

                      {/* Stock Bar Progress */}
                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-slate-600 dark:text-slate-400">Available Stock:</span>
                          <span className={isOutOfStock ? "text-rose-600" : isLowStock ? "text-amber-600" : "text-emerald-600"}>
                            {b.available_copies} / {b.total_copies} Copies
                          </span>
                        </div>
                        <Progress value={availabilityPct} className={`h-2 ${isOutOfStock ? "bg-rose-100 text-rose-600" : "bg-blue-100"}`} />
                      </div>

                      {/* ISBN details */}
                      <div className="text-[10px] sm:text-[11px] text-slate-500 font-mono flex flex-wrap items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2 gap-1">
                        <span>ISBN: {b.isbn || "978-969-000-0"}</span>
                        <span className="text-slate-400 font-sans">{b.publisher || "Standard Edition"}</span>
                      </div>
                    </CardContent>

                    {/* Action Bar */}
                    <div className="p-3 sm:p-3.5 bg-slate-50/80 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-0.5">
                        <Button size="icon" variant="ghost" title="View Barcode Label" onClick={() => setShowBarcodeModal(b)} className="h-8 w-8 text-slate-600 hover:text-blue-600 rounded-lg">
                          <Barcode className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Edit Book Info" onClick={() => setShowEditBook(b)} className="h-8 w-8 text-slate-600 hover:text-blue-600 rounded-lg">
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Reserve Queue" onClick={() => handleReserveBook(b.id)} className="h-8 w-8 text-slate-600 hover:text-emerald-600 rounded-lg">
                          <BookmarkCheck className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Delete Book" onClick={() => handleDeleteBook(b.id, b.title)} className="h-8 w-8 text-slate-600 hover:text-rose-600 rounded-lg">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        disabled={isOutOfStock}
                        onClick={() => { setNewIssue({ ...newIssue, book_id: b.id }); setShowIssueModal(true); }}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold shadow-xs text-xs h-8 px-3 rounded-lg shrink-0"
                      >
                        <UserCheck className="h-3.5 w-3.5 mr-1" /> Issue
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            /* 🌟 LUXURY RESPONSIVE TABLE VIEW */
            <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                      <TableHead className="font-bold text-xs uppercase">Book Title & Author</TableHead>
                      <TableHead className="font-bold text-xs uppercase">Category</TableHead>
                      <TableHead className="font-bold text-xs uppercase">ISBN & Barcode</TableHead>
                      <TableHead className="font-bold text-xs uppercase">Shelf Rack</TableHead>
                      <TableHead className="font-bold text-xs uppercase">Available Stock</TableHead>
                      <TableHead className="text-right font-bold text-xs uppercase pr-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBooks.map(b => (
                      <TableRow key={b.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 font-bold border border-blue-100">
                              <BookOpen className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">{b.title}</p>
                              <p className="text-[11px] text-slate-500">by {b.author}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 text-[10px] font-bold">
                            {b.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="font-mono text-xs text-slate-700 dark:text-slate-300">{b.isbn || "978-969-0000"}</p>
                          <p className="font-mono text-[10px] font-bold text-blue-600">{b.barcode || "LIB-1001"}</p>
                        </TableCell>
                        <TableCell className="font-semibold text-xs text-slate-800 dark:text-slate-200">{b.shelf_location || "Rack A-1"}</TableCell>
                        <TableCell>
                          <div className="space-y-1 w-28 sm:w-32">
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{b.available_copies} / {b.total_copies} Copies</p>
                            <Progress value={Math.round((b.available_copies / (b.total_copies || 1)) * 100)} className="h-1.5 bg-blue-100" />
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" title="Edit" onClick={() => setShowEditBook(b)} className="h-7 w-7 p-0 text-slate-600 hover:text-blue-600 rounded-lg">
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" title="Delete" onClick={() => handleDeleteBook(b.id, b.title)} className="h-7 w-7 p-0 text-slate-600 hover:text-rose-600 rounded-lg">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              disabled={b.available_copies <= 0}
                              onClick={() => { setNewIssue({ ...newIssue, book_id: b.id }); setShowIssueModal(true); }}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-7 px-2.5 rounded-lg"
                            >
                              Issue
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ─── Active Circulation & Loans Tab ───────────── */}
        <TabsContent value="issues" className="space-y-4">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden">
            {/* Filter Controls Bar */}
            <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIssuesStatusFilter("all")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    issuesStatusFilter === "all"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                  }`}
                >
                  All Records ({safeIssues.length})
                </button>
                <button
                  type="button"
                  onClick={() => setIssuesStatusFilter("active")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    issuesStatusFilter === "active"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Active ({activeIssuesCount})
                </button>
                <button
                  type="button"
                  onClick={() => setIssuesStatusFilter("overdue")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    issuesStatusFilter === "overdue"
                      ? "bg-rose-600 text-white shadow-xs"
                      : "bg-white dark:bg-slate-800 text-rose-600 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50"
                  }`}
                >
                  Overdue ({overdueIssuesCount})
                </button>
                <button
                  type="button"
                  onClick={() => setIssuesStatusFilter("returned")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    issuesStatusFilter === "returned"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-white dark:bg-slate-800 text-emerald-700 border border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-50"
                  }`}
                >
                  Returned ({returnedIssuesCount})
                </button>
              </div>

              {/* Quick Search */}
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Search book or borrower..."
                  value={issuesSearch}
                  onChange={e => setIssuesSearch(e.target.value)}
                  className="pl-8 h-8 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl"
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
                  <p className="font-bold text-slate-700 dark:text-slate-300">No Circulation Records Found</p>
                  <p className="text-xs text-slate-500 mt-1">Try changing filters or issue a new book title.</p>
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden md:block w-full overflow-x-auto">
                    <table className="w-full text-left text-sm table-fixed border-collapse">
                      <thead>
                        <tr className="bg-slate-50/90 dark:bg-slate-800/80 text-xs border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                          <th className="w-[30%] px-4 py-3 font-bold text-left uppercase">Book & Barcode</th>
                          <th className="w-[24%] px-4 py-3 font-bold text-left uppercase">Borrower</th>
                          <th className="w-[18%] px-4 py-3 font-bold text-left uppercase">Timeline</th>
                          <th className="w-[16%] px-4 py-3 font-bold text-left uppercase">Status & Fine</th>
                          <th className="w-[12%] px-4 py-3 font-bold text-right pr-4 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredIssues.map(i => {
                          const book = bookMap[i.book_id] || safeBooks.find(b => b.id === i.book_id);
                          const borrower = borrowerMap[i.borrower_id];
                          const displayName = borrower ? borrower.name : "Student Member";
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
                                  <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shrink-0">
                                    <BookOpen className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate" title={book?.title || "Library Book"}>
                                      {book ? book.title : "Library Book"}
                                    </p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <span className="font-mono text-[10px] text-blue-700 dark:text-blue-300 font-bold bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.2 rounded border border-blue-200/60 dark:border-blue-800/40 shrink-0">
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
                                    <p className="font-bold text-slate-800 dark:text-slate-200 text-xs truncate">{displayName}</p>
                                    <p className="text-[10px] text-slate-400 font-mono truncate">{displayCode}</p>
                                  </div>
                                </div>
                              </td>

                              {/* Timeline */}
                              <td className="px-4 py-3 align-middle text-xs">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1 text-slate-500 text-[11px]">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Out:</span> {i.issue_date || "2026-07-24"}
                                  </div>
                                  <div className={`flex items-center gap-1 font-bold text-[11px] ${isOverdue ? "text-rose-600" : "text-slate-800 dark:text-slate-200"}`}>
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Due:</span> {i.due_date}
                                  </div>
                                </div>
                              </td>

                              {/* Status & Fine */}
                              <td className="px-4 py-3 align-middle">
                                <div className="flex flex-col items-start gap-1">
                                  {i.status === "returned" ? (
                                    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 text-[10px] py-0.5 px-2 font-bold">
                                      <CheckCircle2 className="h-3 w-3 mr-1" /> Returned
                                    </Badge>
                                  ) : isOverdue ? (
                                    <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] py-0.5 px-2 font-bold animate-pulse">
                                      <AlertTriangle className="h-3 w-3 mr-1" /> Overdue ({daysLate}d)
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 text-[10px] py-0.5 px-2 font-bold">
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
                                    className="h-7 px-2 text-xs text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                  >
                                    <Eye className="h-3.5 w-3.5 mr-1" /> Info
                                  </Button>
                                  {i.status !== "returned" && (
                                    <Button
                                      size="sm"
                                      onClick={() => handleReturnBook(i.id)}
                                      className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs rounded-lg"
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

                  {/* Mobile High-Density Stacked Cards */}
                  <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredIssues.map(i => {
                      const book = bookMap[i.book_id] || safeBooks.find(b => b.id === i.book_id);
                      const borrower = borrowerMap[i.borrower_id];
                      const displayName = borrower ? borrower.name : "Student Member";
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
                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] py-0 px-2 font-bold">Returned</Badge>
                              ) : isOverdue ? (
                                <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] py-0 px-2 font-bold animate-pulse">Overdue ({daysLate}d)</Badge>
                              ) : (
                                <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] py-0 px-2 font-bold">Issued</Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                            <div>
                              <p className="font-bold text-slate-800 dark:text-slate-200 text-xs">{displayName}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{displayCode}</p>
                            </div>
                            <div className="text-right font-mono text-[11px]">
                              <p className="text-slate-500">Due: <span className={isOverdue ? "text-rose-600 font-bold" : "font-bold text-slate-800"}>{i.due_date}</span></p>
                              {dynamicFine > 0 ? (
                                <p className="text-[10px] text-rose-600 font-bold">Fine: PKR {dynamicFine.toFixed(0)}</p>
                              ) : (
                                <p className="text-[10px] text-blue-600 font-bold">{book?.barcode || "LIB-1001"}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-0.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedLoanDetail({ issue: i, book, borrower })}
                              className="h-7 text-xs text-slate-600 hover:text-blue-600 rounded-lg"
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" /> Info
                            </Button>
                            {i.status !== "returned" && (
                              <Button
                                size="sm"
                                onClick={() => handleReturnBook(i.id)}
                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg"
                              >
                                <Check className="h-3.5 w-3.5 mr-1" /> Return Book
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
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold flex items-center gap-2">
              <Plus className="h-5 w-5" /> Add New Book to Library Catalog
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-bold">Book Title</Label>
              <Input placeholder="e.g. Fundamental Physics" value={newBook.title} onChange={e => setNewBook({ ...newBook, title: e.target.value })} className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs font-bold">Author Name</Label>
              <Input placeholder="e.g. David Halliday & Robert Resnick" value={newBook.author} onChange={e => setNewBook({ ...newBook, author: e.target.value })} className="mt-1 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold">Category</Label>
                <Input placeholder="Science / General" value={newBook.category} onChange={e => setNewBook({ ...newBook, category: e.target.value })} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs font-bold">Total Copies</Label>
                <Input type="number" value={newBook.total_copies} onChange={e => setNewBook({ ...newBook, total_copies: parseInt(e.target.value) || 1 })} className="mt-1 rounded-xl" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold">Shelf Location / Rack</Label>
                <Input placeholder="Rack A-1" value={newBook.shelf_location} onChange={e => setNewBook({ ...newBook, shelf_location: e.target.value })} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs font-bold">Publisher</Label>
                <Input placeholder="Wiley / Oxford" value={newBook.publisher} onChange={e => setNewBook({ ...newBook, publisher: e.target.value })} className="mt-1 rounded-xl" />
              </div>
            </div>
            <Button onClick={handleAddBook} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-5 rounded-xl shadow-md">
              Save to Catalog
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── EDIT BOOK MODAL ─────────────────────────── */}
      <Dialog open={!!showEditBook} onOpenChange={() => setShowEditBook(null)}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold flex items-center gap-2">
              <Edit3 className="h-5 w-5" /> Edit Book Details
            </DialogTitle>
          </DialogHeader>
          {showEditBook && (
            <div className="space-y-4 pt-2">
              <div>
                <Label className="text-xs font-bold">Book Title</Label>
                <Input value={showEditBook.title} onChange={e => setShowEditBook({ ...showEditBook, title: e.target.value })} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs font-bold">Author</Label>
                <Input value={showEditBook.author} onChange={e => setShowEditBook({ ...showEditBook, author: e.target.value })} className="mt-1 rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold">Category</Label>
                  <Input value={showEditBook.category} onChange={e => setShowEditBook({ ...showEditBook, category: e.target.value })} className="mt-1 rounded-xl" />
                </div>
                <div>
                  <Label className="text-xs font-bold">Shelf Rack</Label>
                  <Input value={showEditBook.shelf_location || ""} onChange={e => setShowEditBook({ ...showEditBook, shelf_location: e.target.value })} className="mt-1 rounded-xl" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold">Total Copies</Label>
                  <Input type="number" value={showEditBook.total_copies} onChange={e => setShowEditBook({ ...showEditBook, total_copies: parseInt(e.target.value) || 1 })} className="mt-1 rounded-xl" />
                </div>
                <div>
                  <Label className="text-xs font-bold">Available Copies</Label>
                  <Input type="number" value={showEditBook.available_copies} onChange={e => setShowEditBook({ ...showEditBook, available_copies: parseInt(e.target.value) || 0 })} className="mt-1 rounded-xl" />
                </div>
              </div>
              <Button onClick={handleUpdateBook} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-5 rounded-xl shadow-md">
                Update Book Record
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── ISSUE BOOK MODAL WITH FINE SYSTEM ─────────── */}
      <Dialog open={showIssueModal} onOpenChange={setShowIssueModal}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold flex items-center gap-2">
              <UserCheck className="h-5 w-5" /> Issue Book & Configure Late Fine
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="mb-1.5 block font-bold text-xs">Select Book Title</Label>
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-1.5">
                <Label className="font-bold text-xs">Select Borrower (Students & Teachers)</Label>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[10px] sm:text-[11px] self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setBorrowerCategoryFilter("all")}
                    className={`px-2 py-0.5 rounded-md font-semibold transition-all ${
                      borrowerCategoryFilter === "all" ? "bg-white dark:bg-slate-700 shadow-xs text-blue-700 dark:text-blue-300" : "text-slate-500"
                    }`}
                  >
                    All ({borrowers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBorrowerCategoryFilter("student")}
                    className={`px-2 py-0.5 rounded-md font-semibold transition-all ${
                      borrowerCategoryFilter === "student" ? "bg-white dark:bg-slate-700 shadow-xs text-blue-700 dark:text-blue-300" : "text-slate-500"
                    }`}
                  >
                    🎓 Students ({borrowers.filter(b => b.type === "student").length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBorrowerCategoryFilter("teacher")}
                    className={`px-2 py-0.5 rounded-md font-semibold transition-all ${
                      borrowerCategoryFilter === "teacher" ? "bg-white dark:bg-slate-700 shadow-xs text-blue-700 dark:text-blue-300" : "text-slate-500"
                    }`}
                  >
                    👨‍🏫 Teachers ({borrowers.filter(b => b.type === "teacher").length})
                  </button>
                </div>
              </div>
              <SearchableSelect
                placeholder="Search student or teacher by name, roll, or ID..."
                options={borrowers
                  .filter(b => borrowerCategoryFilter === "all" || b.type === borrowerCategoryFilter)
                  .map(b => ({
                    id: b.id,
                    label: `${b.type === "student" ? "🎓" : "👨‍🏫"} ${b.name}`,
                    sublabel: `${b.type === "student" ? "STUDENT" : "FACULTY"} • ${b.code || ""} ${b.details ? `(${b.details})` : ""}`
                  }))}
                value={newIssue.borrower_id}
                onChange={val => {
                  const b = borrowers.find(item => item.id === val);
                  setNewIssue({ ...newIssue, borrower_id: val, borrower_type: b?.type === "teacher" ? "staff" : "student" });
                }}
              />
            </div>

            {/* Loan Duration / Due Days */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="font-bold text-xs flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-blue-600" /> Loan Duration
                </Label>
                <span className="text-[11px] font-mono font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200">
                  {newIssue.due_days} Days
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[7, 14, 21, 30].map(days => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setNewIssue({ ...newIssue, due_days: days })}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all border ${
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
                <Label className="font-bold text-xs flex items-center gap-1.5">
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
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all border ${
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
                  className="h-8 text-xs font-bold rounded-lg"
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

            <Button onClick={handleIssueBook} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-5 rounded-xl shadow-md">
              Confirm Issue Book
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── DIGITAL BARCODE PREVIEW MODAL ────────────────── */}
      <Dialog open={!!showBarcodeModal} onOpenChange={() => setShowBarcodeModal(null)}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-center rounded-2xl">
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
                
                <div className="my-6 py-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 font-mono tracking-widest text-xl font-bold text-blue-600 flex flex-col items-center justify-center shadow-inner">
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
              <Button onClick={() => { toast.success("Barcode label sent to library printer"); setShowBarcodeModal(null); }} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-5 rounded-xl shadow-md">
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
            <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 max-w-2xl p-0 overflow-hidden shadow-2xl rounded-2xl sm:rounded-3xl">
              {/* Header Banner */}
              <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-700 p-5 sm:p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md border border-white/20">
                      <BookOpen className="h-6 w-6 text-blue-100" />
                    </div>
                    <div>
                      <h3 className="text-lg sm:text-xl font-bold">Book Circulation Passport</h3>
                      <p className="text-blue-100 text-xs mt-0.5">Circulation Record ID: #{selectedLoanDetail.issue.id.slice(0, 8).toUpperCase()}</p>
                    </div>
                  </div>
                  <Badge className={selectedLoanDetail.issue.status === "returned" ? "bg-emerald-500 text-white font-bold" : isOverdue ? "bg-rose-500 text-white font-bold animate-pulse" : "bg-blue-500 text-white font-bold"}>
                    {selectedLoanDetail.issue.status === "returned" ? "RETURNED" : isOverdue ? `OVERDUE (${daysLate}d)` : "ISSUED"}
                  </Badge>
                </div>
              </div>

              <div className="p-5 sm:p-6 space-y-5">
                {/* BOOK DETAILS SPECIFICATION */}
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4" /> Book Inventory Specifications
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <div>
                      <p className="text-xs text-slate-500">Book Title</p>
                      <p className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base">{selectedLoanDetail.book?.title || "Unknown Title"}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">by {selectedLoanDetail.book?.author || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Category & Shelf Location</p>
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">{selectedLoanDetail.book?.category || "General"} • {selectedLoanDetail.book?.shelf_location || "Rack A-1"}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Stock: {selectedLoanDetail.book?.available_copies ?? 1} / {selectedLoanDetail.book?.total_copies ?? 1} Copies</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Barcode Identifier</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-xs font-bold bg-blue-100 text-blue-800 px-2.5 py-1 rounded-lg border border-blue-200 flex items-center gap-1">
                          <Barcode className="h-3.5 w-3.5 text-blue-600" />
                          {selectedLoanDetail.book?.barcode || "LIB-1001"}
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">ISBN Serial Code</p>
                      <p className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                        {selectedLoanDetail.book?.isbn || "978-969-0000-00-0"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* BORROWER & SCHEDULE SUMMARY */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                      <User className="h-4 w-4" /> Borrower Info
                    </p>
                    <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                      {selectedLoanDetail.borrower?.name || "Student Member"}
                    </p>
                    <p className="text-xs text-slate-500 font-mono font-semibold">
                      Role: {selectedLoanDetail.issue.borrower_type?.toUpperCase() || "STUDENT"}
                    </p>
                    <p className="text-xs text-slate-500 font-mono font-semibold">
                      Code / Roll: {selectedLoanDetail.borrower?.code || "#1001"}
                    </p>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <Clock className="h-4 w-4" /> Loan Schedule & Fine Policy
                    </p>
                    <div className="text-xs space-y-1">
                      <p className="text-slate-600 dark:text-slate-400">Issue Date: <span className="font-bold text-slate-900 dark:text-slate-100">{selectedLoanDetail.issue.issue_date || "2026-07-24"}</span></p>
                      <p className="text-slate-600 dark:text-slate-400">Due Date: <span className={`font-bold ${isOverdue ? "text-rose-600" : "text-blue-600"}`}>{selectedLoanDetail.issue.due_date}</span></p>
                      <p className="text-slate-600 dark:text-slate-400">Fine Rate: <span className="font-bold text-amber-600">PKR {dailyRate.toFixed(2)} / day</span></p>
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
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl"
                    >
                      <Check className="h-4 w-4 mr-1.5" /> Return Book Now
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setSelectedLoanDetail(null)} className="rounded-xl font-semibold">
                    Close
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
