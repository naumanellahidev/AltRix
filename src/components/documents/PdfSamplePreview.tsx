/**
 * Show the real document as the sample.
 *
 * A picker that names designs, or draws a schematic of them, asks a principal
 * to imagine the result. Worse, the ID card picker changed a setting the
 * on-screen card ignored entirely, so choosing a design showed nothing at all
 * and only the printed PDF was different.
 *
 * This builds the actual document — the same builder that prints — and shows
 * it. What you see when you choose is what comes out of the printer.
 */
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

export function PdfSamplePreview({
  build,
  /** Re-builds when this changes; keep it stable or the preview thrashes. */
  cacheKey,
  className = "",
  /** Fraction of the frame's width the page is scaled to. */
  zoom = "FitH",
  title,
}: {
  build: () => Promise<Blob>;
  cacheKey: string;
  className?: string;
  zoom?: "FitH" | "Fit";
  title: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previous = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setUrl(null);

    (async () => {
      try {
        const blob = await build();
        if (cancelled) return;
        const next = URL.createObjectURL(blob);
        // One object URL at a time per preview; the old one is released as
        // soon as the new one is ready, so a gallery does not leak a blob per
        // click.
        if (previous.current) URL.revokeObjectURL(previous.current);
        previous.current = next;
        setUrl(next);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "the sample could not be built");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // `build` is a fresh closure on every render; cacheKey is what identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  useEffect(
    () => () => {
      if (previous.current) URL.revokeObjectURL(previous.current);
    },
    [],
  );

  if (error) {
    return (
      <div className={`flex items-center justify-center gap-2 bg-muted/40 p-3 text-center text-xs text-muted-foreground ${className}`}>
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        <span>{error}</span>
      </div>
    );
  }

  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-muted/40 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <iframe
      // The fragment asks the browser's viewer for the page alone: no toolbar,
      // no sidebar, no scrollbars, scaled to the frame.
      src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=${zoom}`}
      title={title}
      // The frame is a picture here; the click belongs to whatever wraps it.
      className={`pointer-events-none border-0 bg-white ${className}`}
      tabIndex={-1}
    />
  );
}

export default PdfSamplePreview;
