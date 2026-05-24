import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <Link href="/" className="flex items-center" aria-label="Kos Baiti">
            <img
              src="/kos-baiti-logo.png"
              alt="Kos Baiti"
              className="h-12 w-auto"
            />
          </Link>
        </div>
      </header>
      <div className="mx-auto flex max-w-md flex-col px-4 py-10">{children}</div>
    </main>
  );
}
