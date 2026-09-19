/**
 * Getting images into a document.
 *
 * A PDF cannot reference a URL: whatever is drawn has to be bytes the renderer
 * already holds. That is why logos kept vanishing from generated documents —
 * the code handed a `/api/storage/files/...` URL to the renderer, the renderer
 * fetched it without an Authorization header, the server answered 401, and the
 * document was produced with a blank where the crest should be. Nothing failed
 * loudly; the school just got an unbranded voucher.
 *
 * So everything here resolves to a data: URI before drawing, storage paths go
 * through a signed URL first, and a failure is reported rather than swallowed.
 */
import { api } from "@/lib/api";

export interface LoadedImage {
  /** data:image/...;base64,... — ready for jsPDF.addImage. */
  data: string;
  /** "PNG" | "JPEG" | "WEBP", as jsPDF names them. */
  format: string;
  width: number;
  height: number;
}

export interface ImageLoadFailure {
  source: string;
  reason: string;
}

const CACHE = new Map<string, LoadedImage>();

function formatFromMime(mime: string): string {
  const lower = mime.toLowerCase();
  if (lower.includes("png")) return "PNG";
  if (lower.includes("webp")) return "WEBP";
  if (lower.includes("jpeg") || lower.includes("jpg")) return "JPEG";
  return "PNG";
}

/** Decode a data: URI far enough to know its dimensions. */
function measure(dataUri: string, format: string): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ data: dataUri, format, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("the image data could not be decoded"));
    img.src = dataUri;
  });
}

async function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("the image could not be read"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Load an image for a document.
 *
 * Accepts a data: URI (used as-is), an absolute URL (fetched), or a storage
 * object path such as `school-logos/abc.png` (signed, then fetched).
 *
 * Throws on failure. Callers that can live without the image should use
 * {@link tryLoadImage} instead, which reports rather than throws — but they
 * must still surface that report, not discard it.
 */
export async function loadImage(source: string, bucket = "public-assets"): Promise<LoadedImage> {
  const key = `${bucket}:${source}`;
  const cached = CACHE.get(key);
  if (cached) return cached;

  if (source.startsWith("data:")) {
    const mime = /^data:([^;]+)/.exec(source)?.[1] ?? "image/png";
    const loaded = await measure(source, formatFromMime(mime));
    CACHE.set(key, loaded);
    return loaded;
  }

  let url = source;

  // A storage path, not a URL: mint a signed link the browser may fetch.
  if (!/^https?:\/\//i.test(source)) {
    const { data, error } = await api.storage.from(bucket).createSignedUrl(source, 600);
    if (error || !data?.signedUrl) {
      throw new Error(
        `could not sign "${source}" in bucket "${bucket}": ${error?.message ?? "no URL returned"}`,
      );
    }
    url = data.signedUrl;
  }

  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`fetching "${source}" returned ${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error(`"${source}" is ${blob.type || "of unknown type"}, not an image`);
  }

  const dataUri = await blobToDataUri(blob);
  const loaded = await measure(dataUri, formatFromMime(blob.type));
  CACHE.set(key, loaded);
  return loaded;
}

/**
 * Load an image, reporting failure instead of throwing.
 *
 * The caller receives either the image or the reason there is none, and is
 * expected to do something with the reason — put it in the warnings a
 * generation result carries, so a principal whose crest is missing from four
 * hundred certificates finds out before they are handed to students.
 */
export async function tryLoadImage(
  source: string | null | undefined,
  bucket = "public-assets",
): Promise<{ image: LoadedImage | null; failure: ImageLoadFailure | null }> {
  if (!source || !String(source).trim()) return { image: null, failure: null };
  try {
    return { image: await loadImage(source, bucket), failure: null };
  } catch (error) {
    return {
      image: null,
      failure: {
        source,
        reason: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/** Load several images at once, keeping every failure. */
export async function loadImages(
  sources: Array<{ key: string; source: string | null | undefined; bucket?: string }>,
): Promise<{ images: Record<string, LoadedImage>; failures: ImageLoadFailure[] }> {
  const images: Record<string, LoadedImage> = {};
  const failures: ImageLoadFailure[] = [];

  await Promise.all(
    sources.map(async ({ key, source, bucket }) => {
      const { image, failure } = await tryLoadImage(source, bucket);
      if (image) images[key] = image;
      if (failure) failures.push(failure);
    }),
  );

  return { images, failures };
}

/** Fit a box inside another, preserving the aspect ratio. */
export function fit(
  image: { width: number; height: number },
  box: { width: number; height: number },
): { width: number; height: number } {
  if (!image.width || !image.height) return box;
  const scale = Math.min(box.width / image.width, box.height / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

/** Drop the cache — after a school changes its logo, for instance. */
export function clearImageCache(): void {
  CACHE.clear();
}
