export function SpatialLoadingSkeleton({ message = "Preparing the complete 3D factory map…" }: { message?: string }) {
  return (
    <div
      className="relative h-full min-h-0 w-full overflow-hidden bg-slate-50"
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="absolute inset-0 animate-pulse" aria-hidden="true">
        <div className="absolute inset-x-[8%] bottom-[12%] top-[16%] skew-y-[-3deg] rounded-3xl border border-slate-200 bg-slate-100/90 shadow-inner" />
        <div className="absolute left-[15%] top-[28%] h-[18%] w-[18%] rounded-xl bg-slate-200 shadow-sm" />
        <div className="absolute left-[40%] top-[22%] h-[24%] w-[14%] rounded-xl bg-slate-200 shadow-sm" />
        <div className="absolute right-[16%] top-[34%] h-[16%] w-[20%] rounded-xl bg-slate-200 shadow-sm" />
        <div className="absolute bottom-[22%] left-[28%] h-[17%] w-[16%] rounded-xl bg-slate-200 shadow-sm" />
        <div className="absolute bottom-[18%] right-[27%] h-[22%] w-[13%] rounded-xl bg-slate-200 shadow-sm" />
        <div className="absolute left-[12%] top-[12%] h-8 w-44 rounded-lg bg-slate-200" />
        <div className="absolute bottom-5 left-1/2 h-2 w-40 -translate-x-1/2 rounded-full bg-slate-200" />
      </div>
      <span className="sr-only">{message}</span>
    </div>
  );
}
