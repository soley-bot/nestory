const providerRules = [
  {
    ruleId: "private-key",
    pattern:
      /(?:-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----|-----BEGIN PGP PRIVATE KEY (?:BLOCK)-----|---- BEGIN SSH2 ENCRYPTED PRIVATE KEY (?:----))/g,
  },
  {
    ruleId: "supabase-personal-access-token",
    pattern: /\bsbp_(?:v\d+_)?[A-Fa-f0-9]{40}\b/g,
  },
  {
    ruleId: "supabase-secret-key",
    pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    ruleId: "github-token",
    pattern:
      /\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{50,255})\b/g,
  },
  {
    ruleId: "gitlab-token",
    pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    ruleId: "npm-token",
    pattern: /\bnpm_[A-Za-z0-9]{36,}\b/g,
  },
  {
    ruleId: "sentry-auth-token",
    pattern: /\bsntrys_[A-Za-z0-9_=-]{20,}\b/g,
  },
  {
    ruleId: "resend-api-key",
    pattern: /\bre_[A-Za-z0-9]{24,}\b/g,
  },
  {
    ruleId: "stripe-live-secret",
    pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/g,
  },
  {
    ruleId: "openai-secret-key",
    pattern: /\bsk-(?:(?:proj|svcacct)-)?[A-Za-z0-9_-]{32,}\b/g,
  },
  {
    ruleId: "slack-token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g,
  },
  {
    ruleId: "aws-access-key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
];

const sensitiveNamePattern =
  /(?:^|_)(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SERVICE_ROLE_KEY|DB_PASSWORD|PRIVATE_KEY|SECRET|TOKEN|PASSWORD)(?:_|$)/;
const jwtPattern =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\b/g;
const credentialUrlPattern =
  /\b(?:postgres(?:ql)?|mysql|redis|rediss):\/\/[^\s"'`]+/g;

export function scanText({ path, text, textOnly = true }) {
  const findings = [];
  const occupiedLines = new Set();

  for (const rule of providerRules) {
    for (const match of text.matchAll(rule.pattern)) {
      addFinding(findings, occupiedLines, rule.ruleId, path, text, match.index);
    }
  }

  for (const match of text.matchAll(jwtPattern)) {
    if (isSupabaseServiceRoleJwt(match[0])) {
      addFinding(
        findings,
        occupiedLines,
        "supabase-service-role-jwt",
        path,
        text,
        match.index,
      );
    }
  }

  for (const match of text.matchAll(credentialUrlPattern)) {
    if (hasRealCredential(match[0])) {
      addFinding(
        findings,
        occupiedLines,
        "credential-bearing-url",
        path,
        text,
        match.index,
      );
    }
  }

  if (textOnly) {
    scanSensitiveAssignments({ findings, occupiedLines, path, text });
  }

  return findings;
}

export function formatRedactedFinding(finding) {
  return `${finding.ruleId} at ${finding.path}:${finding.line} (value redacted)`;
}

function scanSensitiveAssignments({ findings, occupiedLines, path, text }) {
  let offset = 0;
  for (const line of text.split("\n")) {
    const assignment = line.match(
      /^\s*(?:export\s+)?["']?([A-Z][A-Z0-9_]*)["']?\s*[:=]\s*(.*?)\s*[,;]?\s*$/,
    );
    if (assignment && sensitiveNamePattern.test(assignment[1])) {
      const value = normalizeAssignedValue(assignment[2]);
      if (isTokenLikeValue(value)) {
        addFinding(
          findings,
          occupiedLines,
          "generic-sensitive-assignment",
          path,
          text,
          offset,
        );
      }
    }
    offset += line.length + 1;
  }
}

function normalizeAssignedValue(rawValue) {
  let value = rawValue.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  } else {
    value = value.replace(/\s+#.*$/, "").trim();
  }
  return value;
}

function isTokenLikeValue(value) {
  if (value.length < 16 || isPlaceholder(value) || isReference(value)) {
    return false;
  }

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(
    (pattern) => pattern.test(value),
  ).length;
  return classes >= 3 || (value.length >= 24 && new Set(value).size >= 10);
}

function isPlaceholder(value) {
  const normalized = value.toLowerCase();
  return (
    value === "" ||
    /^<[^>]+>$/.test(value) ||
    /^(?:placeholder|example|dummy|change[-_ ]?me|redacted|not[-_ ]?set|unset)(?:$|[-_ ])/i.test(
      normalized,
    ) ||
    /^replace[-_ ]?with(?:$|[-_ ])/i.test(normalized) ||
    /^(?:ci|local|test|your)[-_]/.test(normalized)
  );
}

function isReference(value) {
  return (
    /^\$\{\{/.test(value) ||
    /^\$\{?[A-Z][A-Z0-9_]*\}?$/.test(value) ||
    /^(?:process|Deno)\.env/.test(value) ||
    /^(?:secrets|env)\./.test(value)
  );
}

function isSupabaseServiceRoleJwt(value) {
  try {
    const payload = JSON.parse(Buffer.from(value.split(".")[1], "base64url"));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

function hasRealCredential(value) {
  try {
    const parsed = new URL(value);
    return parsed.password.length >= 8 && !isPlaceholder(parsed.password);
  } catch {
    return false;
  }
}

function addFinding(findings, occupiedLines, ruleId, path, text, index = 0) {
  const line = 1 + countNewlines(text, index);
  if (occupiedLines.has(line)) {
    return;
  }
  occupiedLines.add(line);
  findings.push({ line, path, ruleId });
}

function countNewlines(text, end) {
  let count = 0;
  for (let index = 0; index < end; index += 1) {
    if (text.charCodeAt(index) === 10) {
      count += 1;
    }
  }
  return count;
}
