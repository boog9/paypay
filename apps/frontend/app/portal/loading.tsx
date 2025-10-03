export default function PortalLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl items-center justify-center rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="inline-block h-3 w-3 animate-ping rounded-full bg-muted-foreground" aria-hidden />
        Loading portal…
      </div>
    </div>
  );
}
