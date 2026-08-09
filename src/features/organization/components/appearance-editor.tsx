"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { Palette } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DraftActionBar, type DraftStatus } from "@/components/ui/draft-action-bar";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import { updateOrganizationAppearanceAction } from "@/features/organization/actions";
import type { SettingsEditorHandle } from "@/features/organization/components/branch-editor";
import { useSettingsDraft } from "@/features/organization/components/use-settings-draft";
import {
  ACCENT_PRESET_NAMES,
  ACCENT_PRESETS,
  DEFAULT_ORGANIZATION_THEME,
  getOrganizationThemeStyle,
  normalizeHexColor,
  normalizeOrganizationTheme,
  ORGANIZATION_THEME_UPDATED_EVENT,
  type AccentPreset,
  type OrganizationTheme,
  type ThemeMode,
} from "@/lib/theme/organization-theme";
import { cn } from "@/lib/utils";

type AppearanceDraft = {
  accentPreset: string;
  accentSeed: string;
  mode: string;
};

type AppearanceEditorProps = {
  onDraftStatusChange: (status: DraftStatus) => void;
  theme: OrganizationTheme;
};

export const AppearanceEditor = forwardRef<
  SettingsEditorHandle,
  AppearanceEditorProps
>(function AppearanceEditor({ onDraftStatusChange, theme }, controllerRef) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const initialValues = useMemo<AppearanceDraft>(
    () => ({
      accentPreset: theme.accentPreset,
      accentSeed: theme.accentSeed ?? "#2563EB",
      mode: theme.mode,
    }),
    [theme],
  );
  const draft = useSettingsDraft({
    action: updateOrganizationAppearanceAction,
    errorMessage: "Appearance not saved",
    initialValues,
    retainValuesAfterSuccess: true,
    savedMessage: "Appearance saved",
    savingMessage: "Saving appearance",
    validate: validateAppearance,
  });
  const previewTheme = getPreviewTheme(draft.values);
  const previewMode = previewTheme.mode === "dark" ? "dark" : "light";
  const acceptThemeValues = draft.acceptValues;

  useImperativeHandle(controllerRef, () => ({ discard: draft.discard }), [draft.discard]);
  useEffect(() => onDraftStatusChange(draft.status), [draft.status, onDraftStatusChange]);
  useEffect(
    () => () => onDraftStatusChange("clean"),
    [onDraftStatusChange],
  );
  useEffect(() => {
    if (draft.status === "saved") router.refresh();
  }, [draft.status, router]);
  useEffect(() => {
    function handleThemeUpdated(event: Event) {
      const next = (event as CustomEvent<OrganizationTheme>).detail;
      acceptThemeValues({
        accentPreset: next.accentPreset,
        accentSeed: next.accentSeed ?? "#2563EB",
        mode: next.mode,
      });
    }

    window.addEventListener(ORGANIZATION_THEME_UPDATED_EVENT, handleThemeUpdated);
    return () => window.removeEventListener(ORGANIZATION_THEME_UPDATED_EVENT, handleThemeUpdated);
  }, [acceptThemeValues]);

  function restoreDefault() {
    draft.replaceValues({
      accentPreset: DEFAULT_ORGANIZATION_THEME.accentPreset,
      accentSeed: "#2563EB",
      mode: DEFAULT_ORGANIZATION_THEME.mode,
    });
  }

  return (
    <Card className="min-w-0" data-testid="settings-editor" size="sm">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Palette aria-hidden="true" size={15} />
          <h2>Appearance</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void draft.submit((field) => {
              const control = formRef.current?.elements.namedItem(String(field));
              if (control instanceof HTMLElement) control.focus();
            });
          }}
          ref={formRef}
        >
          <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
            <div className="min-w-0 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium" id="theme-mode-label">
                  Theme mode
                </label>
                <SelectControl
                  ariaLabel="Theme mode"
                  name="mode"
                  onValueChange={(value) => draft.setField("mode", value)}
                  options={[
                    { label: "System", value: "system" },
                    { label: "Light", value: "light" },
                    { label: "Dark", value: "dark" },
                  ]}
                  value={draft.values.mode}
                />
                <p className="text-xs text-muted-foreground">
                  Applies to everyone in this organization.
                </p>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Accent color</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ACCENT_PRESET_NAMES.map((preset) => {
                    const selected = draft.values.accentPreset === preset;
                    const seed =
                      preset === "neutral"
                        ? "linear-gradient(135deg,#111 50%,#f5f5f5 50%)"
                        : preset === "custom"
                          ? draft.values.accentSeed
                          : ACCENT_PRESETS[preset].seed!;
                    return (
                      <button
                        aria-pressed={selected}
                        className={cn(
                          "flex min-h-10 items-center gap-2 rounded-lg border px-2.5 text-left text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                          selected && "border-ring bg-muted",
                        )}
                        key={preset}
                        onClick={() => draft.setField("accentPreset", preset)}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className="size-4 shrink-0 rounded-full border border-black/15"
                          style={{ background: seed }}
                        />
                        {ACCENT_PRESETS[preset].label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {draft.values.accentPreset === "custom" ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="accentSeed">
                    Custom hex color
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label="Custom color picker"
                      className="w-11 shrink-0 p-1"
                      onChange={(event) => draft.setField("accentSeed", event.target.value.toUpperCase())}
                      type="color"
                      value={normalizeHexColor(draft.values.accentSeed) ?? "#2563EB"}
                    />
                    <Input
                      aria-describedby={draft.errors.accentSeed ? "accent-seed-error" : undefined}
                      aria-invalid={Boolean(draft.errors.accentSeed)}
                      id="accentSeed"
                      name="accentSeed"
                      onChange={(event) => draft.setField("accentSeed", event.target.value)}
                      placeholder="#2563EB"
                      value={draft.values.accentSeed}
                    />
                  </div>
                  {draft.errors.accentSeed ? (
                    <p className="text-sm text-danger" id="accent-seed-error">
                      {draft.errors.accentSeed}
                    </p>
                  ) : null}
                </div>
              ) : (
                <input name="accentSeed" type="hidden" value="" />
              )}

              <Button onClick={restoreDefault} type="button" variant="outline">
                Restore Nestory default
              </Button>
            </div>

            <div
              className={cn(
                "overflow-hidden rounded-xl border bg-background text-foreground",
                previewMode === "dark" && "dark",
              )}
              data-testid="appearance-preview"
              style={getOrganizationThemeStyle(previewTheme, previewMode)}
            >
              <div className="border-b bg-background px-4 py-3 text-sm font-semibold">
                Workspace preview
              </div>
              <div className="space-y-3 bg-card p-4">
                <div className="rounded-lg bg-[var(--org-accent-soft)] px-3 py-2 text-sm font-medium">
                  Selected navigation
                </div>
                <Input aria-label="Preview input" placeholder="Focused input" />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button">Primary action</Button>
                  <a className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="#appearance-preview">
                    Record link
                  </a>
                  <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
                    Active
                  </span>
                </div>
              </div>
            </div>
          </div>

          {draft.resultMessage ? (
            <p className={cn("px-4 pb-3 text-sm", draft.status === "error" ? "text-danger" : "text-success")}>
              {draft.resultMessage}
            </p>
          ) : null}
          <DraftActionBar
            confirmDiscard={false}
            onDiscard={draft.discard}
            onSave={() => {
              formRef.current?.requestSubmit();
            }}
            status={draft.status}
            statusMessage={draft.statusMessage}
          />
        </form>
      </CardContent>
    </Card>
  );
});

function validateAppearance(values: AppearanceDraft) {
  const errors: Partial<Record<keyof AppearanceDraft, string>> = {};
  if (!(["light", "dark", "system"] as string[]).includes(values.mode)) {
    errors.mode = "Choose a valid theme mode.";
  }
  if (!(ACCENT_PRESET_NAMES as readonly string[]).includes(values.accentPreset)) {
    errors.accentPreset = "Choose a valid accent color.";
  }
  if (values.accentPreset === "custom" && !normalizeHexColor(values.accentSeed)) {
    errors.accentSeed = "Enter a six-digit hex color.";
  }
  return errors;
}

function getPreviewTheme(values: AppearanceDraft): OrganizationTheme {
  return normalizeOrganizationTheme({
    accentPreset: values.accentPreset as AccentPreset,
    accentSeed: values.accentSeed,
    mode: values.mode as ThemeMode,
  });
}
