import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <span className="material-symbols-outlined text-[64px] text-outline">
        search_off
      </span>
      <h1 className="mt-4 text-headline-lg text-primary">404</h1>
      <p className="mt-2 text-body-lg text-on-surface-variant">
        The page you are looking for does not exist.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-label-md font-semibold text-on-primary transition-all hover:opacity-90 active:scale-[0.98]"
      >
        <span className="material-symbols-outlined text-xl">home</span>
        Back to Home
      </Link>
    </main>
  );
}
