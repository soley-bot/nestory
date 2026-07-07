type HrefParamValue = string | null | undefined;

export function buildHref(pathname: string, params: Record<string, HrefParamValue>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const queryString = searchParams.toString();

  return queryString ? `${pathname}?${queryString}` : pathname;
}

export function removeSearchParam(
  pathname: string,
  searchParams: { toString(): string },
  key: string,
) {
  return removeSearchParams(pathname, searchParams, [key]);
}

export function removeActionSearchParam(
  pathname: string,
  searchParams: { toString(): string },
) {
  return removeSearchParam(pathname, searchParams, "action");
}

export function removeSearchParams(
  pathname: string,
  searchParams: { toString(): string },
  keys: string[],
) {
  const nextParams = new URLSearchParams(searchParams.toString());

  for (const key of keys) {
    nextParams.delete(key);
  }

  const queryString = nextParams.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}
