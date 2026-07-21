const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;
const RESERVED_SLUGS = new Set(["api", "app", "www"]);

export function parseProvisionArgs(args) {
  const values = new Map(
    args.flatMap((argument) => {
      const match = argument.match(/^--([a-z]+)=(.*)$/);
      return match ? [[match[1], match[2]]] : [];
    }),
  );

  return {
    adminEmail: values.get("admin") ?? "",
    name: values.get("name") ?? "",
    slug: values.get("slug") ?? "",
  };
}

export function validateProvisionInput(input) {
  const normalized = {
    adminEmail: input.adminEmail.trim().toLowerCase(),
    name: input.name.trim(),
    slug: input.slug.trim().toLowerCase(),
  };

  if (normalized.name.length < 2 || normalized.name.length > 120) {
    throw new Error("Company name must be between 2 and 120 characters.");
  }
  if (
    !SLUG_PATTERN.test(normalized.slug) ||
    RESERVED_SLUGS.has(normalized.slug)
  ) {
    throw new Error(
      "Workspace slug must be 3-63 lowercase letters, numbers, or hyphens and cannot be reserved.",
    );
  }
  if (!EMAIL_PATTERN.test(normalized.adminEmail)) {
    throw new Error("Administrator email must be valid.");
  }

  return normalized;
}

export async function provisionWorkspace({ client, input, siteUrl }) {
  const values = validateProvisionInput(input);
  const appUrl = validateSiteUrl(siteUrl);
  const { data, error } = await client.rpc("provision_client_workspace", {
    p_admin_email: values.adminEmail,
    p_name: values.name,
    p_slug: values.slug,
  });

  if (error || !data?.[0]) {
    throw new Error(
      `Workspace provisioning failed: ${safeProviderMessage(error?.message)}`,
    );
  }

  const provisioned = data[0];
  const redirectTo = acceptanceConfirmUrl(appUrl, provisioned.invitation_id);
  let authUserId = null;
  let deliveryMethod = "invite";
  let deliveryError = null;

  const inviteResult = await client.auth.admin.inviteUserByEmail(
    provisioned.invited_email,
    { redirectTo },
  );

  if (!inviteResult.error) {
    authUserId = inviteResult.data?.user?.id ?? null;
  } else if (isExistingUserError(inviteResult.error)) {
    deliveryMethod = "magic_link";
    const claimResult = await client.auth.signInWithOtp({
      email: provisioned.invited_email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: false,
      },
    });
    deliveryError = claimResult.error;
  } else {
    deliveryError = inviteResult.error;
  }

  if (deliveryError) {
    await client.rpc("mark_organization_invitation_delivery_failed", {
      p_error: safeProviderMessage(deliveryError.message),
      p_invitation_id: provisioned.invitation_id,
    });
    return {
      deliveryMethod,
      invitationState: "send_failed",
      invitedEmail: provisioned.invited_email,
      organization: provisioned.organization_name,
      slug: provisioned.workspace_slug,
    };
  }

  const markResult = await client.rpc("mark_organization_invitation_sent", {
    p_auth_user_id: authUserId,
    p_delivery_method: deliveryMethod,
    p_invitation_id: provisioned.invitation_id,
  });

  if (markResult.error) {
    throw new Error(
      `Invitation was delivered but state could not be finalized: ${safeProviderMessage(markResult.error.message)}`,
    );
  }

  return {
    deliveryMethod,
    invitationState: "pending",
    invitedEmail: provisioned.invited_email,
    organization: provisioned.organization_name,
    slug: provisioned.workspace_slug,
  };
}

function acceptanceConfirmUrl(siteUrl, invitationId) {
  const url = new URL("/auth/confirm", siteUrl);
  url.searchParams.set(
    "next",
    `/accept-invite?invitation=${invitationId}`,
  );
  return url.toString();
}

function validateSiteUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("NESTORY_APP_URL must be a safe HTTP(S) application URL.");
  }
  return url.toString();
}

function isExistingUserError(error) {
  if (error.code) {
    return error.code === "user_already_exists";
  }

  const normalized = error.message.toLowerCase();
  return (
    normalized.includes("already") ||
    normalized.includes("registered") ||
    normalized.includes("exists")
  );
}

function safeProviderMessage(message) {
  return (message || "Unknown provider error").slice(0, 500);
}
