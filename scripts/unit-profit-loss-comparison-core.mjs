const ORIENTATIONS = new Set(["portrait", "landscape"]);

export function validateComparisonFixture(fixture) {
  if (!fixture || !Array.isArray(fixture.entries)) {
    throw new Error("Comparison fixture must contain an entries array.");
  }

  for (const entry of fixture.entries) {
    if (!["income", "expense"].includes(entry.section)) {
      throw new Error(`Unsupported entry section: ${entry.section}`);
    }
    if (!Number.isFinite(entry.amount) || entry.amount < 0) {
      throw new Error(`Invalid amount for ${entry.id}: ${entry.amount}`);
    }
  }

  const incomeTotal = sumSection(fixture.entries, "income");
  const expenseTotal = sumSection(fixture.entries, "expense");
  const netIncome = incomeTotal - expenseTotal;

  if (incomeTotal !== fixture.totals.income) {
    throw new Error(
      `Calculated income total ${incomeTotal} does not match ${fixture.totals.income}.`,
    );
  }
  if (expenseTotal !== fixture.totals.expenses) {
    throw new Error(
      `Calculated expense total ${expenseTotal} does not match ${fixture.totals.expenses}.`,
    );
  }
  if (netIncome !== fixture.totals.netIncome) {
    throw new Error(
      `Calculated net income ${netIncome} does not match ${fixture.totals.netIncome}.`,
    );
  }

  return { expenseTotal, incomeTotal, netIncome };
}

function sumSection(entries, section) {
  return entries
    .filter((entry) => entry.section === section)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

function formatMoney(amount, currency) {
  return `${currency} ${amount.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderEntryRow(entry, currency) {
  return `
    <tr data-entry-row data-entry-id="${escapeHtml(entry.id)}">
      <td class="date">${escapeHtml(entry.date)}</td>
      <td class="category">${escapeHtml(entry.category)}</td>
      <td class="description">${escapeHtml(entry.description)}</td>
      <td class="amount">${formatMoney(entry.amount, currency)}</td>
    </tr>`;
}

function renderSection(fixture, section, label, subtotal) {
  const rows = fixture.entries
    .filter((entry) => entry.section === section)
    .map((entry) => renderEntryRow(entry, fixture.currency))
    .join("");

  return `
    <tr class="section-row">
      <th colspan="4" scope="rowgroup">${label}</th>
    </tr>
    ${rows}
    <tr class="subtotal-row">
      <th colspan="3" scope="row">${label} subtotal</th>
      <td class="amount">${formatMoney(subtotal, fixture.currency)}</td>
    </tr>`;
}

export function buildComparisonHtml({
  fixture,
  logoDataUrl,
  orientation,
}) {
  if (!ORIENTATIONS.has(orientation)) {
    throw new Error(`Unsupported orientation: ${orientation}`);
  }
  if (!logoDataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("The comparison logo must be a local PNG data URL.");
  }

  const totals = validateComparisonFixture(fixture);
  const incomeRows = renderSection(
    fixture,
    "income",
    "Income",
    totals.incomeTotal,
  );
  const expenseRows = renderSection(
    fixture,
    "expense",
    "Expenses",
    totals.expenseTotal,
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(fixture.title)} - ${escapeHtml(fixture.unit)}</title>
    <style>
      @page {
        size: A4 ${orientation};
        margin: 24pt 28pt;
      }

      :root {
        color-scheme: light;
        font-family: Arial, Helvetica, sans-serif;
        font-synthesis: none;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
      }

      body {
        --accent: #2f5f7f;
        --border: #cbd5df;
        --header-fill: #edf3f8;
        --ink: #17212b;
        --muted: #5d6b78;
        --section-fill: #f3f6f9;
        color: var(--ink);
        font-size: 7.8pt;
        line-height: 9.2pt;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      body[data-orientation="portrait"] {
        --logo-height: 40pt;
        --logo-width: 92pt;
        --logo-source-left: -61pt;
        --logo-source-top: -55pt;
        --logo-source-width: 210pt;
      }

      body[data-orientation="landscape"] {
        --logo-height: 44pt;
        --logo-width: 105pt;
        --logo-source-left: -70pt;
        --logo-source-top: -63pt;
        --logo-source-width: 240pt;
      }

      .report {
        padding-bottom: 18pt;
      }

      .title-row {
        align-items: flex-start;
        display: flex;
        justify-content: space-between;
        min-height: var(--logo-height);
      }

      h1 {
        font-size: 18pt;
        line-height: 21pt;
        margin: 1pt 18pt 0 0;
      }

      .logo-window {
        flex: 0 0 auto;
        height: var(--logo-height);
        overflow: hidden;
        position: relative;
        width: var(--logo-width);
      }

      .logo-window img {
        height: auto;
        left: var(--logo-source-left);
        max-width: none;
        position: absolute;
        top: var(--logo-source-top);
        width: var(--logo-source-width);
      }

      .metadata {
        border-bottom: 0.5pt solid var(--border);
        margin: 1pt 0 6pt;
        padding-bottom: 5pt;
      }

      .metadata p {
        color: var(--muted);
        font-size: 8pt;
        line-height: 10pt;
        margin: 0;
      }

      .metadata strong {
        color: var(--ink);
        font-weight: 700;
      }

      table {
        border-collapse: collapse;
        table-layout: fixed;
        width: 100%;
      }

      thead {
        display: table-header-group;
      }

      thead tr {
        background: var(--header-fill);
        height: 18pt;
      }

      th,
      td {
        border-bottom: 0.35pt solid var(--border);
        padding: 3pt 5pt;
        text-align: left;
        vertical-align: top;
      }

      thead th {
        font-size: 7.4pt;
        font-weight: 700;
        line-height: 8.5pt;
      }

      thead th:last-child,
      .amount {
        text-align: right;
      }

      tbody tr[data-entry-row] {
        min-height: 16pt;
      }

      .category {
        color: var(--accent);
        font-weight: 700;
        padding-left: 9pt;
      }

      .description {
        overflow-wrap: anywhere;
      }

      .date,
      .amount {
        white-space: nowrap;
      }

      .section-row {
        background: var(--section-fill);
        break-after: avoid;
        height: 16pt;
      }

      .section-row th {
        font-size: 8.2pt;
        font-weight: 700;
        padding-bottom: 3pt;
        padding-top: 3pt;
      }

      .subtotal-row {
        break-inside: avoid;
        height: 17pt;
      }

      .subtotal-row th,
      .subtotal-row td {
        border-bottom-width: 0.7pt;
        font-weight: 700;
      }

      .subtotal-row th {
        text-align: right;
      }

      .totals {
        break-inside: avoid;
        margin-left: auto;
        margin-top: 5pt;
        width: min(240pt, 46%);
      }

      .totals-row {
        display: grid;
        font-size: 8pt;
        grid-template-columns: 1fr auto;
        line-height: 10pt;
        min-height: 16pt;
        padding: 3pt 5pt;
      }

      .totals-row span:last-child {
        min-width: 86pt;
        text-align: right;
      }

      .totals-row.net {
        border-top: 0.8pt solid var(--ink);
        font-size: 10pt;
        font-weight: 700;
        line-height: 12pt;
        margin-top: 1pt;
      }

      footer {
        border-top: 0.5pt solid var(--border);
        bottom: 0;
        color: var(--muted);
        display: flex;
        font-size: 7pt;
        justify-content: space-between;
        left: 0;
        line-height: 9pt;
        padding-top: 4pt;
        position: fixed;
        right: 0;
      }
    </style>
  </head>
  <body data-orientation="${orientation}">
    <main class="report">
      <header>
        <div class="title-row">
          <h1>${escapeHtml(fixture.title)}</h1>
          <div class="logo-window">
            <img data-logo src="${logoDataUrl}" alt="${escapeHtml(
              fixture.organizationName,
            )}">
          </div>
        </div>
        <div class="metadata">
          <p data-meta-row><strong>Property:</strong> ${escapeHtml(
            fixture.property,
          )} | <strong>Unit:</strong> ${escapeHtml(fixture.unit)}</p>
          <p data-meta-row><strong>Period:</strong> ${escapeHtml(
            fixture.period,
          )} | <strong>Generated:</strong> ${escapeHtml(
            fixture.generated,
          )} | ${escapeHtml(fixture.basis)}</p>
        </div>
      </header>

      <table aria-label="Unit profit and loss transaction details">
        <colgroup>
          <col style="width: ${
            orientation === "portrait" ? "70pt" : "78pt"
          }">
          <col style="width: ${
            orientation === "portrait" ? "125pt" : "180pt"
          }">
          <col>
          <col style="width: ${
            orientation === "portrait" ? "89pt" : "105pt"
          }">
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Category</th>
            <th scope="col">Description</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${incomeRows}
          ${expenseRows}
        </tbody>
      </table>

      <section class="totals" aria-label="Statement totals">
        <div class="totals-row">
          <span>Total income</span>
          <span>${formatMoney(totals.incomeTotal, fixture.currency)}</span>
        </div>
        <div class="totals-row">
          <span>Total expenses</span>
          <span>${formatMoney(totals.expenseTotal, fixture.currency)}</span>
        </div>
        <div class="totals-row net">
          <span>Net income</span>
          <span>${formatMoney(totals.netIncome, fixture.currency)}</span>
        </div>
      </section>
    </main>

    <footer>
      <span>Unit financial statement</span>
      <span>Page 1 of 1</span>
    </footer>
  </body>
</html>`;
}
