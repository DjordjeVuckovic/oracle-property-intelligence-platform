export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[840px] items-center gap-3 px-6 py-16 text-sm text-muted-foreground">
      <span
        aria-hidden
        className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
      />
      Loading live records
    </div>
  );
}
