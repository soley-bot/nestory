-- Keep the security-invoker view and every accounting expression unchanged.
-- Receipt existence determines whether an allocation contributes held cash.
-- A semi-join avoids repeatedly scanning authorized allocations for each
-- receipt under RLS (the Pilot plan repeated the inner join 45 times).
-- Original and reversing receipts remain excluded exactly as before.
CREATE OR REPLACE VIEW "public"."property_finance_positions" WITH ("security_invoker"='true') AS
 WITH "current_owner" AS (
         SELECT "owner_link"."organization_id",
            "owner_link"."property_id",
            "owner_link"."person_id" AS "owner_person_id"
           FROM "public"."property_owners" "owner_link"
          WHERE ("owner_link"."is_primary" AND ("owner_link"."archived_at" IS NULL) AND (("owner_link"."started_on" IS NULL) OR ("owner_link"."started_on" <= CURRENT_DATE)) AND (("owner_link"."ended_on" IS NULL) OR ("owner_link"."ended_on" >= CURRENT_DATE)))
        ), "rent_income" AS (
         SELECT "entry"."organization_id",
            "entry"."property_id",
            ("sum"("entry"."amount"))::numeric(14,2) AS "amount"
           FROM "public"."property_account_entries" "entry"
          WHERE ("entry"."category" = 'rent_income'::"text")
          GROUP BY "entry"."organization_id", "entry"."property_id"
        ), "fee_expense" AS (
         SELECT "fee"."organization_id",
            "fee"."property_id",
            ("sum"("fee"."amount"))::numeric(14,2) AS "amount"
           FROM "public"."management_fee_occurrences" "fee"
          GROUP BY "fee"."organization_id", "fee"."property_id"
        ), "owner_expense" AS (
         SELECT "effect"."organization_id",
            "effect"."property_id",
            ("sum"("effect"."amount"))::numeric(14,2) AS "amount"
           FROM ( SELECT "responsibility"."organization_id",
                    "responsibility"."property_id",
                    "responsibility"."customer_total_amount" AS "amount"
                   FROM "public"."ips_expense_responsibilities" "responsibility"
                  WHERE ("responsibility"."responsibility" = 'owner'::"text")
                UNION ALL
                 SELECT "adjustment"."organization_id",
                    "adjustment"."property_id",
                    "adjustment"."amount"
                   FROM "public"."expense_customer_adjustments" "adjustment"
                  WHERE ("adjustment"."responsibility" = 'owner'::"text")) "effect"
          GROUP BY "effect"."organization_id", "effect"."property_id"
        ), "withdrawal_total" AS (
         SELECT "withdrawal"."organization_id",
            "withdrawal"."property_id",
            (sum(CASE WHEN withdrawal.reversal_of_id IS NULL THEN withdrawal.amount ELSE -withdrawal.amount END))::numeric(14,2) AS "amount"
           FROM "public"."property_withdrawals" "withdrawal"
          GROUP BY "withdrawal"."organization_id", "withdrawal"."property_id"
        ), "ips_rent_cash" AS (
         SELECT invoice.organization_id,
            invoice.property_id,
            sum(allocation.amount)::numeric(14,2) AS amount
           FROM public.tenant_invoice_payment_allocations allocation
           JOIN public.tenant_invoice_lines line
             ON line.organization_id = allocation.organization_id
            AND line.id = allocation.invoice_line_id
           JOIN public.tenant_invoices invoice
             ON invoice.organization_id = allocation.organization_id
            AND invoice.id = allocation.invoice_id
          WHERE line.line_type = 'rent'
            AND EXISTS (
              SELECT 1
              FROM public.finance_receipts receipt
              WHERE receipt.organization_id = allocation.organization_id
                AND receipt.id = allocation.finance_receipt_id
                AND receipt.reversal_of_id IS NULL
                AND NOT EXISTS (
                  SELECT 1
                  FROM public.finance_receipts reversal
                  WHERE reversal.organization_id = receipt.organization_id
                    AND reversal.reversal_of_id = receipt.id
                )
            )
          GROUP BY invoice.organization_id, invoice.property_id
        ), "charge_cash" AS (
         SELECT "allocation"."organization_id",
            "allocation"."property_id",
            ("sum"("allocation"."amount"))::numeric(14,2) AS "amount"
           FROM "public"."owner_charge_cash_allocations" "allocation"
          GROUP BY "allocation"."organization_id", "allocation"."property_id"
        ), "owner_charge_total" AS (
         SELECT "charge"."organization_id",
            "charge"."property_id",
            ("sum"("charge"."amount"))::numeric(14,2) AS "amount"
           FROM ( SELECT "line"."organization_id",
                    "line"."property_id",
                    "line"."amount"
                   FROM "public"."owner_invoice_lines" "line"
                UNION ALL
                 SELECT "adjustment"."organization_id",
                    "adjustment"."property_id",
                    "adjustment"."amount"
                   FROM "public"."expense_customer_adjustments" "adjustment"
                  WHERE ("adjustment"."responsibility" = 'owner'::"text")) "charge"
          GROUP BY "charge"."organization_id", "charge"."property_id"
        ), "owner_paid" AS (
         SELECT "invoice"."organization_id",
            "invoice"."property_id",
            ("sum"("allocation"."amount"))::numeric(14,2) AS "amount"
           FROM ("public"."owner_payment_allocations" "allocation"
             JOIN "public"."owner_invoices" "invoice" ON ((("invoice"."organization_id" = "allocation"."organization_id") AND ("invoice"."id" = "allocation"."owner_invoice_id"))))
          GROUP BY "invoice"."organization_id", "invoice"."property_id"
        )
 SELECT "property"."organization_id",
    "property"."id" AS "property_id",
    "property"."code" AS "property_code",
    "property"."name" AS "property_name",
    "current_owner"."owner_person_id",
    'USD'::"public"."currency_code" AS "currency",
    (COALESCE("rent_income"."amount", (0)::numeric))::numeric(14,2) AS "rent_income",
    (COALESCE("fee_expense"."amount", (0)::numeric))::numeric(14,2) AS "management_fee_expense",
    (COALESCE("owner_expense"."amount", (0)::numeric))::numeric(14,2) AS "owner_expense",
    (COALESCE("withdrawal_total"."amount", (0)::numeric))::numeric(14,2) AS "withdrawals",
    ((((COALESCE("rent_income"."amount", (0)::numeric) - COALESCE("fee_expense"."amount", (0)::numeric)) - COALESCE("owner_expense"."amount", (0)::numeric)) + COALESCE((SELECT sum(c.amount) FROM public.owner_cash_events c WHERE c.organization_id=property.organization_id AND c.property_id=property.id AND c.event_type='owner_contribution'),0) - COALESCE("withdrawal_total"."amount", (0)::numeric)))::numeric(14,2) AS "running_balance",
    (GREATEST(((COALESCE("ips_rent_cash"."amount", (0)::numeric) - COALESCE("charge_cash"."amount", (0)::numeric)) + COALESCE((SELECT sum(c.amount) FROM public.owner_cash_events c WHERE c.organization_id=property.organization_id AND c.property_id=property.id AND c.event_type='owner_contribution'),0) - COALESCE("withdrawal_total"."amount", (0)::numeric)), (0)::numeric))::numeric(14,2) AS "cash_held_by_ips",
    (GREATEST(((COALESCE("owner_charge_total"."amount", (0)::numeric) - COALESCE("charge_cash"."amount", (0)::numeric)) - COALESCE("owner_paid"."amount", (0)::numeric)), (0)::numeric))::numeric(14,2) AS "owner_owes_ips",
    (GREATEST(((COALESCE("ips_rent_cash"."amount", (0)::numeric) - COALESCE("charge_cash"."amount", (0)::numeric)) + COALESCE((SELECT sum(c.amount) FROM public.owner_cash_events c WHERE c.organization_id=property.organization_id AND c.property_id=property.id AND c.event_type='owner_contribution'),0) - COALESCE("withdrawal_total"."amount", (0)::numeric)), (0)::numeric))::numeric(14,2) AS "available_withdrawal"
   FROM ((((((((("public"."properties" "property"
     LEFT JOIN "current_owner" ON ((("current_owner"."organization_id" = "property"."organization_id") AND ("current_owner"."property_id" = "property"."id"))))
     LEFT JOIN "rent_income" ON ((("rent_income"."organization_id" = "property"."organization_id") AND ("rent_income"."property_id" = "property"."id"))))
     LEFT JOIN "fee_expense" ON ((("fee_expense"."organization_id" = "property"."organization_id") AND ("fee_expense"."property_id" = "property"."id"))))
     LEFT JOIN "owner_expense" ON ((("owner_expense"."organization_id" = "property"."organization_id") AND ("owner_expense"."property_id" = "property"."id"))))
     LEFT JOIN "withdrawal_total" ON ((("withdrawal_total"."organization_id" = "property"."organization_id") AND ("withdrawal_total"."property_id" = "property"."id"))))
     LEFT JOIN "ips_rent_cash" ON ((("ips_rent_cash"."organization_id" = "property"."organization_id") AND ("ips_rent_cash"."property_id" = "property"."id"))))
     LEFT JOIN "charge_cash" ON ((("charge_cash"."organization_id" = "property"."organization_id") AND ("charge_cash"."property_id" = "property"."id"))))
     LEFT JOIN "owner_charge_total" ON ((("owner_charge_total"."organization_id" = "property"."organization_id") AND ("owner_charge_total"."property_id" = "property"."id"))))
     LEFT JOIN "owner_paid" ON ((("owner_paid"."organization_id" = "property"."organization_id") AND ("owner_paid"."property_id" = "property"."id"))))
  WHERE ("property"."archived_at" IS NULL);

