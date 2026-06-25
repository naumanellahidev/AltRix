export function PoweredByFooter() {
  const content = (
    <span className="pointer-events-auto text-[10px] text-muted-foreground/40 font-medium tracking-wide">
      AltRix - School Operating System
    </span>
  );

  return (
    <div
      data-print="hide"
      className="pointer-events-none fixed bottom-2 right-3 z-[60] text-[10px] text-muted-foreground/70 print:hidden"
    >
      {content}
    </div>
  );
}
