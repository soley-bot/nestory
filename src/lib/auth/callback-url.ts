const LOCAL_APPLICATION_ORIGIN = "http://localhost:3000";

function configuredApplicationOrigin() {
  const configuredUrl = process.env.NESTORY_APP_URL?.trim();

  if (configuredUrl) {
    const url = new URL(configuredUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error("NESTORY_APP_URL must be an HTTP(S) application origin.");
    }

    return url.origin;
  }

  const vercelHostname = process.env.VERCEL_URL?.trim();
  if (vercelHostname) {
    if (
      !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(vercelHostname) ||
      !vercelHostname.includes(".")
    ) {
      throw new Error("VERCEL_URL must be a valid deployment hostname.");
    }

    return `https://${vercelHostname}`;
  }

  return LOCAL_APPLICATION_ORIGIN;
}

export function getAuthCallbackUrl(route: string, nextPath?: string) {
  if (!route.startsWith("/") || route.startsWith("//")) {
    throw new Error("Auth callback route must be an internal path.");
  }

  const callbackUrl = new URL(route, configuredApplicationOrigin());
  if (nextPath) {
    callbackUrl.searchParams.set("next", nextPath);
  }

  return callbackUrl.toString();
}
