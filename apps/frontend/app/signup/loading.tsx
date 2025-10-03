export default function SignupLoading() {
  return (
    <div className="flex w-full items-center justify-center rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="inline-block h-3 w-3 animate-ping rounded-full bg-muted-foreground" aria-hidden />
        Preparing signup…
      </div>
    </div>
  );
}
