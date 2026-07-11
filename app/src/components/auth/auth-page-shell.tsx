import type { ReactNode } from "react";

export function AuthPageShell({
  children,
  dir,
  labelledBy,
}: {
  children: ReactNode;
  dir?: "ltr" | "rtl";
  labelledBy?: string;
}) {
  return (
    <main dir={dir} className="min-h-screen w-full bg-slate-50 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <section
          className="w-full min-w-0 max-w-[36rem]"
          aria-labelledby={labelledBy}
          data-auth-card-wrapper
        >
          <div className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}

export function AuthBrand({ label }: { label?: string }) {
  return (
    <div className="w-full text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-base font-bold text-white shadow-sm">
        DM
      </div>
      <p className="mt-3 text-sm font-bold text-slate-950">
        {label || "DocuMind AI"}
      </p>
    </div>
  );
}
