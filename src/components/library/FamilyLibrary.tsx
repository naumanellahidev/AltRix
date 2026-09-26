import { localDay } from "@/lib/local-date";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertCircle, BookOpen, Bookmark, CheckCircle2, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { date as formatDate, money } from "@/lib/documents/format";

/**
 * A student's library, for the student or their parent: the books they have
 * out, the catalogue, and reservations, all from the school's library records.
 *
 * Both screens showed the same two invented loans (one "overdue", with a fine
 * warning), an invented four-book catalogue, and a "reservation submitted"
 * message for a reservation that was never made.
 */

interface Book {
  id: string;
  title: string;
  author: string;
  category?: string | null;
  isbn?: string | null;
  available_copies?: number | null;
  total_copies?: number | null;
}

interface Loan {
  id: string;
  book_id: string;
  issue_date: string | null;
  due_date: string;
  return_date: string | null;
  status: string;
  fine_amount?: number | string | null;
  fine_paid?: boolean | null;
}

interface Reservation {
  id: string;
  book_id: string;
  status: string;
  reserved_at: string | null;
}

export function FamilyLibrary({ studentId, studentName, audience }: {
  studentId: string | null;
  studentName?: string | null;
  audience: "student" | "parent";
}) {
  const [tab, setTab] = useState<"loans" | "catalog">("loans");
  const [search, setSearch] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reserving, setReserving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setError(null);
    try {
      const [b, l, r] = await Promise.all([
        apiClient.get<Book[]>("/library/books"),
        apiClient.get<Loan[]>("/library/issues"),
        apiClient.get<Reservation[]>("/library/reservations"),
      ]);
      setBooks(b.data ?? []);
      // The server returns this family's loans only; one child's here.
      setLoans((l.data ?? []).filter((x: any) => String(x.borrower_id) === String(studentId)));
      setReservations((r.data ?? []).filter((x: any) => String(x.student_id) === String(studentId)));
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "The library could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const bookById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const today = localDay();
  const current = loans.filter((l) => l.status !== "returned");
  const reservedIds = new Set(reservations.filter((r) => r.status === "pending").map((r) => r.book_id));

  const catalog = books.filter((b) => {
    const q = search.trim().toLowerCase();
    return !q || [b.title, b.author, b.category, b.isbn].some((v) => (v ?? "").toLowerCase().includes(q));
  });

  const reserve = async (book: Book) => {
    if (!studentId) return;
    setReserving(book.id);
    try {
      await apiClient.post("/library/reservations", { book_id: book.id, student_id: studentId });
      toast.success(`"${book.title}" reserved. The librarian will tell you when it is ready.`);
      void load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || "The reservation could not be made.");
    } finally {
      setReserving(null);
    }
  };

  if (!studentId) {
    return (
      <p className="text-sm text-muted-foreground p-6">
        {audience === "parent" ? "Select a child to see their library." : "Your student record is not linked to this login yet."}
      </p>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6">
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-700 text-white rounded-2xl p-6 shadow-lg">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-xl border border-white/20">
              <BookOpen className="h-8 w-8 text-blue-100" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Library</h1>
              <p className="text-blue-100 text-sm mt-0.5">
                Books issued to {audience === "parent" ? (studentName || "your child") : "you"}, due dates and fines, and the school's catalogue.
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <Button variant={tab === "loans" ? "default" : "ghost"} onClick={() => setTab("loans")} className="font-semibold">
          <BookOpen className="h-4 w-4 mr-2" /> Books out ({current.length})
        </Button>
        <Button variant={tab === "catalog" ? "default" : "ghost"} onClick={() => setTab("catalog")} className="font-semibold">
          <Search className="h-4 w-4 mr-2" /> Catalogue
        </Button>
      </div>

      {loading && !books.length ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : tab === "loans" ? (
        current.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {audience === "parent" ? "No library books are out at the moment." : "You have no library books out."}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {current.map((loan) => {
              const book = bookById.get(loan.book_id);
              const overdue = loan.due_date < today;
              const fine = Number(loan.fine_amount ?? 0) > 0 ? money(loan.fine_amount as any, { currency: "PKR" }) : null;
              return (
                <Card key={loan.id} className="border border-slate-200 shadow-sm">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base leading-tight">{book?.title ?? "A book no longer in the catalogue"}</h3>
                        {book?.author && <p className="text-xs text-slate-500 mt-0.5">{book.author}</p>}
                      </div>
                      {overdue ? (
                        <Badge className="bg-rose-100 text-rose-800 border-rose-200 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> Overdue
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> On loan
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl">
                      <div>
                        <span className="text-slate-400 font-medium">Issued</span>
                        <p className="font-semibold text-slate-700">{formatDate(loan.issue_date)}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Due back</span>
                        <p className={`font-bold ${overdue ? "text-rose-600" : "text-slate-900"}`}>{formatDate(loan.due_date)}</p>
                      </div>
                    </div>
                    {fine && (
                      <p className="text-xs text-rose-600 font-medium bg-rose-50 p-2.5 rounded-lg border border-rose-200/50">
                        Fine so far: {fine}{loan.fine_paid ? " (paid)" : ""}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <Input placeholder="Search by title, author, subject or ISBN..." value={search}
              onChange={(e) => setSearch(e.target.value)} className="pl-10 h-10 rounded-xl" />
          </div>
          {catalog.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {books.length ? "No book matches your search." : "The library catalogue is empty."}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {catalog.map((book) => {
                const available = (book.available_copies ?? 0) > 0;
                const reserved = reservedIds.has(book.id);
                return (
                  <Card key={book.id} className="border border-slate-200 p-5 shadow-sm">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        {book.category && <Badge variant="secondary" className="text-[10px] mb-1.5">{book.category}</Badge>}
                        <h4 className="font-bold text-slate-900 text-sm">{book.title}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">{book.author}</p>
                      </div>
                      <Button disabled={reserved || reserving === book.id} onClick={() => void reserve(book)} size="sm"
                        className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                        {reserving === book.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Bookmark className="h-3.5 w-3.5 mr-1" />}
                        {reserved ? "Reserved" : "Reserve"}
                      </Button>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400 border-t pt-2 border-slate-100">
                      <span>{book.isbn ? `ISBN ${book.isbn}` : "ISBN not recorded"}</span>
                      <span className={available ? "text-emerald-600 font-semibold" : "text-rose-500 font-semibold"}>
                        {book.available_copies == null ? "Copies not recorded"
                          : available ? `${book.available_copies} of ${book.total_copies ?? book.available_copies} available` : "All copies out"}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
