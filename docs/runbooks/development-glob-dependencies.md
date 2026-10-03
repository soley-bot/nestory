# Development glob dependencies

The dependency audit continues to run unchanged for production and the complete dependency tree. No advisory is ignored.

The original development-only paths to GHSA-vfj7-8cjw-p6xm were:

- `eslint-config-next@16.3.8 -> @next/eslint-plugin-next@16.3.8 -> fast-glob@3.3.1 -> micromatch@4.0.8 -> braces@3.0.3`
- `shadcn@4.19.0 -> fast-glob@3.3.3 -> micromatch@4.0.8 -> braces@3.0.3`
- `shadcn@4.19.0 -> ts-morph@26.0.0 -> @ts-morph/common@0.27.0 -> fast-glob@3.3.3 -> micromatch@4.0.8 -> braces@3.0.3`

The locked shadcn CLI was not used by repository scripts. Its CSS was used by the application. `src/app/vendor/shadcn-tailwind.css` retains the exact `dist/tailwind.css` bytes from the official npm `shadcn@4.19.0` release, with its MIT license alongside. The CSS SHA256 is `bc7d83425702955b4cb67cb14ede9d603f9d912376d57a2d81d661094d2a782a`. Changing the import does not remove the data-state variants or utilities used by the components. This removes the CLI and its code-generation dependency graph from application installs; it does not remove the checked-in UI components.

The pinned Next ESLint plugin and configuration stay at 16.3.8, with all existing rules. Its sole fast-glob call is `globSync(pattern, { onlyDirectories: true })` in `get-root-dirs.js`. The scoped local adapter uses released `tinyglobby@0.2.17`, explicitly disables automatic directory expansion to retain fast-glob's literal-directory semantics, and throws on any unsupported options. It is not a general fast-glob replacement. No unreleased fork or upstream patch is installed.

The adapter also retains directory-only output without trailing slashes and handles absolute Windows paths by matching relative to their filesystem root. A direct local development dependency registers the package for npm's clean-install validation; the version-scoped override redirects only Next's `fast-glob` dependency to it. Neither install scripts nor npm internals are patched.

Dependency upgrades must pass `scripts/next-eslint-glob.node-test.mjs`, including real Next root discovery and actual ESLint diagnostics for configured roots. Review the adapter if Next changes its glob API. Keep the override scoped to the audited plugin version; prefer returning to the supported upstream dependency once its vulnerable chain is removed.

Sources: [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [tinyglobby migration guidance](https://superchupu.dev/tinyglobby/migration), [Next ESLint configuration](https://nextjs.org/docs/app/api-reference/config/eslint).
