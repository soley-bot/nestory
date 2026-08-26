"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import {
  createPublicInterestRateLimitKey,
  getTrustedPublicClientSubject,
} from "@/lib/security/public-interest-rate-limit";

type RequestFieldErrors = {
  companyName?: string[];
  fullName?: string[];
  message?: string[];
  portfolioSize?: string[];
  requestType?: string[];
  workEmail?: string[];
};

export type PublicInterestRequestState = {
  fieldErrors?: RequestFieldErrors;
  message?: string;
  status?: "error" | "success";
};

const publicInterestRequestSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, "Enter your company name.")
    .max(160, "Keep the company name under 160 characters."),
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(120, "Keep your name under 120 characters."),
  message: z
    .string()
    .trim()
    .max(1200, "Keep the note under 1,200 characters."),
  portfolioSize: z.enum(["", "1-25", "26-100", "101-500", "500+"]),
  requestType: z.enum(["information", "demo"], {
    message: "Choose a request type.",
  }),
  workEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid work email.")
    .max(254, "Keep the email under 254 characters."),
});

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function nullableString(value: string) {
  return value.length > 0 ? value : null;
}

export async function submitPublicInterestRequest(
  _state: PublicInterestRequestState,
  formData: FormData,
): Promise<PublicInterestRequestState> {
  if (readString(formData, "website").trim().length > 0) {
    return requestReceivedState();
  }

  const parsed = publicInterestRequestSchema.safeParse({
    companyName: readString(formData, "companyName"),
    fullName: readString(formData, "fullName"),
    message: readString(formData, "message"),
    portfolioSize: readString(formData, "portfolioSize"),
    requestType: readString(formData, "requestType"),
    workEmail: readString(formData, "workEmail"),
  });

  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as RequestFieldErrors,
      status: "error",
    };
  }

  try {
    const subject = getTrustedPublicClientSubject(await headers(), {
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL,
    });
    if (!subject) return requestFailureState();

    const subjectDigest = createPublicInterestRateLimitKey(
      subject,
      process.env.PUBLIC_INTEREST_RATE_LIMIT_SECRET ?? "",
    );
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc(
      "submit_public_interest_request_limited",
      {
        p_company_name: parsed.data.companyName,
        p_full_name: parsed.data.fullName,
        p_message: nullableString(parsed.data.message),
        p_portfolio_size: nullableString(parsed.data.portfolioSize),
        p_request_type: parsed.data.requestType,
        p_subject_digest: subjectDigest,
        p_work_email: parsed.data.workEmail,
      },
    );

    if (error) {
      console.error(
        "[marketing] public interest submission failed",
        redactedDatabaseError(error),
      );
      return requestFailureState();
    }
    if (!["accepted", "duplicate", "limited"].includes(String(data))) {
      console.error("[marketing] public interest submission returned an invalid result");
      return requestFailureState();
    }
  } catch (error) {
    console.error("[marketing] public interest submission failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return requestFailureState();
  }

  return requestReceivedState();
}

function redactedDatabaseError(error: unknown) {
  const code =
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
    && /^[A-Z0-9]{5,10}$/.test(error.code)
      ? error.code
      : "unknown";

  return { code };
}

function requestFailureState(): PublicInterestRequestState {
  return {
    message: "We could not save your request. Please try again.",
    status: "error",
  };
}

function requestReceivedState(): PublicInterestRequestState {
  return {
    message: "Your request is in. We will follow up at your work email.",
    status: "success",
  };
}
