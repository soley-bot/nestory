from pathlib import Path

path = Path("src/features/finance-operations/components/finance-operations-screen.test.tsx")
text = path.read_text(encoding="utf-8")

old = '''  it("does not offer invoice publication for a voided invoice without an artifact", async () => {
    const user = userEvent.setup();
    const input = data();
    const invoice = tenantInvoice();
    invoice.collectionRoute = "through_ips";
    invoice.paymentStatus = "voided";
    input.tenantInvoices = [invoice];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View invoice INV-202608-001" }),
    );
    expect(screen.queryByRole("button", { name: "Publish PDF" })).toBeNull();
  });'''

new = '''  it("keeps a voided invoice out of Rent & collections", () => {
    const input = data();
    const invoice = tenantInvoice();
    invoice.collectionRoute = "through_ips";
    invoice.paymentStatus = "voided";
    input.tenantInvoices = [invoice];

    render(
      <FinanceOperationsScreen
        {...input}
        {...financeCapabilities({ canRecordPayments: true })}
        organizationName="Sokha Property Services"
        view="rent"
      />,
    );

    expect(screen.queryByText("INV-202608-001")).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "View invoice INV-202608-001",
      }),
    ).toBeNull();
  });'''

count = text.count(old)
if count != 1:
    raise RuntimeError(f"Expected one obsolete test block, found {count}")

path.write_text(text.replace(old, new, 1), encoding="utf-8")
