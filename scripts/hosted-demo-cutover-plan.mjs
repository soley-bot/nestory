import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildCutoverManifest } from "./hosted-demo-cutover-plan-core.mjs";

function parseArgs(args) {
  const result = {
    inventoryPath: null,
    outputPath: null,
    referenceDate: null,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      result.help = true;
      continue;
    }
    if (argument === "--execute") {
      throw new Error(
        "--execute is intentionally unsupported; this tool only creates a planning manifest.",
      );
    }

    const value = args[index + 1];
    if (["--inventory", "--output", "--reference-date"].includes(argument)) {
      if (!value) {
        throw new Error(`${argument} requires a value.`);
      }
      if (argument === "--inventory") result.inventoryPath = value;
      if (argument === "--output") result.outputPath = value;
      if (argument === "--reference-date") result.referenceDate = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(
      [
        "Usage: npm run demo:cutover:plan -- --inventory PATH --reference-date YYYY-MM-DD [--output PATH]",
        "",
        "Validates a read-only hosted inventory and emits a fail-closed planning",
        "manifest. This command cannot execute a hosted cutover.",
        "",
      ].join("\n"),
    );
    return;
  }

  if (!options.inventoryPath || !options.referenceDate) {
    throw new Error("--inventory and --reference-date are required.");
  }

  const inventoryPath = path.resolve(options.inventoryPath);
  const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
  const manifest = buildCutoverManifest(inventory, options.referenceDate);
  const output = `${JSON.stringify(manifest, null, 2)}\n`;

  if (options.outputPath) {
    await writeFile(path.resolve(options.outputPath), output, {
      encoding: "utf8",
      flag: "wx",
    });
    return;
  }

  process.stdout.write(output);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
