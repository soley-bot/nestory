INSERT INTO public.organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'IPS Cambodia')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.properties (
  id,
  organization_id,
  name,
  code,
  property_type,
  owner,
  address,
  status,
  acquisition_date
)
VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'BKK1 Serviced Residence',
    'BKK1-SR-018',
    'Serviced Apartment',
    'IPS Managed Portfolio',
    'BKK1, Phnom Penh',
    'active',
    '2021-03-15'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Toul Kork Mixed Use Building',
    'TK-MU-006',
    'Mixed Use',
    'Sokha Holdings',
    'Toul Kork, Phnom Penh',
    'active',
    '2020-10-01'
  )
ON CONFLICT (organization_id, code) DO NOTHING;

INSERT INTO public.units (
  id,
  organization_id,
  property_id,
  unit_number,
  floor,
  size_sqm,
  status,
  current_rent_amount,
  current_rent_currency
)
VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '12B',
    '12',
    74.5,
    'occupied',
    950,
    'USD'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '09A',
    '9',
    68,
    'occupied',
    875,
    'USD'
  )
ON CONFLICT (property_id, unit_number) DO NOTHING;

INSERT INTO public.timeline_events (
  organization_id,
  property_id,
  unit_id,
  event_date,
  event_type,
  title,
  description,
  cost_amount,
  cost_currency
)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '2026-06-12',
    'Renovation',
    'Bathroom renovation completed',
    'Unit 12B bathroom refit completed with new tiles, sink, waterproofing, and fixtures.',
    2450,
    'USD'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    '2026-06-08',
    'Inspection',
    'Quarterly unit inspection',
    'Minor paint marks noted in living area. Air conditioner and water pressure passed inspection.',
    NULL,
    NULL
  );
