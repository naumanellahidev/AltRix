import { useEffect, useState, useMemo } from "react";
import { apiClient } from "@/lib/api-client";
import { downloadCertificate } from "@/lib/documents/certificate";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Award, FileDown, Calendar, Search, RefreshCw, Trophy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ChildInfo } from "@/hooks/useMyChildren";

// The school's issued certificates. The PDF is drawn from the record on
// download (the documents library), so there is no stored file to link to.
interface Certificate {
  id: string;
  title: string;
  certificate_type: string;
  certificate_number: string;
  issue_date: string | null;
  status: string;
}

async function loadCertificates(studentId: string): Promise<Certificate[]> {
  const [types, certs] = await Promise.all([
    apiClient.get<{ type: string; title: string }[]>("/documents/certificates/types"),
    apiClient.get<any[]>("/documents/certificates", { params: { student_id: studentId } }),
  ]);
  const titles = new Map((types.data ?? []).map((t) => [t.type, t.title]));
  return (certs.data ?? []).map((c) => ({
    id: c.id,
    title: titles.get(c.certificate_type) ?? c.certificate_type.replace(/_/g, " "),
    certificate_type: c.certificate_type,
    certificate_number: c.certificate_number,
    issue_date: c.issue_date,
    status: c.status,
  }));
}

interface ParentCertificatesModuleProps {
  child: ChildInfo | null;
  schoolId: string | null;
}

export default function ParentCertificatesModule({ child, schoolId }: ParentCertificatesModuleProps) {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [downloading, setDownloading] = useState<string | null>(null);

  const download = async (cert: Certificate) => {
    setDownloading(cert.id);
    try {
      const { warnings } = await downloadCertificate(cert.id);
      warnings.forEach((w) => toast.warning(w));
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || "The certificate could not be downloaded");
    } finally {
      setDownloading(null);
    }
  };

  const fetchCertificates = async () => {
    if (!child || !schoolId) return;
    setLoading(true);
    try {
      setCertificates(await loadCertificates(child.student_id));
    } catch (err: any) {
      console.error("Error fetching certificates:", err);
      toast.error(err?.response?.data?.detail || err?.message || "Failed to load certificates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCertificates();
  }, [child, schoolId]);

  const filteredCertificates = useMemo(() => {
    return certificates.filter((cert) => {
      const matchesSearch = cert.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cert.certificate_type.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = selectedType === "all" || cert.certificate_type.toLowerCase() === selectedType.toLowerCase();
      return matchesSearch && matchesType;
    });
  }, [certificates, searchQuery, selectedType]);

  const certificateTypes = useMemo(() => {
    const types = new Set(certificates.map(c => c.certificate_type));
    return Array.from(types);
  }, [certificates]);

  if (!child) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
        <Award className="h-10 w-10 text-slate-300 mb-2" />
        <p className="text-sm font-semibold text-slate-600">No Child Selected</p>
        <p className="text-xs text-slate-400 mt-1">Please select a child to view their certificates.</p>
      </div>
    );
  }

  const childName = [child.first_name, child.last_name].filter(Boolean).join(" ");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-800">Certificates & Awards</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Recognitions and achievements issued to <span className="font-semibold text-blue-600">{childName}</span>
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchCertificates} 
          disabled={loading}
          className="gap-2 border-slate-200 hover:bg-slate-50 hover:text-blue-600 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search certificates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-white border-slate-200 focus-visible:ring-blue-500 rounded-xl"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <Button
            variant={selectedType === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedType("all")}
            className="rounded-xl shrink-0"
          >
            All
          </Button>
          {certificateTypes.map((type) => (
            <Button
              key={type}
              variant={selectedType.toLowerCase() === type.toLowerCase() ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedType(type)}
              className="rounded-xl capitalize shrink-0"
            >
              {type.replace("_", " ")}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <Card key={n} className="overflow-hidden border-slate-100 shadow-sm animate-pulse">
              <div className="h-32 bg-slate-100" />
              <CardContent className="p-5 space-y-3">
                <div className="h-4 bg-slate-100 rounded w-3/4" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
                <div className="h-8 bg-slate-100 rounded mt-4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredCertificates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white border border-slate-100 rounded-2xl shadow-sm">
          <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 mb-4 ring-8 ring-blue-50/50">
            <Trophy className="h-8 w-8" />
          </div>
          <h3 className="font-display text-base font-bold text-slate-800">No Certificates Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            {searchQuery || selectedType !== "all" 
              ? "We couldn't find any certificates matching your filters." 
              : `No certificates have been issued to ${childName} yet.`}
          </p>
          {(searchQuery || selectedType !== "all") && (
            <Button 
              variant="soft" 
              onClick={() => { setSearchQuery(""); setSelectedType("all"); }}
              className="mt-4 text-xs font-semibold"
            >
              Reset Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCertificates.map((cert) => (
            <Card 
              key={cert.id} 
              className="group overflow-hidden border-slate-100 bg-white shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated hover:border-blue-100"
            >
              <div className="relative h-28 bg-gradient-to-tr from-blue-600 via-blue-500 to-blue-400 p-5 flex flex-col justify-between overflow-hidden">
                {/* Decorative design rings */}
                <div className="absolute -right-8 -bottom-8 h-28 w-28 rounded-full bg-white/10" />
                <div className="absolute -right-2 -top-12 h-24 w-24 rounded-full bg-white/5" />
                
                <div className="flex justify-between items-start">
                  <span className="p-2 rounded-lg bg-white/15 backdrop-blur-md text-white">
                    <Trophy className="h-5 w-5" />
                  </span>
                  <Badge className="bg-white/25 text-white backdrop-blur-md border-none capitalize text-[10px] font-bold tracking-wider">
                    {cert.certificate_type.replace("_", " ")}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-1.5 text-white/90 text-[10px] font-semibold">
                  <Calendar className="h-3 w-3" />
                  {cert.issue_date ? new Date(cert.issue_date).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "long",
                    year: "numeric"
                  }) : "Date not set"}
                </div>
              </div>
              
              <CardContent className="p-5 flex flex-col justify-between min-h-[140px]">
                <div className="space-y-1.5">
                  <h4 className="font-display text-sm font-bold text-slate-800 line-clamp-2 leading-tight group-hover:text-blue-700 transition-colors">
                    {cert.title}
                  </h4>
                  <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">
                    Issued to {childName} · {cert.certificate_number}
                  </p>
                  {cert.status !== "valid" && (
                    <Badge variant="destructive" className="text-[10px] capitalize">{cert.status}</Badge>
                  )}
                </div>
                
                <Button
                  variant="soft"
                  size="sm"
                  className="w-full mt-4 gap-2 rounded-xl text-xs font-semibold"
                  disabled={downloading === cert.id}
                  onClick={() => download(cert)}
                >
                  {downloading === cert.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <FileDown className="h-3.5 w-3.5" />}
                  Download PDF Certificate
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
