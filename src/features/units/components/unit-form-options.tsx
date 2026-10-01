"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type {
  UnitFormOptionsByMode,
  UnitFormOptionsMode,
  UnitFormOptionsResponse,
} from "@/features/units/unit-form-options.types";

export function UnitFormOptions<M extends UnitFormOptionsMode>({
  children,
  mode,
  propertyId,
  unitId,
}: {
  children: (options: UnitFormOptionsByMode[M]) => ReactNode;
  mode: M;
  propertyId: string;
  unitId: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    error?: string;
    key: string;
    options?: UnitFormOptionsByMode[M];
  } | null>(null);
  const requestKey = `${unitId}:${propertyId}:${mode}:${attempt}`;

  useEffect(() => {
    const controller = new AbortController();

    async function loadOptions() {
      let failureMessage = "Could not load this form. Try again.";
      try {
        const response = await fetch(
          `/api/units/${encodeURIComponent(unitId)}/form-options?mode=${mode}`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            failureMessage =
              "Your access to this form has changed. Refresh the page to check your access.";
          } else if (response.status === 404 || response.status === 409) {
            failureMessage =
              "This unit is no longer available for this form. Refresh the page.";
          }
          throw new Error(failureMessage);
        }
        const payload: unknown = await response.json();
        if (!isOptionsResponse(payload, mode, unitId, propertyId)) {
          throw new Error("Could not load this form. Try again.");
        }
        if (!controller.signal.aborted) {
          setState({ key: requestKey, options: payload.options });
        }
      } catch {
        if (!controller.signal.aborted) {
          setState({
            error: failureMessage,
            key: requestKey,
          });
        }
      }
    }

    void loadOptions();
    return () => controller.abort();
  }, [mode, propertyId, requestKey, unitId]);

  const current = state?.key === requestKey ? state : null;
  if (current?.options) {
    return children(current.options);
  }
  return (
    <div className="space-y-3 p-5">
      {current?.error ? (
        <>
          <p className="text-sm text-muted-foreground" role="alert">
            {current.error}
          </p>
          <Button onClick={() => setAttempt((value) => value + 1)} variant="outline">
            Try again
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground" role="status">
          Loading form…
        </p>
      )}
    </div>
  );
}

function isOptionsResponse<M extends UnitFormOptionsMode>(
  payload: unknown,
  mode: M,
  unitId: string,
  propertyId: string,
): payload is UnitFormOptionsResponse<M> {
  if (
    !isObject(payload) ||
    payload.mode !== mode ||
    payload.unitId !== unitId ||
    payload.propertyId !== propertyId ||
    !isObject(payload.options)
  ) {
    return false;
  }
  const options = payload.options;
  if (mode === "lease") {
    return Array.isArray(options.tenants) && isObject(options.billingFormConfig);
  }
  return (
    isObject(options.actor) &&
    typeof options.canRecordActualCost === "boolean" &&
    [options.branches, options.properties, options.staff, options.units, options.vendors]
      .every(Array.isArray)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
