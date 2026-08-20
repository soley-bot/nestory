import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const migrationsDirectory = path.join(repositoryRoot, "supabase", "migrations");
const migration = readMigration(
  "20260809100624_harden_finance_manager_daily_controls.sql",
);
const pettyBlockStart = migration.indexOf(
  "-- Petty Cash row creation is a material financial mutation.",
);
const pettyBlockEnd = migration.indexOf(
  "REVOKE ALL ON FUNCTION public.create_petty_cash_entry(",
  pettyBlockStart,
);
const pettyBlock = migration.slice(pettyBlockStart, pettyBlockEnd);
const crlfMigration = migration.replace(/\r?\n/g, "\r\n");
const crlfPettyBlock = crlfMigration.slice(
  crlfMigration.indexOf("-- Petty Cash row creation is a material financial mutation."),
  crlfMigration.indexOf(
    "REVOKE ALL ON FUNCTION public.create_petty_cash_entry(",
    crlfMigration.indexOf("-- Petty Cash row creation is a material financial mutation."),
  ),
);

test("normalizes LF and CRLF predecessor bodies before exact-one Petty Cash rewrites", () => {
  const normalization =
    "v_definition := replace(v_definition, E'\\r\\n', E'\\n');";
  const definitionRead =
    "SELECT pg_get_functiondef(v_old_function) INTO v_definition;";
  const firstRewrite = "v_anchor_count := (";

  assert.ok(pettyBlock.includes(normalization), "migration must normalize extracted function text");
  assert.ok(
    pettyBlock.indexOf(definitionRead) < pettyBlock.indexOf(normalization) &&
      pettyBlock.indexOf(normalization) < pettyBlock.indexOf(firstRewrite),
    "normalization must happen before every anchor count and rewrite",
  );

  assert.ok(crlfPettyBlock.includes("\r\n"), "fresh autocrlf source must use CRLF");

  const authorizationAnchor = readEscapedConstant(
    pettyBlock,
    "v_authorization_anchor",
  );
  const crlfAuthorizationAnchor = readEscapedConstant(
    crlfPettyBlock,
    "v_authorization_anchor",
  );
  const authorizationReplacement = readNormalizedDollarConstant(
    pettyBlock,
    "v_authorization_replacement",
    "replacement",
  );
  const crlfAuthorizationReplacement = readNormalizedDollarConstant(
    crlfPettyBlock,
    "v_authorization_replacement",
    "replacement",
  );
  const returnAnchor = readEscapedConstant(
    pettyBlock,
    "v_return_anchor",
  );
  const crlfReturnAnchor = readEscapedConstant(
    crlfPettyBlock,
    "v_return_anchor",
  );
  const returnReplacement = readNormalizedDollarConstant(
    pettyBlock,
    "v_return_replacement",
    "replacement",
  );
  const crlfReturnReplacement = readNormalizedDollarConstant(
    crlfPettyBlock,
    "v_return_replacement",
    "replacement",
  );

  for (const anchor of [authorizationAnchor, returnAnchor]) {
    assert.equal(anchor.includes("\\r"), false, "body anchors cannot encode CRLF");
    assert.equal(anchor.includes("\r"), false, "body anchors must be LF-only");
  }
  assert.equal(crlfAuthorizationAnchor, authorizationAnchor);
  assert.equal(crlfReturnAnchor, returnAnchor);
  assert.equal(crlfAuthorizationReplacement, authorizationReplacement);
  assert.equal(crlfReturnReplacement, returnReplacement);

  const lfPredecessor = [
    "CREATE OR REPLACE FUNCTION public.example() RETURNS uuid AS $function$",
    "BEGIN",
    authorizationAnchor,
    "    WHERE id = p_account_id",
    "  ) THEN",
    "    RAISE EXCEPTION 'Petty cash account not found';",
    "  END IF;",
    returnAnchor,
    "$function$ LANGUAGE plpgsql;",
  ].join("\n");
  const crlfPredecessor = lfPredecessor.replaceAll("\n", "\r\n");
  const lfResult = applyBodyRewrites(lfPredecessor, [
    [authorizationAnchor, authorizationReplacement],
    [returnAnchor, returnReplacement],
  ]);
  const crlfResult = applyBodyRewrites(crlfPredecessor, [
    [authorizationAnchor, authorizationReplacement],
    [returnAnchor, returnReplacement],
  ]);

  assert.equal(lfResult.counts.join(","), "1,1");
  assert.equal(crlfResult.counts.join(","), "1,1");
  assert.equal(crlfResult.definition, lfResult.definition);
  assert.ok(
    lfResult.definition.indexOf("claim_financial_idempotency") <
      lfResult.definition.indexOf("FROM public.petty_cash_accounts"),
    "both newline variants must claim replay identity before mutable account checks",
  );
  assert.ok(
    lfResult.definition.indexOf("complete_financial_idempotency") <
      lfResult.definition.lastIndexOf("RETURN new_entry_id;"),
    "both newline variants must complete replay identity before returning",
  );

  assert.throws(
    () =>
      applyBodyRewrites(`${lfPredecessor}\n${authorizationAnchor}`, [
        [authorizationAnchor, authorizationReplacement],
        [returnAnchor, returnReplacement],
      ]),
    /exactly one anchor, found 2/,
  );
});

test("normalizes every dollar-quoted owner-distribution rewrite value before matching", () => {
  const migration = readMigration(
    "20260810073506_project_owner_distribution_reversals.sql",
  );
  const matchIndex = migration.indexOf(
    "IF pg_catalog.strpos(v_definition, v_target) = 0 THEN",
  );

  for (const variable of ["v_definition", "v_target", "v_replacement"]) {
    const normalization = [
      `${variable} := pg_catalog.replace(`,
      `    ${variable},`,
      "    pg_catalog.chr(13) || pg_catalog.chr(10),",
      "    pg_catalog.chr(10)",
      "  );",
    ].join("\n");
    const normalizationIndex = migration.indexOf(normalization);

    assert.ok(
      normalizationIndex >= 0 && normalizationIndex < matchIndex,
      `${variable} must be LF-normalized before the exact rewrite match`,
    );
  }
});

test("normalizes every owner-lifecycle predecessor definition before matching", () => {
  const migration = readMigration(
    "20260810091218_harden_owner_balance_lifecycle_corrections.sql",
  );
  const normalization =
    "v_definition := pg_catalog.replace(v_definition, E'\\r\\n', E'\\n');";

  for (const tag of [
    "patch_owner_source_resolver",
    "patch_owner_allocator",
    "patch_automatic_owner_cash_lock",
  ]) {
    const blockStart = migration.indexOf(`DO $${tag}$`);
    const blockEnd = migration.indexOf(`$${tag}$;`, blockStart);
    const block = migration.slice(blockStart, blockEnd);

    assert.ok(blockStart >= 0 && blockEnd > blockStart, `${tag} block must exist`);
    assert.ok(
      block.indexOf("pg_get_functiondef") < block.indexOf(normalization) &&
        block.indexOf(normalization) < block.indexOf("pg_catalog.strpos"),
      `${tag} must normalize the predecessor before matching`,
    );
  }
});

test("normalizes every global owner-lock predecessor definition before matching", () => {
  const migration = readMigration(
    "20260810103823_enforce_owner_balance_global_lock_order.sql",
  );
  const normalization =
    "v_definition := pg_catalog.replace(v_definition, E'\\r\\n', E'\\n');";

  for (const tag of [
    "patch_owner_allocator_lock_order",
    "patch_owner_cash_baseline_lock_order",
    "patch_owner_distribution_baseline_lock_order",
    "patch_owner_transfer_baseline_lock_order",
    "patch_withdrawal_reversal_baseline_lock_order",
    "patch_payment_reversal_baseline_lock_order",
    "patch_owner_transfer_wrapper_lock_order",
    "patch_automatic_owner_cash_lock_order",
  ]) {
    const blockStart = migration.indexOf(`DO $${tag}$`);
    const blockEnd = migration.indexOf(`$${tag}$;`, blockStart);
    const block = migration.slice(blockStart, blockEnd);

    assert.ok(blockStart >= 0 && blockEnd > blockStart, `${tag} block must exist`);
    assert.ok(
      block.indexOf("pg_get_functiondef") < block.indexOf(normalization) &&
        block.indexOf(normalization) < block.indexOf("pg_catalog.strpos"),
      `${tag} must normalize the predecessor before matching`,
    );
  }
});

test("all branch text-rewrite constants are invariant in fresh autocrlf sources", () => {
  const contracts = [
    {
      file: "20260809075032_delegate_safe_finance_operations.sql",
      start: "DO $delegate_safe_finance_operations$",
      end: "CREATE OR REPLACE FUNCTION app_private.is_checked_current_rent_retry_generation(",
      tagged: ["early_tenant_payment_replay", "early_owner_collection_replay"],
      rewrites: [
        [
          ["balance anchor", "literal", "  SELECT balance.balance_due"],
          ["tenant replay", "tagged", "early_tenant_payment_replay"],
        ],
        [
          ["balance anchor", "literal", "  SELECT balance.balance_due"],
          ["owner replay", "tagged", "early_owner_collection_replay"],
        ],
      ],
    },
    {
      file: "20260809075032_delegate_safe_finance_operations.sql",
      start: "DO $delegate_checked_current_rent_generation$",
      end: "CREATE OR REPLACE FUNCTION app_private.try_generate_current_rent_retry(",
      constants: [
        ["v_original_guard", "original_super_admin_guard"],
        ["v_checked_guard", "checked_current_retry_guard"],
      ],
      rewrites: [
        [
          ["v_original_guard", "normalized", "original_super_admin_guard"],
          ["v_checked_guard", "normalized", "checked_current_retry_guard"],
        ],
      ],
    },
    {
      file: "20260809085306_finance_manager_daily_controls.sql",
      start: "DO $migration$",
      occurrence: 2,
      end: "$migration$;",
      constants: [["v_replacement", "replacement"]],
      rewrites: [
        [
          ["v_anchor", "plain"],
          ["v_replacement", "normalized", "replacement"],
        ],
      ],
    },
    {
      file: "20260809100624_harden_finance_manager_daily_controls.sql",
      start: "-- Finance Manager month lock is an operational write gate",
      end: "-- A resolved current-month exception is a natural-identity replay.",
      constants: [
        ["v_anchor", "anchor"],
        ["v_replacement", "replacement"],
      ],
      rewrites: [
        [
          ["v_anchor", "normalized", "anchor"],
          ["v_replacement", "normalized", "replacement"],
        ],
      ],
    },
    {
      file: "20260809100624_harden_finance_manager_daily_controls.sql",
      start: "-- A resolved current-month exception is a natural-identity replay.",
      end: "-- Petty Cash row creation is a material financial mutation.",
      constants: [
        ["v_anchor", "anchor"],
        ["v_replacement", "replacement"],
      ],
      rewrites: [
        [
          ["v_anchor", "normalized", "anchor"],
          ["v_replacement", "normalized", "replacement"],
        ],
      ],
    },
    {
      file: "20260809100624_harden_finance_manager_daily_controls.sql",
      start: "-- Petty Cash row creation is a material financial mutation.",
      end: "REVOKE ALL ON FUNCTION public.create_petty_cash_entry(",
      constants: [
        ["v_signature_anchor", "anchor"],
        ["v_signature_replacement", "replacement"],
        ["v_declare_anchor", "anchor"],
        ["v_declare_replacement", "replacement"],
        ["v_authorization_replacement", "replacement"],
        ["v_return_replacement", "replacement"],
      ],
      rewrites: [
        [
          ["v_signature_anchor", "normalized", "anchor"],
          ["v_signature_replacement", "normalized", "replacement"],
        ],
        [
          ["v_declare_anchor", "normalized", "anchor"],
          ["v_declare_replacement", "normalized", "replacement"],
        ],
        [
          ["v_authorization_anchor", "escaped"],
          ["v_authorization_replacement", "normalized", "replacement"],
        ],
        [
          ["v_return_anchor", "escaped"],
          ["v_return_replacement", "normalized", "replacement"],
        ],
      ],
    },
  ];

  for (const contract of contracts) {
    const lfSource = readMigration(contract.file);
    const crlfSource = lfSource.replace(/\r?\n/g, "\r\n");
    const lfBlock = sliceBlock(lfSource, contract);
    const crlfBlock = sliceBlock(crlfSource, contract);

    assert.ok(crlfBlock.includes("\r\n"), `${contract.file} fixture must be CRLF`);
    for (const [name, tag] of contract.constants ?? []) {
      const lfValue = readNormalizedDollarConstant(lfBlock, name, tag);
      const crlfValue = readNormalizedDollarConstant(crlfBlock, name, tag);
      assert.equal(
        crlfValue,
        lfValue,
        `${contract.file} ${name} must have identical LF and CRLF semantics`,
      );
      assert.equal(lfValue.includes("\r"), false, `${name} must evaluate to LF-only text`);
    }
    for (const tag of contract.tagged ?? []) {
      const lfValue = readNormalizedTaggedLiteral(lfBlock, tag);
      const crlfValue = readNormalizedTaggedLiteral(crlfBlock, tag);
      assert.equal(crlfValue, lfValue, `${tag} must have identical LF and CRLF semantics`);
      assert.equal(lfValue.includes("\r"), false, `${tag} must evaluate to LF-only text`);
    }

    for (const [anchorContract, replacementContract] of contract.rewrites) {
      const anchor = readContractConstant(lfBlock, anchorContract);
      const crlfAnchor = readContractConstant(crlfBlock, anchorContract);
      const replacement = readContractConstant(lfBlock, replacementContract);
      const crlfReplacement = readContractConstant(crlfBlock, replacementContract);
      assert.equal(crlfAnchor, anchor);
      assert.equal(crlfReplacement, replacement);

      const predecessor = `CREATE FUNCTION example()\n${anchor}\nEND;`;
      const lfResult = applyBodyRewrites(predecessor, [[anchor, replacement]]);
      const crlfResult = applyBodyRewrites(
        predecessor.replaceAll("\n", "\r\n"),
        [[anchor, replacement]],
      );
      assert.deepEqual(lfResult.counts, [1]);
      assert.deepEqual(crlfResult.counts, [1]);
      assert.equal(crlfResult.definition, lfResult.definition);
      assert.throws(
        () => applyBodyRewrites(`${predecessor}\n${anchor}`, [[anchor, replacement]]),
        /exactly one anchor, found 2/,
      );
    }
  }
});

test("owner opening roster prelock rewrites are exact-one and LF/CRLF invariant", () => {
  const file = "20260809211719_owner_opening_roster_input_prelocks.sql";
  const lfSource = readMigration(file).replaceAll("\r\n", "\n");
  const crlfSource = lfSource.replaceAll("\n", "\r\n");
  const marker = "-- Preserve replay-first and the established property-month lock order";
  const lfBlock = lfSource.slice(lfSource.indexOf(marker));
  const crlfBlock = crlfSource.slice(crlfSource.indexOf(marker));

  assert.match(
    lfBlock,
    /v_definition := pg_catalog\.replace\(v_definition, E'\\r\\n', E'\\n'\);/,
  );
  assert.match(
    lfBlock,
    /v_old_lock := pg_catalog\.replace\(v_old_lock, E'\\r\\n', E'\\n'\);/,
  );
  assert.match(
    lfBlock,
    /v_new_lock := pg_catalog\.replace\(v_new_lock, E'\\r\\n', E'\\n'\);/,
  );
  assert.ok(
    lfBlock.indexOf("v_definition := pg_catalog.replace") <
      lfBlock.indexOf("v_actual_count := ("),
    "definition and source constants must normalize before exact-one counting",
  );

  const lfOldLocks = readAllTaggedConstants(lfBlock, "old");
  const lfNewLocks = readAllTaggedConstants(lfBlock, "new");
  const crlfOldLocks = readAllTaggedConstants(crlfBlock, "old");
  const crlfNewLocks = readAllTaggedConstants(crlfBlock, "new");
  assert.equal(lfOldLocks.length, 3);
  assert.equal(lfNewLocks.length, 3);
  assert.deepEqual(crlfOldLocks, lfOldLocks);
  assert.deepEqual(crlfNewLocks, lfNewLocks);

  for (let index = 0; index < lfOldLocks.length; index += 1) {
    const anchor = lfOldLocks[index];
    const replacement = lfNewLocks[index];
    const predecessor = [
      "CREATE OR REPLACE FUNCTION public.example() RETURNS void AS $function$",
      "BEGIN",
      anchor,
      "END;",
      "$function$ LANGUAGE plpgsql;",
    ].join("\n");
    const lfResult = applyBodyRewrites(predecessor, [[anchor, replacement]]);
    const crlfResult = applyBodyRewrites(
      predecessor.replaceAll("\n", "\r\n"),
      [[anchor, replacement]],
    );
    assert.deepEqual(lfResult.counts, [1]);
    assert.deepEqual(crlfResult.counts, [1]);
    assert.equal(crlfResult.definition, lfResult.definition);
    assert.throws(
      () => applyBodyRewrites(`${predecessor}\n${anchor}`, [[anchor, replacement]]),
      /exactly one anchor, found 2/,
    );
  }
});

test("owner import preserve-path rewrite is token-scoped and newline invariant", () => {
  const ownerMigration = readMigration(
    "20260809122054_owner_opening_ownership_readiness.sql",
  );
  const marker = "-- Preserve existing ownership during property import without a public compatibility overload.";
  const start = ownerMigration.indexOf(marker);
  assert.notEqual(start, -1, "owner migration must carry the import rewrite contract");
  const block = ownerMigration.slice(start);
  const oldToken = "public.update_property(";
  const newToken = "app_private.update_property_preserving_ownership_for_import(";
  assert.match(block, /replace\(v_definition, v_old_token, v_new_token\)/);

  const predecessor = [
    "CREATE FUNCTION public.commit_generic_import_run_internal()",
    "BEGIN",
    "  PERFORM public.update_property(",
    "    p_property_id",
    "  );",
    "END;",
  ].join("\n");
  for (const source of [predecessor, predecessor.replaceAll("\n", "\r\n")]) {
    const normalized = source.replaceAll("\r\n", "\n");
    assert.equal(normalized.split(oldToken).length - 1, 1);
    const rewritten = normalized.replace(oldToken, newToken);
    assert.equal(rewritten.includes(oldToken), false);
    assert.equal(rewritten.split(newToken).length - 1, 1);
  }
});

test("Lease scope hardening rewrites are LF and CRLF invariant", () => {
  const file =
    "20260820114448_harden_lease_scope_recovery_and_archive_serialization.sql";
  const lfSource = readMigration(file).replaceAll("\r\n", "\n");
  const crlfSource = lfSource.replaceAll("\n", "\r\n");
  const definitionNormalization =
    "v_definition := pg_catalog.replace(v_definition, E'\\r\\n', E'\\n');";

  for (const source of [lfSource, crlfSource]) {
    const blocks = source.split("DO $$").slice(1);
    assert.equal(blocks.length, 4, "migration must retain four exact rewrites");
    for (const block of blocks) {
      const definitionRead = block.indexOf("pg_get_functiondef(");
      const normalization = block.indexOf(definitionNormalization);
      const match = block.indexOf("strpos(v_definition,");
      assert.ok(
        definitionRead >= 0 &&
          definitionRead < normalization &&
          normalization < match,
        "each predecessor definition must be normalized before matching",
      );
    }
  }

  const lfConstants = readNormalizedRewriteConstants(lfSource);
  const crlfConstants = readNormalizedRewriteConstants(crlfSource);
  assert.equal(lfConstants.length, 10, "all ten rewrite constants must normalize");
  assert.deepEqual(crlfConstants, lfConstants);
});

function readMigration(file) {
  return fs.readFileSync(path.join(migrationsDirectory, file), "utf8");
}

function sliceBlock(source, contract) {
  let start = -1;
  let cursor = 0;
  for (let found = 0; found < (contract.occurrence ?? 1); found += 1) {
    start = source.indexOf(contract.start, cursor);
    assert.notEqual(start, -1, `${contract.file} must contain ${contract.start}`);
    cursor = start + contract.start.length;
  }
  const end = source.indexOf(contract.end, cursor);
  assert.notEqual(end, -1, `${contract.file} must contain ${contract.end}`);
  return source.slice(start, end);
}

function readNormalizedDollarConstant(source, name, tag) {
  const prefixes = [
    `${name} text := replace($${tag}$`,
    `${name} text := pg_catalog.replace($${tag}$`,
  ];
  const prefix = prefixes.find((candidate) => source.includes(candidate));
  assert.ok(
    prefix,
    `${name} must normalize its dollar-quoted source text before use`,
  );
  const start = source.indexOf(prefix);
  const valueStart = start + prefix.length;
  const end = source.indexOf(`$${tag}$`, valueStart);
  assert.notEqual(end, -1, `${name} must close its dollar quote`);
  const suffix = source.slice(end + tag.length + 2, end + tag.length + 45);
  assert.match(
    suffix,
    /^, E'\\r\\n', E'\\n'\);/,
    `${name} must normalize CRLF to LF at declaration`,
  );
  return source.slice(valueStart, end).replaceAll("\r\n", "\n");
}

function readContractConstant(source, [name, kind, tag]) {
  if (kind === "normalized") {
    return readNormalizedDollarConstant(source, name, tag);
  }
  if (kind === "escaped") {
    return readEscapedConstant(source, name);
  }
  if (kind === "plain") {
    return readPlainConstant(source, name);
  }
  if (kind === "tagged") {
    return readNormalizedTaggedLiteral(source, tag);
  }
  if (kind === "literal") {
    return tag;
  }
  assert.fail(`Unknown constant reader ${kind}`);
}

function readNormalizedTaggedLiteral(source, tag) {
  const prefix = `pg_catalog.replace($${tag}$`;
  const start = source.indexOf(prefix);
  assert.notEqual(start, -1, `${tag} must normalize its dollar-quoted source text before use`);
  const valueStart = start + prefix.length;
  const end = source.indexOf(`$${tag}$`, valueStart);
  assert.notEqual(end, -1, `${tag} must close its dollar quote`);
  const suffix = source.slice(end + tag.length + 2, end + tag.length + 45);
  assert.match(
    suffix,
    /^, E'\\r\\n', E'\\n'\)/,
    `${tag} must normalize CRLF to LF at use`,
  );
  return source.slice(valueStart, end).replaceAll("\r\n", "\n");
}

function readAllTaggedConstants(source, tag) {
  const opening = `$${tag}$`;
  const values = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(opening, cursor);
    if (start === -1) break;
    const valueStart = start + opening.length;
    const end = source.indexOf(opening, valueStart);
    assert.notEqual(end, -1, `${tag} must close every dollar quote`);
    values.push(source.slice(valueStart, end).replaceAll("\r\n", "\n"));
    cursor = end + opening.length;
  }
  return values;
}

function readNormalizedRewriteConstants(source) {
  const pattern =
    /\w+ constant text := pg_catalog\.replace\(\$(\w+)\$([\s\S]*?)\$\1\$, E'\\r\\n', E'\\n'\);/g;
  return [...source.matchAll(pattern)].map((match) =>
    match[2].replaceAll("\r\n", "\n"),
  );
}

function readPlainConstant(source, name) {
  const prefix = `${name} constant text := '`;
  const start = source.indexOf(prefix);
  assert.notEqual(start, -1, `${name} must be a plain constant`);
  const valueStart = start + prefix.length;
  const end = source.indexOf("';", valueStart);
  assert.notEqual(end, -1, `${name} must close its plain literal`);
  return source.slice(valueStart, end).replaceAll("''", "'");
}

function readEscapedConstant(source, name) {
  const prefix = `${name} constant text := E'`;
  const start = source.indexOf(prefix);
  assert.notEqual(
    start,
    -1,
    `${name} must use a source-line-ending-independent E literal`,
  );
  const valueStart = start + prefix.length;
  let encoded = "";
  for (let index = valueStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "'" && source[index + 1] === "'") {
      encoded += "'";
      index += 1;
      continue;
    }
    if (character === "'" && source[index - 1] !== "\\") {
      return encoded
        .replaceAll("\\n", "\n")
        .replaceAll("\\r", "\r")
        .replaceAll("\\\\", "\\");
    }
    encoded += character;
  }
  assert.fail(`${name} must close its E literal`);
}

function applyBodyRewrites(definition, rewrites) {
  let normalized = definition.replaceAll("\r\n", "\n");
  const counts = [];
  for (const [anchor, replacement] of rewrites) {
    const count = normalized.split(anchor).length - 1;
    counts.push(count);
    if (count !== 1) {
      throw new Error(`Expected exactly one anchor, found ${count}`);
    }
    normalized = normalized.replace(anchor, replacement);
  }
  return { counts, definition: normalized };
}
