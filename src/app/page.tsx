import Link from "next/link";

const operatingPoints = [
  "Unit records, leases, rent, maintenance, and documents in one place.",
  "Dashboard repair queues point back to the exact records that need work.",
  "Reports trace their numbers to source rows instead of loose spreadsheets.",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#fdfdfc] text-[#080b12]">
      <header className="mx-auto flex max-w-[1180px] items-start justify-between px-6 py-7 sm:px-10 lg:px-14">
        <Link
          aria-label="Nestory home"
          className="font-display leading-none text-[#060910]"
          href="/"
        >
          <span className="block text-2xl font-semibold">NESTORY</span>
          <span className="mt-0.5 block text-center text-[10px] font-medium uppercase tracking-[0.24em] text-[#9aa0aa]">
            Property Management
          </span>
        </Link>

        <Link
          className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#838995] transition-colors hover:text-[#060910]"
          href="/login"
        >
          Sign in
        </Link>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-104px)] max-w-[1180px] items-center gap-10 px-6 pb-12 sm:px-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-14">
        <div className="max-w-[640px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9aa3b2]">
            Property history and performance hub
          </p>
          <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] text-[#080d1a] sm:text-5xl">
            Know what happened, what changed, and what needs attention.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#6f7887]">
            Nestory keeps property and unit operating records connected so
            managers can move from dashboard risk to the underlying record
            without digging through disconnected files.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md bg-[#080b12] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-85"
              href="/login"
            >
              Sign in
            </Link>
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md border border-[#dfe4ea] bg-white px-4 text-sm font-semibold text-[#080b12] transition-colors hover:bg-[#f3f5f7]"
              href="/signup"
            >
              Create workspace
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-[#dfe4ea] bg-white p-5 shadow-[0_18px_60px_rgba(8,11,18,0.045)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9aa3b2]">
            MVP spine
          </p>
          <div className="mt-4 divide-y divide-[#edf0f3]">
            {operatingPoints.map((point) => (
              <p className="py-4 text-sm leading-6 text-[#6f7887]" key={point}>
                {point}
              </p>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
