CREATE INDEX IF NOT EXISTS ledger_period_locks_locked_by_idx
  ON public.ledger_period_locks (locked_by);
