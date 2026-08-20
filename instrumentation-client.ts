import * as Sentry from "@sentry/nextjs";

import { buildSentryOptions } from "@/lib/observability/sentry-options";

Sentry.init(buildSentryOptions("client"));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
