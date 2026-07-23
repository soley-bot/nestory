"use server";

import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/db/admin";

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
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("public_interest_requests").insert({
      company_name: parsed.data.companyName,
      full_name: parsed.data.fullName,
      message: nullableString(parsed.data.message),
      portfolio_size: nullableString(parsed.data.portfolioSize),
      request_type: parsed.data.requestType,
      work_email: parsed.data.workEmail,
    });

    if (error && error.code !== "23505") {
      return {
        message: "We could not save your request. Please try again.",
        status: "error",
      };
    }
  } catch {
    return {
      message: "We could not save your request. Please try again.",
      status: "error",
    };
  }

  return requestReceivedState();
}

function requestReceivedState(): PublicInterestRequestState {
  return {
    message: "Your request is in. We will follow up at your work email.",
    status: "success",
  };
}
