"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type {
  PropertyFormOptionsByMode,
  PropertyFormOptionsMode,
  PropertyFormOptionsResponse,
} from "@/features/properties/property-form-options.types";

export function PropertyFormOptions<M extends PropertyFormOptionsMode>({
  children,
  mode,
  propertyId,
  initialOptions,
}: {
  children: (options: PropertyFormOptionsByMode[M]) => ReactNode;
  mode: M;
  propertyId: string;
  initialOptions?: PropertyFormOptionsByMode[M];
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    error?: string;
    key: string;
    options?: PropertyFormOptionsByMode[M];
  } | null>(null);
  const requestKey = `${propertyId}:${mode}:${attempt}`;

  useEffect(() => {
    if (initialOptions) return;
    const controller = new AbortController();

    async function loadOptions() {
      let failureMessage = "Could not load this form. Try again.";
      try {
        const response = await fetch(
          `/api/properties/${encodeURIComponent(propertyId)}/form-options?mode=${mode}`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            failureMessage =
              "You do not have access to this form. Refresh the page to check your access.";
          } else if (response.status === 404 || response.status === 409) {
            failureMessage =
              "This property is no longer available for this form. Refresh the page.";
          }
          throw new Error(failureMessage);
        }
        const payload: unknown = await response.json();
        if (!isOptionsResponse(payload, mode, propertyId)) {
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
  }, [initialOptions, mode, propertyId, requestKey]);

  if (initialOptions) return children(initialOptions);

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

function isOptionsResponse<M extends PropertyFormOptionsMode>(
  payload: unknown,
  mode: M,
  propertyId: string,
): payload is PropertyFormOptionsResponse<M> {
  if (
    !isObject(payload) ||
    payload.mode !== mode ||
    payload.propertyId !== propertyId ||
    !isObject(payload.options)
  ) {
    return false;
  }
  const options = payload.options;
  if (mode === "lease") {
    return Array.isArray(options.tenants) && isObject(options.billingFormConfig);
  }
  return Array.isArray(options.owners);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
