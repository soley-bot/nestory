const timelineRows = [
  {
    date: "17 Jun",
    type: "Rent",
    record: "Unit 12B collected in USD",
    status: "Paid",
  },
  {
    date: "14 Jun",
    type: "Lease",
    record: "New tenant moved to contract",
    status: "Active",
  },
  {
    date: "08 Jun",
    type: "Repair",
    record: "AC request assigned to vendor",
    status: "Open",
  },
  {
    date: "25 May",
    type: "File",
    record: "Owner agreement filed",
    status: "Filed",
  },
];

const ledgerRows = [
  ["Occupancy", "94%"],
  ["Collected", "$12,840"],
  ["Open repairs", "7"],
];

export function RecordRoomPreview() {
  return (
    <div className="overflow-hidden rounded-lg border border-[#dfe4ea] bg-[#f8f9fa] text-[#080b12] shadow-[0_26px_90px_rgba(8,13,26,0.08)]">
      <div className="flex items-center justify-between border-b border-[#dfe4ea] bg-white px-5 py-4 sm:px-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b929d]">
            PMS workspace
          </p>
          <p className="font-display mt-1 text-lg font-semibold">Central Residence</p>
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b929d]">
            Operator
          </p>
          <p className="mt-1 text-sm font-medium">Soley Admin</p>
        </div>
      </div>

      <div className="grid min-h-[460px] grid-cols-1 lg:grid-cols-[190px_minmax(0,1fr)_260px]">
        <aside className="border-b border-[#dfe4ea] bg-[#fbfbfc] p-5 lg:border-b-0 lg:border-r">
          <p className="mb-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b929d]">
            Operations
          </p>
          {["Portfolio", "Leasing", "Rent", "Maintenance", "Documents"].map((item, index) => (
            <div
              className={`mb-2 flex items-center justify-between rounded-md px-3 py-2.5 text-sm transition-transform hover:translate-x-0.5 ${
                index === 0
                  ? "bg-[#050607] text-white"
                  : "border border-[#e4e8ed] bg-white text-[#59606b]"
              }`}
              key={item}
            >
              <span>{item}</span>
              {index === 0 ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
            </div>
          ))}
        </aside>

        <section className="min-w-0 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e6e9ee] pb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b929d]">
                Today
              </p>
              <h2 className="font-display mt-1 text-2xl font-semibold leading-tight">
                Portfolio control
              </h2>
            </div>
            <p className="text-sm text-[#6d7480]">42 units / 7 open repairs</p>
          </div>

          <div className="divide-y divide-[#edf0f3]">
            {timelineRows.map((row) => (
              <div
                className="grid grid-cols-1 gap-3 py-4 text-sm transition-colors hover:bg-[#fbfbfc] sm:grid-cols-[72px_82px_minmax(0,1fr)_70px]"
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

        <aside className="border-t border-[#dfe4ea] bg-[#fbfbfc] p-5 sm:p-6 lg:border-l lg:border-t-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b929d]">
            This month
          </p>
          <p className="font-display mt-2 text-4xl font-semibold leading-none">94%</p>
          <p className="mt-3 text-sm leading-6 text-[#6d7480]">
            Occupancy with rent, maintenance, lease, and document context in one workspace.
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
