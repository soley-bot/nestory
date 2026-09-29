from pathlib import Path

report_path = Path("src/features/reports/data/trusted-report.ts")
text = report_path.read_text(encoding="utf-8")
old = """    const ownerProfitLossEvents =
      propertyIds.length === 0
        ? []
        : await loadReportOwnerProfitLossEvents({
            organizationId,
            period,
            propertyIds,
            supabase,
          });

    const report = buildTrustedReport({
      documents: [],
      ledgerEntries: [],
      leases: [],
      maintenanceTasks: [],
      owners: [],
      ownerProfitLossEvents,
      people: [],
      periodEnd: period.end,
"""
new = """    const ownerProfitLossEvents =
      propertyIds.length === 0
        ? []
        : await loadReportOwnerProfitLossEvents({
            organizationId,
            period,
            propertyIds,
            supabase,
          });
    const owners: OwnerRow[] = (financeContext.owner_assignments ?? [])
      .filter(
        (assignment) =>
          assignment.archived_at === null &&
          assignment.is_primary &&
          visiblePropertyIds.has(assignment.property_id) &&
          (assignment.started_on === null || assignment.started_on <= period.end) &&
          (assignment.ended_on === null || assignment.ended_on >= period.start),
      )
      .map((assignment) => ({
        id: assignment.id,
        ownership_label: null,
        ownership_percent: null,
        person_id: assignment.person_id,
        property_id: assignment.property_id,
      }));
    const people: PersonRow[] = (financeContext.people ?? []).map((person) => ({
      display_name: person.display_name,
      id: person.id,
    }));

    const report = buildTrustedReport({
      documents: [],
      ledgerEntries: [],
      leases: [],
      maintenanceTasks: [],
      owners,
      ownerProfitLossEvents,
      people,
      periodEnd: period.end,
"""
if text.count(old) != 1:
    raise RuntimeError(f"Expected one Unit P&L loader block, found {text.count(old)}")
report_path.write_text(text.replace(old, new, 1), encoding="utf-8")

test_path = Path("src/features/reports/data/report-scope-guard.test.ts")
test = test_path.read_text(encoding="utf-8")
anchor = """  it("keeps a valid empty unit report exportable", async () => {
"""
insert = """  it("loads the owner identity used by Unit P&L exports", async () => {
    mocks.context.mockResolvedValue({
      properties: [{ id: property, code: "P1", name: "Property", archived_at: null }],
      units: [{ id: unit, property_id: property, unit_number: "A1", archived_at: null }],
      people: [{
        id: "owner-1",
        display_name: "Example Owner",
        party_type: "owner",
        archived_at: null,
      }],
      owner_assignments: [{
        id: "ownership-1",
        property_id: property,
        person_id: "owner-1",
        is_primary: true,
        started_on: "2026-01-01",
        ended_on: null,
        archived_at: null,
      }],
    });

    const result = await report({ propertyId: property, unitId: unit });

    expect(result.unitProfitLossOwnerProperties).toEqual([
      { ownerName: "Example Owner", propertyName: "Property" },
    ]);
  });

"""
if test.count(anchor) != 1:
    raise RuntimeError(f"Expected one report-scope test anchor, found {test.count(anchor)}")
test_path.write_text(test.replace(anchor, insert + anchor, 1), encoding="utf-8")
