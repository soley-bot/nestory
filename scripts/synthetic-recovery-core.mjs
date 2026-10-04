import { randomUUID } from "node:crypto";

export const MIN_FREE_BYTES = 8 * 1024 ** 3;
export const SYNTHETIC_IMAGE = "postgres:16-bookworm";

const setupSql = `
CREATE TABLE accounts (id integer PRIMARY KEY, balance numeric(12,2) NOT NULL CHECK (balance >= 0));
CREATE TABLE entries (id integer PRIMARY KEY, account_id integer NOT NULL REFERENCES accounts(id), amount numeric(12,2) NOT NULL);
INSERT INTO accounts VALUES (1,250.00),(2,175.25);
INSERT INTO entries VALUES (1,1,250.00),(2,2,175.25);
CREATE INDEX entries_account_idx ON entries(account_id);
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY synthetic_read ON accounts FOR SELECT USING (id=1);
`;

const verifySql = `
DO $$ BEGIN
IF (SELECT count(*) FROM accounts) <> 2 OR (SELECT sum(balance) FROM accounts) <> 425.25 THEN RAISE EXCEPTION 'synthetic accounts mismatch'; END IF;
IF (SELECT count(*) FROM entries) <> 2 OR (SELECT sum(amount) FROM entries) <> 425.25 THEN RAISE EXCEPTION 'synthetic entries mismatch'; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='entries_account_idx') THEN RAISE EXCEPTION 'synthetic index missing'; END IF;
IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='accounts'::regclass) OR (SELECT count(*) FROM pg_policy WHERE polrelid='accounts'::regclass)<>1 THEN RAISE EXCEPTION 'synthetic RLS metadata missing'; END IF;
BEGIN INSERT INTO entries VALUES (3,999,1); RAISE EXCEPTION 'synthetic FK missing'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
BEGIN INSERT INTO accounts VALUES (3,-1); RAISE EXCEPTION 'synthetic check missing'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT 'synthetic_restore_verified';
`;

export async function rehearseSyntheticRecovery({ docker, dockerEndpoint = "mock-local", freeBytes, pause, now = () => performance.now(), readFreeBytes = async () => freeBytes }) {
  if (!Number.isFinite(freeBytes) || freeBytes < MIN_FREE_BYTES) {
    throw new Error("Recovery rehearsal stopped: at least 8 GiB free is required.");
  }
  const name = `nestory-synthetic-recovery-${randomUUID()}`;
  const started = now();
  const deadline = started + 60_000;
  let phase = "image_inspection";
  const checkSpace = async () => {
    const timeLeft = deadline - now();
    if (timeLeft <= 0) throw new Error("Synthetic recovery exceeded its work/readiness deadline.");
    const free = await readFreeBytes({ timeoutMs: Math.max(1, Math.floor(Math.min(15_000, timeLeft))) });
    if (!Number.isFinite(free) || free < MIN_FREE_BYTES) throw new Error("Recovery rehearsal stopped: free space fell below 8 GiB.");
  };
  const command = async (args, input, commandDeadline = deadline) => {
    const remaining = commandDeadline - now();
    if (remaining <= 0) throw new Error("Synthetic recovery exceeded its work/readiness deadline.");
    return docker(args, input, { timeoutMs: Math.max(1, Math.floor(Math.min(15_000, remaining))) });
  };
  let created = false;
  let evidence;
  let workError;
  let cleanupError;
  let cleanupPhase = "not_needed";
  try {
    const image = JSON.parse(await command(["image", "inspect", SYNTHETIC_IMAGE, "--format", '{"id":{{json .Id}},"digests":{{json .RepoDigests}}}']));
    if (!/^sha256:[a-f0-9]{64}$/.test(image?.id) || !Array.isArray(image.digests) || !image.digests.length ||
      image.digests.some(digest => !/^postgres@sha256:[a-f0-9]{64}$/.test(digest))) throw new Error("Cached synthetic image identity is invalid.");
    await checkSpace();
    phase = "container_creation";
    created = true;
    await command(["run", "--detach", "--rm", "--pull", "never", "--name", name,
      "--network", "none", "--memory", "512m", "--cpus", "1", "--pids-limit", "128",
      "--tmpfs", "/var/lib/postgresql/data:size=268435456", "--tmpfs", "/tmp:size=16777216",
      "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "--label", "codex.rehearsal=synthetic-only", image.id]);
    phase = "isolation_verification";
    const isolation = JSON.parse(await command(["inspect", name, "--format",
      '{"network":{{json .HostConfig.NetworkMode}},"ports":{{json .HostConfig.PortBindings}},"mounts":{{json .Mounts}},"tmpfs":{{json .HostConfig.Tmpfs}}}']));
    if (isolation.network !== "none" || Object.keys(isolation.ports ?? {}).length || isolation.mounts.length ||
      !isolation.tmpfs["/var/lib/postgresql/data"] || !isolation.tmpfs["/tmp"]) {
      throw new Error("Synthetic container isolation verification failed.");
    }
    phase = "final_server_readiness";
    const readinessDeadline = Math.min(deadline, now() + 30_000);
    let ready = false;
    while (now() < readinessDeadline) {
      try {
        await command(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-t", "1"], undefined, readinessDeadline);
        if (now() >= readinessDeadline) throw new Error("Final server readiness deadline expired.");
        ready = true;
        break;
      } catch {
        const remaining = readinessDeadline - now();
        if (remaining <= 0) break;
        await pause(Math.min(250, remaining));
      }
    }
    if (!ready) throw new Error("Final synthetic PostgreSQL TCP readiness timed out.");
    phase = "fixture_setup";
    const psql = async (database, sql) => command(["exec", "-i", name, "psql", "-h", "127.0.0.1", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At"], sql);
    await psql("postgres", "CREATE DATABASE synthetic_source; CREATE DATABASE synthetic_restore;");
    await psql("synthetic_source", setupSql);
    await checkSpace();
    const recoveryStart = now();
    phase = "database_dump_restore";
    await command(["exec", name, "pg_dump", "-U", "postgres", "-d", "synthetic_source", "--format=custom", "--file=/tmp/synthetic.dump"]);
    await command(["exec", name, "pg_restore", "-U", "postgres", "-d", "synthetic_restore", "--exit-on-error", "/tmp/synthetic.dump"]);
    phase = "database_validation";
    const verified = await psql("synthetic_restore", verifySql);
    if (!verified.split(/\r?\n/).includes("synthetic_restore_verified")) throw new Error("Synthetic restore validation marker missing.");
    const recoveryMs = now() - recoveryStart;
    const artifact = await command(["exec", name, "bash", "-c", "set -e; sha256sum /tmp/synthetic.dump; stat -c %s /tmp/synthetic.dump"]);
    const artifactLines = artifact.trim().split(/\r?\n/);
    const dumpHash = artifactLines[0].split(/\s+/)[0];
    const dumpBytes = Number(artifactLines[1]);
    if (!/^[a-f0-9]{64}$/.test(dumpHash) || !Number.isSafeInteger(dumpBytes) || dumpBytes <= 0) throw new Error("Synthetic dump evidence invalid.");
    await checkSpace();
    phase = "file_validation";
    const files = await command(["exec", name, "bash", "-c",
      "set -e; mkdir /tmp/source-files /tmp/restored-files; printf 'Synthetic bytes only.\\n' > /tmp/source-files/document.txt; tar -cf /tmp/files.tar -C /tmp/source-files document.txt; tar -xf /tmp/files.tar -C /tmp/restored-files; cmp /tmp/source-files/document.txt /tmp/restored-files/document.txt; sha256sum /tmp/source-files/document.txt /tmp/restored-files/document.txt"]);
    const fileHashes = files.trim().split(/\r?\n/).map(line => line.split(/\s+/)[0]);
    if (fileHashes.length !== 2 || !/^[a-f0-9]{64}$/.test(fileHashes[0]) || fileHashes[0] !== fileHashes[1]) throw new Error("Synthetic file restore evidence invalid.");
    evidence = { syntheticOnly: true, productionRestoreProven: false, image, dockerEndpoint, containerName: name, freeBytesBefore: freeBytes,
      databaseVerified: true, fileBytesVerified: true, effectiveAuthVerified: false,
      recoveryMs, dumpHash, dumpBytes, fileHash: fileHashes[0] };
  } catch (error) {
    workError = { phase, message: error.message };
  } finally {
    if (created) {
      const cleanupDeadline = now() + 30_000;
      const cleanup = (args) => command(args, undefined, cleanupDeadline);
      try {
        cleanupPhase = "list";
        const existing = (await cleanup(["ps", "--all", "--filter", `name=^/${name}$`, "--format", "{{.Names}}"])).trim();
        if (existing && existing !== name) throw new Error(`Refusing cleanup: synthetic container name mismatch for ${name}.`);
        if (existing === name) {
          cleanupPhase = "label_inspection";
          const label = (await cleanup(["inspect", name, "--format", '{{index .Config.Labels "codex.rehearsal"}}'])).trim();
          if (label !== "synthetic-only") throw new Error(`Refusing cleanup: synthetic container label mismatch for ${name}.`);
          cleanupPhase = "remove";
          await cleanup(["rm", "--force", name]);
        }
        cleanupPhase = "complete";
      } catch (error) {
        cleanupError = { phase: cleanupPhase, message: error.message };
      }
    }
  }
  if (workError || cleanupError) {
    const error = new Error([workError?.message, cleanupError?.message].filter(Boolean).join("; "));
    error.diagnostics = { containerName: name, dockerEndpoint, workError: workError ?? null,
      cleanupError: cleanupError ?? null, cleanupPhase, removed: created ? !cleanupError : null };
    throw error;
  }
  return { ...evidence, removed: true, elapsedMs: now() - started };
}
