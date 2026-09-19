/**
 * Who a document belongs to: the school whose name, crest and colour it carries.
 *
 * Every export in the app needs this, and the helpers that had it were
 * wrong in quiet ways. The spreadsheet exporter read the school name from a
 * localStorage key the app stopped writing long ago, so every "branded" Excel
 * file went out with a blank where the school's name should be.
 *
 * `activeSchoolBrandSync` answers immediately from what the page already knows.
 * `loadActiveSchoolBrand` fills in the rest — logo, address, phone — once, and
 * caches it for the session.
 */
import { api } from "@/lib/api";

import { tryLoadImage, type LoadedImage } from "./assets";
import { parseColor, type Rgb } from "./theme";

export interface SchoolBrand {
  id: string | null;
  slug: string | null;
  name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  motto: string | null;
  logoUrl: string | null;
  /** Loaded logo, ready to embed. Null if there is none or it failed. */
  logo: LoadedImage | null;
  /** The school's colour as RGB, and as #rrggbb for spreadsheet styles. */
  accent: Rgb;
  accentHex: string;
  /** Why the logo is missing, when it was expected and could not be loaded. */
  logoProblem: string | null;
}

const FALLBACK_ACCENT: Rgb = [15, 76, 129];

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function currentSlug(): string | null {
  if (typeof window === "undefined") return null;
  const first = window.location.pathname.split("/").filter(Boolean)[0];
  return first ? first.toLowerCase() : null;
}

function cachedTenant(slug: string | null): { id: string; name: string } | null {
  if (!slug) return null;
  for (const key of [`eduverse_tenant_basic_${slug}`, `eduverse_tenant_${slug}`]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const data = parsed?.data ?? parsed;
      if (data?.id && data?.name) return { id: String(data.id), name: String(data.name) };
    } catch {
      // Unreadable storage is the same as no cache.
    }
  }
  return null;
}

function accentFromPage(): Rgb {
  if (typeof document === "undefined") return FALLBACK_ACCENT;
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim();
    return parseColor(value) ?? FALLBACK_ACCENT;
  } catch {
    return FALLBACK_ACCENT;
  }
}

/**
 * The platform's own name, for documents produced outside any school — the
 * super admin's audit log, billing, backups. Set by the super admin in brand
 * settings; "AltRix" until then.
 */
function platformName(): string {
  try {
    const raw = localStorage.getItem("altrix_global_brand_settings");
    const name = raw ? JSON.parse(raw)?.brandName : null;
    if (typeof name === "string" && name.trim()) return name.trim();
  } catch {
    // Unreadable settings fall back to the product name.
  }
  return "AltRix";
}

const PLATFORM_PATHS = new Set(["super_admin", "platform", "admin"]);

/** What the page knows right now, without a request. */
export function activeSchoolBrandSync(): SchoolBrand {
  const slug = currentSlug();
  const tenant = PLATFORM_PATHS.has(slug ?? "") ? null : cachedTenant(slug);
  const accent = accentFromPage();
  return {
    id: tenant?.id ?? null,
    slug,
    name: tenant?.name ?? (PLATFORM_PATHS.has(slug ?? "") ? platformName() : null),
    address: null,
    phone: null,
    email: null,
    website: null,
    motto: null,
    logoUrl: null,
    logo: null,
    accent,
    accentHex: toHex(accent),
    logoProblem: null,
  };
}

const CACHE = new Map<string, Promise<SchoolBrand>>();

/**
 * The full brand for the current (or given) school, logo loaded.
 *
 * Never throws: a school whose details cannot be fetched still gets a
 * document with whatever was known, and `logoProblem` says what went missing.
 */
export function loadActiveSchoolBrand(schoolId?: string | null): Promise<SchoolBrand> {
  const base = activeSchoolBrandSync();
  const id = schoolId ?? base.id;
  if (!id) return Promise.resolve(base);

  let pending = CACHE.get(id);
  if (pending) return pending;

  pending = (async () => {
    try {
      const [{ data: school }, { data: branding }] = await Promise.all([
        api.from("schools").select("id,slug,name,address,phone,email,website,motto,logo_url").eq("id", id).maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (api as any)
          .from("school_branding")
          .select("accent_hue,accent_saturation,accent_lightness")
          .eq("school_id", id)
          .maybeSingle(),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (school ?? {}) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = branding as any;
      const accent =
        (b && parseColor(`${b.accent_hue ?? 210} ${b.accent_saturation ?? 100}% ${b.accent_lightness ?? 50}%`)) ||
        base.accent;

      const logoUrl: string | null = s.logo_url ?? null;
      const { image, failure } = await tryLoadImage(logoUrl, "school-logos");

      return {
        id,
        slug: s.slug ?? base.slug,
        name: s.name ?? base.name,
        address: s.address ?? null,
        phone: s.phone ?? null,
        email: s.email ?? null,
        website: s.website ?? null,
        motto: s.motto ?? null,
        logoUrl,
        logo: image,
        accent,
        accentHex: toHex(accent),
        logoProblem: failure ? `the school logo could not be loaded (${failure.reason})` : null,
      } satisfies SchoolBrand;
    } catch {
      CACHE.delete(id);
      return base;
    }
  })();

  CACHE.set(id, pending);
  return pending;
}

/** Forget the cached brand — after a school changes its logo or colour. */
export function clearSchoolBrandCache(): void {
  CACHE.clear();
}
