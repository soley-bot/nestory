-- A source cent can be smaller than the effective owner count. The persisted
-- roster decision therefore must retain zero-cent owner rows after the stable
-- largest-remainder winner receives the cent. Zero component rows preserve
-- that exact source-to-owner lineage without changing any balance total.

ALTER TABLE public.owner_event_owner_allocations
  DROP CONSTRAINT owner_event_owner_allocations_amount_check;

ALTER TABLE public.owner_event_owner_allocations
  ADD CONSTRAINT owner_event_owner_allocations_amount_check CHECK (
    allocated_gross_signed_amount =
      pg_catalog.round(allocated_gross_signed_amount, 2)
  );

ALTER TABLE public.owner_component_movements
  DROP CONSTRAINT owner_component_movements_amount_check;

ALTER TABLE public.owner_component_movements
  ADD CONSTRAINT owner_component_movements_amount_check CHECK (
    signed_amount = pg_catalog.round(signed_amount, 2)
  );

COMMENT ON CONSTRAINT owner_event_owner_allocations_amount_check
  ON public.owner_event_owner_allocations IS
  'Exact-cent roster snapshots allow zero when the source has fewer cents than effective owners.';

COMMENT ON CONSTRAINT owner_component_movements_amount_check
  ON public.owner_component_movements IS
  'Exact-cent component lineage may include zero rows for persisted zero-cent roster allocations.';
