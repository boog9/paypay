export function ShellHeader() {
  return (
    <header
      role="banner"
      aria-label="Dashboard header"
      className="flex h-16 items-center justify-between border-b bg-background/80 px-6 backdrop-blur lg:h-20 lg:px-8"
    >
      <div className="flex items-center gap-4">
        <div className="min-w-[160px]">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active store</p>
          <p className="text-sm font-semibold text-foreground">Select a store</p>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          Platform status: Pending
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
        <span className="rounded-full border bg-card px-3 py-1 text-foreground">Account</span>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
          2FA Active
        </span>
      </div>
    </header>
  );
}
