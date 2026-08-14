import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";

const repositoryRoot = resolvePath(fileURLToPath(new URL("../..", import.meta.url)));

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const candidate = resolvePath(repositoryRoot, "src", specifier.slice(2));
    return resolveTypeScript(candidate);
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith("next/")) {
      const candidate = resolvePath(
        repositoryRoot,
        "node_modules",
        `${specifier}.js`,
      );
      if (existsSync(candidate)) {
        return { shortCircuit: true, url: pathToFileURL(candidate).href };
      }
    }
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL
    ) {
      const candidate = resolvePath(
        fileURLToPath(new URL(".", context.parentURL)),
        specifier,
      );
      const resolved = resolveTypeScript(candidate, false);
      if (resolved) return resolved;
    }
    throw error;
  }
}

function resolveTypeScript(candidate, required = true) {
  for (const path of [candidate, `${candidate}.ts`, `${candidate}.tsx`]) {
    if (existsSync(path)) {
      return { shortCircuit: true, url: pathToFileURL(path).href };
    }
  }
  if (required) {
    throw new Error(`Unable to resolve TypeScript alias path ${candidate}.`);
  }
  return null;
}
