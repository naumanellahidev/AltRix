import { useEffect } from "react";

/**
 * Accelerates arrow-key navigation globally.
 *
 * The OS keydown auto-repeat delay (typically 250–500ms before repeats begin)
 * makes list navigation feel sluggish. This component intercepts held arrow
 * keys on non-text targets and re-dispatches synthetic keydown events on a
 * fast interval (~45ms) so lists, tables and tab focus scan much faster.
 *
 * It is intentionally a no-op when:
 *  - The user is typing in an input/textarea/contenteditable
 *  - The focused element is inside a Radix Select/Combobox/Listbox
 *    (those have their own type-ahead + keyboard semantics)
 *  - Modifier keys (Ctrl/Meta/Alt) are held
 */
const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const FAST_REPEAT_MS = 45;
const INITIAL_DELAY_MS = 140;

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (
    el.closest?.("[role='listbox']") ||
    el.closest?.("[role='combobox']") ||
    el.closest?.("[role='menu']") ||
    el.closest?.("[contenteditable='true']")
  ) {
    return true;
  }
  return false;
}

export function ArrowKeyAccelerator() {
  useEffect(() => {
    let activeKey: string | null = null;
    let activeTarget: EventTarget | null = null;
    let initialTimer: number | null = null;
    let repeatTimer: number | null = null;

    const stop = () => {
      if (initialTimer !== null) { window.clearTimeout(initialTimer); initialTimer = null; }
      if (repeatTimer !== null) { window.clearInterval(repeatTimer); repeatTimer = null; }
      activeKey = null;
      activeTarget = null;
    };

    const dispatchSynthetic = () => {
      if (!activeKey || !activeTarget) return;
      const ev = new KeyboardEvent("keydown", {
        key: activeKey,
        code: activeKey,
        bubbles: true,
        cancelable: true,
        repeat: true,
      });
      (activeTarget as HTMLElement).dispatchEvent(ev);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!ARROW_KEYS.has(e.key)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      // If the OS is auto-repeating this same key, suppress slow native repeats —
      // our fast interval is already driving updates.
      if (e.repeat && activeKey === e.key) {
        e.preventDefault();
        return;
      }

      // New press: start our accelerator
      if (activeKey !== e.key) {
        stop();
        activeKey = e.key;
        activeTarget = e.target;
        initialTimer = window.setTimeout(() => {
          repeatTimer = window.setInterval(dispatchSynthetic, FAST_REPEAT_MS);
        }, INITIAL_DELAY_MS);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (ARROW_KEYS.has(e.key) && activeKey === e.key) stop();
    };

    const onBlur = () => stop();

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      stop();
    };
  }, []);

  return null;
}
