/**
 * Required-field marker for form labels (inventory, templates, etc.).
 */
export function ReqAsterisk() {
  return (
    <span
      className="ml-1.5 inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-md border border-destructive/55 bg-destructive/12 px-1 text-xs font-bold leading-none text-destructive shadow-sm"
      title="Required"
      aria-label="Required"
    >
      *
    </span>
  );
}
