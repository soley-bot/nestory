import * as Sentry from "@sentry/nextjs";
import { setNonce } from "get-nonce";

import { buildSentryOptions } from "@/lib/observability/sentry-options";

const requestNonce = document.querySelector<HTMLScriptElement>("script[nonce]")
  ?.nonce;
if (requestNonce) setNonce(requestNonce);

Sentry.init(buildSentryOptions("client"));
