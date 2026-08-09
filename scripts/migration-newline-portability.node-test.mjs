import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const migrationPath = path.join(
  repositoryRoot,
  "supabase",
  "migrations",
  "20260809100624_harden_finance_manager_daily_controls.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");
const pettyBlockStart = migration.indexOf(
  "-- Petty Cash row creation is a material financial mutation.",
);
const pettyBlockEnd = migration.indexOf(
  "REVOKE ALL ON FUNCTION public.create_petty_cash_entry(",
  pettyBlockStart,
);
const pettyBlock = migration.slice(pettyBlockStart, pettyBlockEnd);

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

  const authorizationAnchor = readDollarConstant(
    pettyBlock,
    "v_authorization_anchor",
    "anchor",
  );
  const authorizationReplacement = readDollarConstant(
    pettyBlock,
    "v_authorization_replacement",
    "replacement",
  );
  const returnAnchor = readDollarConstant(
    pettyBlock,
    "v_return_anchor",
    "anchor",
  );
  const returnReplacement = readDollarConstant(
    pettyBlock,
    "v_return_replacement",
    "replacement",
  );

  for (const anchor of [authorizationAnchor, returnAnchor]) {
    assert.equal(anchor.includes("\\r"), false, "body anchors cannot encode CRLF");
    assert.equal(anchor.includes("\r"), false, "body anchors must be LF-only");
  }

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

function readDollarConstant(source, name, tag) {
  const prefix = `${name} constant text := $${tag}$`;
  const start = source.indexOf(prefix);
  assert.notEqual(start, -1, `${name} must be a dollar-quoted LF-only constant`);
  const valueStart = start + prefix.length;
  const end = source.indexOf(`$${tag}$;`, valueStart);
  assert.notEqual(end, -1, `${name} must close its dollar quote`);
  return source.slice(valueStart, end);
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
