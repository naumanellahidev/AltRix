/**
 * The child's photograph, taken at the desk or chosen from a file.
 *
 * This is the one field that decides whether the school's ID cards and report
 * cards come out with a face on them. Admissions never asked for it, so every
 * student admitted through the app had none, and every card printed with an
 * empty box where the photograph goes.
 *
 * Two ways in, because both happen: a camera at the admissions desk, and a
 * folder of photographs the family emailed. Whichever is used, the file is
 * shrunk to a sensible size before it is stored — a 6MB phone photograph on a
 * card that prints at 26mm is a slow page and a big backup for nothing.
 *
 * Nothing is invented. If there is no camera, or permission is refused, it
 * says so and the admission proceeds without a photograph.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImageUp, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** The longest edge a stored student photograph needs. */
const MAX_EDGE = 900;
const JPEG_QUALITY = 0.86;

/**
 * Re-encode an image to at most MAX_EDGE on its longest side.
 *
 * Returns the original file untouched if it cannot be decoded — better to
 * store the photograph the school chose than to lose it to a resize.
 */
export async function shrinkImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 400_000) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

export function StudentPhotoField({
  value,
  onChange,
  label = "Student photograph",
  hint = "Used on the ID card, the report card and the student's profile.",
}: {
  /** A preview URL, or null. */
  value: { url: string; blob: Blob } | null;
  onChange: (next: { url: string; blob: Blob } | null) => void;
  label?: string;
  hint?: string;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraProblem, setCameraProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // The preview URL is revoked when it is replaced, or the tab leaks a blob
  // for every photograph the office looks at.
  useEffect(() => {
    const url = value?.url;
    return () => {
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [value?.url]);

  const openCamera = async () => {
    setCameraProblem(null);
    setCameraOpen(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraProblem("This browser cannot open a camera. Choose a photograph from a file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch (err: any) {
      setCameraProblem(
        err?.name === "NotAllowedError" || err?.name === "SecurityError"
          ? "The browser was not allowed to use the camera. Allow it for this site, or choose a file."
          : err?.name === "NotFoundError"
            ? "No camera was found on this machine."
            : "The camera could not be opened.",
      );
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) {
      setCameraProblem("The frame could not be read from the camera.");
      return;
    }
    onChange({ url: URL.createObjectURL(blob), blob });
    stopCamera();
    setCameraOpen(false);
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    setBusy(true);
    try {
      const blob = await shrinkImage(file);
      onChange({ url: URL.createObjectURL(blob), blob });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-28 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted">
          {value ? (
            <img src={value.url} alt="The student" className="h-full w-full object-cover" />
          ) : (
            <span className="px-2 text-center text-[10px] text-muted-foreground">No photograph</span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {cameraOpen ? (
            <div className="space-y-2">
              {cameraProblem ? (
                <p className="text-sm text-rose-600 dark:text-rose-400">{cameraProblem}</p>
              ) : (
                <video ref={videoRef} playsInline muted className="w-full max-w-xs rounded-lg bg-black" />
              )}
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => void capture()} disabled={!!cameraProblem}>
                  <Camera className="mr-2 h-4 w-4" /> Take photograph
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    stopCamera();
                    setCameraOpen(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void pick(e.target.files?.[0])}
              />
              <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageUp className="mr-2 h-4 w-4" />}
                Choose a file
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void openCamera()}>
                <Camera className="mr-2 h-4 w-4" /> Use the camera
              </Button>
              {value ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Remove
                </Button>
              ) : null}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
    </div>
  );
}
