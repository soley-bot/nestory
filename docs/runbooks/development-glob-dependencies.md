# Development glob dependencies

The dependency audit runs unchanged for production and the complete tree. No advisory is ignored. This change removes the development-only paths to GHSA-vfj7-8cjw-p6xm through Next's fast-glob dependency and the unused shadcn CLI.

## Preserved application styles and lint rules

The locked shadcn CLI was unused by repository scripts. Its application CSS is retained byte-for-byte from the official npm shadcn@4.19.0 release in `src/app/vendor/shadcn-tailwind.css`, with its MIT license alongside. SHA256: `bc7d83425702955b4cb67cb14ede9d603f9d912376d57a2d81d661094d2a782a`. Checked-in UI components and CSS utilities remain available without the CLI's code-generation dependencies.

The Next ESLint plugin and configuration remain pinned at 16.3.8 with all existing rules. Nestory uses Next's default root, which the plugin returns directly without invoking the directory adapter.

## Explicit directory roots only

The scoped adapter implements only the pinned plugin's sole call: `globSync(path, { onlyDirectories: true })`. It uses Node's filesystem API, with no glob parser or additional dependencies. A configured root may be an existing relative or absolute directory, or Next's supported array of explicit directories:

```js
settings: {
  next: { rootDir: ["apps/web", "apps/admin"] }
}
```

Relative paths are resolved against the process working directory, as in the pinned plugin's existing helper. Directory links retain their configured paths. Files, absent paths and cyclic links return no directory; permission and other I/O errors propagate. The adapter does not recursively search directories.

Empty strings, leading negation (`!`) and any glob tokens (`* ? [ ] { } ( ) |`) throw an explicit error directing the developer to plain paths. This also rejects literal configured directory names containing those tokens. Default roots bypass the adapter. All wildcards, braces, character classes and extglobs are deliberately unsupported, including formerly supported forms. This bounded contract prevents silently changed page discovery; future multi-application configuration must list the intended roots explicitly.

The direct local development dependency and version-scoped override `"fast-glob": "$@nestory/next-eslint-glob"` replace only the fast-glob edge under @next/eslint-plugin-next@16.3.8. Other packages' dependencies are unchanged. npm's clean-install dependency-tree validation remains enabled.

The entry is CommonJS, matching Next's caller without relying on synchronous require(esm). A file-scoped lint style exception permits this necessary import; application lint rules and gates are unchanged.

## Validation and removal

The existing contract tier checks the real installed Next helper, npm dependency-tree validity, CommonJS loading with require(esm) disabled when the runtime supports that flag, explicit/default/array/symlink roots, permission failures, actual Next ESLint diagnostics, and rejection of the earlier glob edge cases. The stylesheet hash and license are also checked.

Any Next upgrade must review this narrow API and pass these contracts. Remove the override when a supported upstream release removes the vulnerable dependency path; do not expand this adapter into a general glob implementation.

Sources: [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [Next ESLint configuration](https://nextjs.org/docs/app/api-reference/config/eslint).