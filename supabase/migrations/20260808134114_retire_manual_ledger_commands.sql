DROP FUNCTION public.create_ledger_entry(
  uuid, uuid, uuid, date, text, text, numeric, public.currency_code, text
);

DROP FUNCTION public.update_ledger_entry(
  uuid, uuid, uuid, uuid, date, text, text, numeric, public.currency_code, text
);

DROP FUNCTION public.archive_ledger_entry(uuid, uuid);
DROP FUNCTION public.restore_ledger_entry(uuid, uuid);

DROP POLICY "Admins can manage ledger entries"
ON public.ledger_entries;
