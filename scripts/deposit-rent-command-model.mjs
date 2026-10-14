// Executable synthetic transaction specification. Not a DB client, authorization
// boundary, live posting implementation or evidence of PostgreSQL concurrency.
const copy = value => JSON.parse(JSON.stringify(value));
function cents(value) {
  if (typeof value !== 'string' || !/^\d+\.\d{2}$/.test(value)) throw new Error('exact cents required');
  const result = BigInt(value.replace('.', ''));
  if (result > 99999999999999n) throw new Error('amount bound exceeded');
  return result;
}
const decimal = value => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
export function simulateDepositRentCommand(state, user, command) {
  const next = copy(state);
  if (!['apply', 'reverse'].includes(command.type)) throw new Error('unsupported operation');
  const reverse = command.type === 'reverse';
  const permission = reverse ? 'finance.correct_records' : 'finance.record_payments';
  if (!user.actorId || user.organizationId !== state.organizationId || user.activeBranchId !== state.branchId
    || !user.propertyIds.includes(state.propertyId) || ['finance.view', 'leases.change_terms', permission].some(key => !user.permissions.includes(key))) throw new Error('not authorized');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(command.date) || !Number.isFinite(Date.parse(command.date))
    || new Date(command.date).toISOString().slice(0, 10) !== command.date
    || command.key.trim().length < 8 || command.key.trim().length > 200 || command.reason.trim().length < 3) throw new Error('invalid command');
  const allocations = reverse ? [] : [...command.allocations].sort((a, b) => a.lineId.localeCompare(b.lineId));
  const payload = JSON.stringify({ ...command, key: command.key.trim(), reason: command.reason.trim(), allocations });
  const requestKey = [command.type, command.key.trim()].join(':');
  const saved = next.requests[requestKey];
  if (saved) {
    if (saved.actorId !== user.actorId || saved.payload !== payload) throw new Error('conflicting idempotency identity or payload');
    return { state: next, id: saved.id, replay: true };
  }
  if (next.closedMonths.includes(command.date.slice(0, 7))) throw new Error('month closed');
  if (command.date < next.lastCustodyDate || command.date < next.custodyConfirmedOn) throw new Error('backdated custody event');
  if (!next.custodyVerified || !['ips', 'owner'].includes(next.custodian)
    || (next.custodian === 'owner') !== Boolean(next.custodyOwnerId)) throw new Error('unverified custodian');
  // Synthetic counterpart of the existing checked resolver, never a default.
  const account = next.liabilityAccount;
  if (!account || account.id !== next.custodyLiabilityAccountId || account.organizationId !== next.organizationId
    || account.archived || account.accountClass !== 'liability' || account.accountSubtype !== 'current_liability'
    || !account.useForLeaseDeposits || (account.propertyId !== null && account.propertyId !== next.propertyId)) throw new Error('incompatible explicit liability account');
  let total = 0n;
  let entries;
  if (reverse) {
    const original = next.applications.find(row => row.id === command.applicationId);
    if (!original || original.reversalOf || next.applications.some(row => row.reversalOf === original.id)) throw new Error('not an active original application');
    if (original.liabilityAccountId !== account.id) throw new Error('reversal liability identity mismatch');
    total = cents(original.amount);
    if (command.date < original.date) throw new Error('reversal precedes original');
    if (cents(next.held) + total > cents(next.depositObligation)) throw new Error('custody restoration exceeds obligation');
    entries = original.allocations.map(row => ({ ...row, reversalOf: row.id, id: `allocation-${next.sequence}:${row.lineId}` }));
    next.held = decimal(cents(next.held) + total);
    for (const entry of entries) {
      const line = next.lines.find(row => row.id === entry.lineId);
      line.depositSettled = decimal(cents(line.depositSettled) - cents(entry.amount));
    }
  } else {
    if (command.invoiceId !== next.invoiceId || command.depositId !== next.depositId || next.invoiceLifecycle !== 'issued'
      || next.invoiceLeaseId !== next.depositLeaseId || next.invoiceCurrency !== next.depositCurrency) throw new Error('invoice/deposit scope mismatch');
    if (allocations.length < 1 || allocations.length > 100 || new Set(allocations.map(row => row.lineId)).size !== allocations.length) throw new Error('explicit unique lines required');
    entries = allocations.map(row => {
      const line = next.lines.find(item => item.id === row.lineId);
      if (!line || line.kind !== 'rent' || !line.active) throw new Error('active rent line required');
      const value = cents(row.amount);
      if (value <= 0n) throw new Error('positive amount required');
      if (value > cents(line.due) - cents(line.otherSettled) - cents(line.depositSettled)) throw new Error('line overpayment');
      total += value;
      return { ...row, id: `allocation-${next.sequence}:${row.lineId}`, reversalOf: null };
    });
    if (total > cents(next.held)) throw new Error('insufficient deposit');
    if (total > cents(next.invoiceOutstanding)) throw new Error('invoice overpayment');
    next.held = decimal(cents(next.held) - total);
    for (const entry of entries) {
      const line = next.lines.find(row => row.id === entry.lineId);
      line.depositSettled = decimal(cents(line.depositSettled) + cents(entry.amount));
    }
  }
  const id = `application-${next.sequence++}`;
  const signed = reverse ? -total : total;
  next.invoiceOutstanding = decimal(cents(next.invoiceOutstanding) - signed);
  next.applications.push({ id, depositEventId: `event-${id}`, invoiceId: next.invoiceId, date: command.date, amount: decimal(total),
    allocations: entries, liabilityAccountId: account.id, custodian: next.custodian, custodyOwnerId: next.custodyOwnerId,
    reversalOf: reverse ? command.applicationId : null, createdBy: user.actorId });
  next.events.push({ id: `event-${id}`, liabilityAccountId: account.id, kind: reverse ? 'reversed' : 'applied', date: command.date, amount: decimal(total), applicationId: id });
  next.audit.push({ actorId: user.actorId, operation: command.type, applicationId: id, reason: command.reason.trim() });
  next.lastCustodyDate = command.date;
  // Proposed mechanical bridge only; no owner entitlement or withdrawable balance.
  next.ipsRentReclassification = (BigInt(next.ipsRentReclassification) + (next.custodian === 'ips' ? signed : 0n)).toString();
  next.ownerDirectRentSettlement = (BigInt(next.ownerDirectRentSettlement) + (next.custodian === 'owner' ? signed : 0n)).toString();
  next.externalCashReceived = '0';
  next.requests[requestKey] = { actorId: user.actorId, payload, id };
  return { state: next, id, replay: false };
}
