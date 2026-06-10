export function PoweredByFooter() {
  const content = (
    <span className="pointer-events-auto text-[10px] text-muted-foreground/40 font-medium tracking-wide">
      AltRix - School Operating System
    </span>
  );

  return (
    <>
      {/* Desktop / tablet: fixed bottom-right badge */}
      <div
        data-print="hide"
        className="pointer-events-none fixed bottom-2 right-3 z-[60] hidden text-[10px] text-muted-foreground/70 sm:block print:hidden"
      >
        {content}
      </div>
      {/* Mobile: inline footer at the end of page content, lifted above bottom nav */}
      <div
        data-print="hide"
        className="flex justify-center px-3 pt-6 pb-[calc(env(safe-area-inset-bottom)+6rem)] text-[10px] text-muted-foreground/70 sm:hidden print:hidden"
      >
        {content}
      </div>
    </>
  );
}
