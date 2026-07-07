-- Remove untouched petty-cash demo accounts created by the first migration.
DELETE FROM public.petty_cash_accounts account
WHERE account.account_number = 'PM-CASH'
  AND account.name = 'Petty Cash PM'
  AND account.float_amount = 290
  AND account.created_by IS NULL
  AND account.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.petty_cash_entries entry
    WHERE entry.account_id = account.id
      AND entry.archived_at IS NULL
  );
