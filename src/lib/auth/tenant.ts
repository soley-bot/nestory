const LOCAL_HOSTS = new Set(["0.0.0.0", "127.0.0.1", "::1", "localhost"]);
const DEFAULT_RESERVED_SUBDOMAINS = new Set(["api", "app", "www"]);

function normalizeHostname(host: string | null | undefined) {
  const value = host?.trim().toLowerCase();

  if (!value) {
    return null;
  }

  return value.startsWith("[")
    ? value.slice(1, value.indexOf("]"))
    : value.split(":")[0];
}

function getReservedSubdomains() {
  const configured = process.env.APP_RESERVED_SUBDOMAINS?.split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return configured?.length
    ? new Set(configured)
    : DEFAULT_RESERVED_SUBDOMAINS;
}

export function getOrganizationSlugFromHost(host: string | null | undefined) {
  const hostname = normalizeHostname(host);
  const rootDomain = normalizeHostname(process.env.APP_ROOT_DOMAIN);

  if (!hostname || !rootDomain || LOCAL_HOSTS.has(hostname)) {
    return null;
  }

  if (hostname === rootDomain || !hostname.endsWith(`.${rootDomain}`)) {
    return null;
  }

  const subdomain = hostname.slice(0, -rootDomain.length - 1);

  if (!subdomain || subdomain.includes(".") || getReservedSubdomains().has(subdomain)) {
    return null;
  }

  return subdomain;
}
