const INVALID_LINK_MESSAGE = "This email link is invalid or has expired.";
const MAX_TOKEN_LENGTH = 16_384;
const PRINTABLE_ASCII = /^[\x21-\x7E]+$/;

type ImplicitAuthTokens = {
  accessToken: string;
  refreshToken: string;
  type?: string;
};

type ImplicitAuthError = {
  error: string;
};

export function parseImplicitAuthFragment(
  fragment: string,
): ImplicitAuthTokens | ImplicitAuthError {
  const params = new URLSearchParams(
    fragment.startsWith("#") ? fragment.slice(1) : fragment,
  );

  if (params.has("error") || params.has("error_description")) {
    return { error: INVALID_LINK_MESSAGE };
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const type = params.get("type");

  if (
    !isValidToken(accessToken) ||
    !isValidToken(refreshToken) ||
    (type !== null && !/^[a-z_]{1,32}$/i.test(type))
  ) {
    return { error: INVALID_LINK_MESSAGE };
  }

  return {
    accessToken,
    refreshToken,
    ...(type ? { type } : {}),
  };
}

function isValidToken(value: string | null): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_TOKEN_LENGTH &&
    PRINTABLE_ASCII.test(value)
  );
}
