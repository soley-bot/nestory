const timelineRows = [
  {
    date: "17 Jun",
    type: "Payment",
    record: "Unit 12B rent collected in USD",
    status: "Paid",
  },
  {
    date: "14 Jun",
    type: "Lease",
    record: "New tenant application moved to contract",
    status: "Active",
  },
  {
    date: "08 Jun",
    type: "Maintenance",
    record: "AC service request assigned to vendor",
    status: "Open",
  },
  {
    date: "25 May",
    type: "Document",
    record: "Owner agreement filed to Central Residence",
    status: "Filed",
  },
];

const ledgerRows = [
  ["Occupancy", "94%"],
  ["Collected", "$12,840"],
  ["Open tickets", "7"],
];

export function RecordRoomPreview() {
  return (
    <div className="overflow-hidden rounded-md border border-[#dfe4ea] bg-[#f6f7f8] text-[#080b12] shadow-[0_24px_80px_rgba(10,17,28,0.08)]">
      <div className="flex items-center justify-between border-b border-[#dfe4ea] bg-white px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b929d]">
            PMS workspace
          </p>
          <p className="mt-1 text-lg font-semibold">Central Residence Portfolio</p>
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b929d]">
            Operator
          </p>
          <p className="mt-1 text-sm font-medium">Soley Admin</p>
        </div>
      </div>

      <div className="grid min-h-[430px] grid-cols-1 lg:grid-cols-[180px_minmax(0,1fr)_240px]">
        <aside className="border-b border-[#dfe4ea] bg-[#fbfbfc] p-5 lg:border-b-0 lg:border-r">
          <p className="mb-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b929d]">
            Operations
          </p>
          {["Portfolio", "Leasing", "Payments", "Maintenance"].map((item, index) => (
            <div
              className={`mb-2 flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                index === 0
                  ? "bg-[#090a0c] text-white"
                  : "border border-[#e4e8ed] bg-white text-[#59606b]"
              }`}
              key={item}
            >
              <span>{item}</span>
              {index === 0 ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
            </div>
          ))}
        </aside>

        <section className="min-w-0 bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e6e9ee] pb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b929d]">
                Today
              </p>
              <h2 className="mt-1 font-display text-2xl font-semibold">Portfolio control</h2>
            </div>
            <p className="text-sm text-[#6d7480]">42 units / 7 issues</p>
          </div>

          <div className="divide-y divide-[#edf0f3]">
            {timelineRows.map((row) => (
              <div
                className="grid grid-cols-1 gap-3 py-4 text-sm sm:grid-cols-[72px_96px_minmax(0,1fr)_70px]"
                key={row.record}
              >
                <span className="font-mono text-xs text-[#7c8490]">{row.date}</span>
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#080b12]">
                  {row.type}
                </span>
                <span className="min-w-0 text-[#333943]">{row.record}</span>
                <span className="text-xs font-medium text-[#7c8490]">{row.status}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="border-t border-[#dfe4ea] bg-[#fbfbfc] p-5 lg:border-l lg:border-t-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b929d]">
            This month
          </p>
          <p className="mt-2 font-display text-3xl font-semibold">94%</p>
          <p className="mt-1 text-sm leading-6 text-[#6d7480]">
            Occupancy with rent, maintenance, lease, and document context in one PMS.
          </p>

          <div className="mt-8 divide-y divide-[#e6e9ee]">
            {ledgerRows.map(([label, value]) => (
              <div className="flex items-center justify-between py-3 text-sm" key={label}>
                <span className="text-[#6d7480]">{label}</span>
                <span className="font-semibold">{value}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
