ALTER TABLE public.organizations
  ADD COLUMN theme_mode text NOT NULL DEFAULT 'system',
  ADD COLUMN accent_preset text NOT NULL DEFAULT 'neutral',
  ADD COLUMN accent_seed text,
  ADD CONSTRAINT organizations_theme_mode_check
    CHECK (theme_mode IN ('light', 'dark', 'system')),
  ADD CONSTRAINT organizations_accent_preset_check
    CHECK (accent_preset IN ('neutral', 'forest', 'ocean', 'indigo', 'plum', 'terracotta', 'custom')),
  ADD CONSTRAINT organizations_accent_seed_check
    CHECK (
      (accent_preset = 'custom' AND accent_seed ~ '^#[0-9A-F]{6}$')
      OR (accent_preset <> 'custom' AND accent_seed IS NULL)
    );

CREATE OR REPLACE FUNCTION public.update_organization_appearance(
  p_organization_id uuid,
  p_theme_mode text,
  p_accent_preset text,
  p_accent_seed text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_accent_seed text;
BEGIN
  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Only a Super Admin can update organization appearance.'
      USING ERRCODE = '42501';
  END IF;

  IF p_theme_mode IS NULL OR p_theme_mode NOT IN ('light', 'dark', 'system') THEN
    RAISE EXCEPTION 'Choose a valid theme mode.' USING ERRCODE = '22023';
  END IF;

  IF p_accent_preset IS NULL OR p_accent_preset NOT IN (
    'neutral', 'forest', 'ocean', 'indigo', 'plum', 'terracotta', 'custom'
  ) THEN
    RAISE EXCEPTION 'Choose a valid accent preset.' USING ERRCODE = '22023';
  END IF;

  IF p_accent_preset = 'custom' THEN
    IF p_accent_seed IS NULL OR btrim(p_accent_seed) !~* '^#[0-9a-f]{6}$' THEN
      RAISE EXCEPTION 'Enter a valid six-digit hex color.' USING ERRCODE = '22023';
    END IF;
    v_accent_seed := upper(btrim(p_accent_seed));
  ELSE
    IF p_accent_seed IS NOT NULL THEN
      RAISE EXCEPTION 'Preset accents cannot include a custom color.' USING ERRCODE = '22023';
    END IF;
    v_accent_seed := NULL;
  END IF;

  UPDATE public.organizations
  SET
    theme_mode = p_theme_mode,
    accent_preset = p_accent_preset,
    accent_seed = v_accent_seed
  WHERE id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found.' USING ERRCODE = 'P0002';
  END IF;

  RETURN p_organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_organization_appearance(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_organization_appearance(uuid, text, text, text) TO authenticated;
