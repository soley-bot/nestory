import type { OwnerStatementPublicationModel } from "@/features/reports/data/owner-statement-report";

export function ownerStatementCash(model: OwnerStatementPublicationModel) {

  const component = model.components.find((item) => item.component === "ips_held_owner_cash");

  if (!component) throw new Error("Owner Statement is missing the Nestory-held cash component.");

  const openingCents = ownerStatementCents(component.openingAmount);

  const closingCents = ownerStatementCents(component.closingAmount);

  let balanceCents = openingCents;

  let cashInCents = 0;

  let cashOutCents = 0;

  const transactions = model.lines

    .filter((line) => line.lineKind === "movement" && line.component === "ips_held_owner_cash")

    .toSorted((a, b) => a.businessDate.localeCompare(b.businessDate) || a.lineNumber - b.lineNumber)

    .map((line) => {

      const signedCents = ownerStatementCents(line.signedAmount);

      const incoming = signedCents > 0 ? signedCents : 0;

      const outgoing = signedCents < 0 ? -signedCents : 0;

      cashInCents += incoming;

      cashOutCents += outgoing;

      balanceCents += signedCents;

      if (![balanceCents, cashInCents, cashOutCents].every(Number.isSafeInteger)) {

        throw new Error("Owner Statement totals exceed the supported range.");

      }

      return {

        balanceCents,

        cashInCents: incoming,

        cashOutCents: outgoing,

        date: line.businessDate,

        details: ownerStatementDescription(line.description),

        type: ownerStatementTransactionLabel(line.sources[0]?.sourceType, signedCents < 0 ? "Cash out" : "Cash in"),

        lineNumber: line.lineNumber,

      };

    });

  if (balanceCents !== closingCents) {

    throw new Error("Owner Statement cash movements do not reconcile to the closing balance.");

  }

  const depositCents = ownerStatementCents(model.components.find((item) => item.component === "security_deposit_custody")?.closingAmount ?? "0.00");

  return { cashInCents, cashOutCents, closingCents, openingCents, depositCents, transactions };

}

function ownerStatementTransactionLabel(sourceType: string | undefined, fallback: string) {

  const labels: Record<string, string> = {

    management_fee_occurrence: "Management fee",

    owner_close_correction: "Correction",

    owner_component_transfer: "Balance transfer",

    owner_contribution: "Owner contribution",

    owner_distribution: "Payment to owner",

    owner_invoice_payment: "Property expense paid",

    owner_paid_cost: "Property cost paid by owner",

    owner_reimbursement: "Owner reimbursement",

    reversal: "Reversal",

    security_deposit_receipt: "Security deposit received",

    security_deposit_refund: "Security deposit refunded",

    tenant_rent_receipt: "Rent received",

  };

  return sourceType && labels[sourceType]

    ? labels[sourceType]

    : fallback.replace(/\s+(?:Ãƒâ€šÃ‚Â·|\|)\s+ips_held_owner_cash$/i, "");

}

function ownerStatementCents(value: string) {

  const match = /^(-?)(\d+)\.(\d{2})$/.exec(value);

  if (!match) throw new Error("Owner Statement amount is not canonical.");

  const cents = Number(match[2]) * 100 + Number(match[3]);

  if (!Number.isSafeInteger(cents)) {

    throw new Error("Owner Statement amount exceeds the supported range.");

  }

  return match[1] === "-" ? -cents : cents;

}


function ownerStatementDescription(value: string) {
  return value
    .replace(/\s+(?:\u00b7|\u00c2\u00b7|\|)\s+ips_held_owner_cash$/i, "")
    .replace(/\bRent collected by (?:Nestory|IPS)\b/gi, "Rent received")
    .replace(/\bOwner invoice payment\b/gi, "Property expense paid")
    .replace(/\bOwner distribution\b/gi, "Payment to owner");
}
