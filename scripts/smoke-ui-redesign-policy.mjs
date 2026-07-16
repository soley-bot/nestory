const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function validateLocalBaseUrl(value) {
  let parsedBaseUrl;

  try {
    parsedBaseUrl = new URL(value);
  } catch {
    throw new Error("BASE_URL must be a valid absolute URL");
  }

  if (!["http:", "https:"].includes(parsedBaseUrl.protocol)) {
    throw new Error("BASE_URL must use http or https");
  }

  if (parsedBaseUrl.username || parsedBaseUrl.password) {
    throw new Error("BASE_URL must not include userinfo");
  }

  const hostname = parsedBaseUrl.hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "");

  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error("BASE_URL must use a loopback host");
  }

  return parsedBaseUrl.origin;
}

export function createReadOnlyRequestPolicy({ baseUrl }) {
  const baseOrigin = new URL(baseUrl).origin;
  let authenticationRequestAvailable = true;

  return {
    evaluate({ headers, method, url }) {
      const normalizedMethod = method.toUpperCase();

      if (safeMethods.has(normalizedMethod)) {
        return { allowed: true, reason: "read-only" };
      }

      let requestUrl;

      try {
        requestUrl = new URL(url);
      } catch {
        return { allowed: false, reason: "invalid request URL" };
      }

      const nextAction = readHeader(headers, "next-action")?.trim();
      const contentType = readHeader(headers, "content-type")?.toLowerCase();
      const origin = readHeader(headers, "origin");
      const referer = readHeader(headers, "referer");
      const isNativeLoginSubmission =
        contentType?.startsWith("multipart/form-data;") &&
        origin === baseOrigin &&
        isLoginReferer(referer, baseOrigin);
      const isLoginServerAction =
        authenticationRequestAvailable &&
        normalizedMethod === "POST" &&
        requestUrl.origin === baseOrigin &&
        requestUrl.pathname === "/login" &&
        (Boolean(nextAction) || isNativeLoginSubmission);

      if (isLoginServerAction) {
        authenticationRequestAvailable = false;
        return { allowed: true, reason: "authentication" };
      }

      return { allowed: false, reason: "non-read request" };
    },
  };
}

function isLoginReferer(value, baseOrigin) {
  if (!value) {
    return false;
  }

  try {
    const referer = new URL(value);
    return referer.origin === baseOrigin && referer.pathname === "/login";
  } catch {
    return false;
  }
}

function readHeader(headers, name) {
  if (typeof headers?.get === "function") {
    return headers.get(name);
  }

  const match = Object.entries(headers ?? {}).find(
    ([headerName]) => headerName.toLowerCase() === name,
  );

  return match?.[1];
}
