import { useEffect, useState } from "react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";

export type SchoolDocumentBranding = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  motto: string | null;
};

const cache = new Map<string, SchoolDocumentBranding>();

export function useSchoolDocument(schoolId: string | null) {
  const [school, setSchool] = useState<SchoolDocumentBranding | null>(
    schoolId ? cache.get(schoolId) ?? null : null,
  );
  const [loading, setLoading] = useState(!school && !!schoolId);

  useEffect(() => {
    let cancelled = false;
    if (!schoolId) {
      setSchool(null);
      setLoading(false);
      return;
    }
    if (cache.has(schoolId)) {
      setSchool(cache.get(schoolId)!);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        let schoolData: SchoolDocumentBranding | null = null;
        if (USE_FASTAPI) {
          const resp = await apiClient.get<SchoolDocumentBranding>(`/schools/${schoolId}`);
          schoolData = resp.data;
        } else {
          const { data } = await supabase
            .from("schools")
            .select("id,name,slug,logo_url,address,phone,email,website,motto")
            .eq("id", schoolId)
            .maybeSingle();
          schoolData = data as SchoolDocumentBranding | null;
        }
        if (cancelled) return;
        if (schoolData) {
          cache.set(schoolId, schoolData);
          setSchool(schoolData);
        }
      } catch (e) {
        console.error("Failed to load school document branding", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  return { school, loading };
}
