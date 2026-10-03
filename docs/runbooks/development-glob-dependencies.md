# Development glob dependencies

The dependency audit continues to run unchanged for production and the complete dependency tree. No advisory is ignored.

The original development-only paths to GHSA-vfj7-8cjw-p6xm were:

- `eslint-config-next@16.3.8 -> @next/eslint-plugin-next@16.3.8 -> fast-glob@3.3.1 -> micromatch@4.0.8 -> braces@3.0.3`
- `shadcn@4.19.0 -> fast-glob@3.3.3 -> micromatch@4.0.8 -> braces@3.0.3`
- `shadcn@4.19.0 -> ts-morph@26.0.0 -> @ts-morph/common@0.27.0 -> fast-glob@3.3.3 -> micromatch@4.0.8 -> braces@3.0.3`

The locked shadcn CLI was not used by repository scripts. Its CSS was used by the application. `src/app/vendor/shadcn-tailwind.css` retains the exact `dist/tailwind.css` bytes from the official npm `shadcn@4.19.0` release, with its MIT license alongside. The CSS SHA256 is `bc7d83425702955b4cb67cb14ede9d603f9d912376d57a2d81d661094d2a782a`. Changing the import does not remove the data-state variants or utilities used by the components. This removes the CLI and its code-generation dependency graph from application installs; it does not remove the checked-in UI components.

The pinned Next ESLint plugin and configuration stay at 16.3.8, with all existing rules. Its sole fast-glob call is `globSync(pattern, { onlyDirectories: true })` in `get-root-dirs.js`. The scoped local adapter uses released `tinyglobby@0.2.17`, explicitly disables automatic directory expansion to retain fast-glob's literal-directory semantics, and throws on any unsupported options. It is not a general fast-glob replacement. No unreleased fork or upstream patch is installed.

The adapter also retains directory-only output without trailing slashes and handles absolute Windows paths by matching relative to their filesystem root. A direct local development dependency registers the package for npm's clean-install validation; the version-scoped override references that dependency's spec with `$@nestory/next-eslint-glob` and redirects only Next's `fast-glob` dependency. The contract suite requires `npm ls fast-glob --all` to validate the installed edge after clean CI installation. Neither install scripts nor npm internals are patched.

The entry point is CommonJS, matching Next's caller and tinyglobby's provided CommonJS export without relying on newer Node `require(esm)` support. Its one file-scoped TypeScript style-rule exception permits the required CommonJS imports; application lint rules and gates remain unchanged. A child-process contract loads the real Next helper with `--no-experimental-require-module` and performs root discovery.

Custom `settings.next.rootDir` brace ranges (for example `apps/app{01..05}` or `packages/pkg{2..10..2}`) fail with an explicit error because picomatch does not retain fast-glob's padded/stepped expansion semantics. Use an array of explicit roots or a wildcard instead. Comma alternatives such as `apps/{web,admin}` remain supported. The repository currently uses Next's default root. Rejecting unsupported syntax keeps lint from silently overlooking a project's pages.

Empty-alternative validation applies only inside complete brace groups, respecting character classes. Consecutive commas in literal paths such as `apps/foo,,bar` remain supported. Unmatched opening braces are rejected because accepting them can add literal roots omitted by the pinned fast-glob version.

Empty brace alternatives (`apps/{,web}`) and globstar segments (`apps/**`, including brace alternatives such as `apps/{**,web}`) also fail explicitly: their directory matching differs between the parsers. Use explicit roots or a single-level wildcard such as `apps/*`. Ordinary adjacent stars within a segment (`apps/app**` or `apps/foo**bar`) remain supported. Directory symlinks remain roots, including when selected by a wildcard; the adapter checks matched entry targets rather than relying on tinyglobby's directory-only classification. Missing, non-directory and cyclic link targets are omitted, while permission and other filesystem errors stop lint. A cyclic sibling cannot prevent discovery of a valid root.

Patterns containing a parent-directory traversal segment (`..`), such as `../*` or `../../a*`, are rejected. Tinyglobby can otherwise omit a matching directory containing the working directory. Configure absolute roots instead. Relative roots within the working directory, such as `apps/web`, remain supported.

Bare parentheses such as `apps/(web)` are rejected because tinyglobby treats them as grouping and can add roots that fast-glob excluded. List ungrouped roots explicitly. Supported extglobs such as `apps/@(admin|web)` remain covered by directory-discovery contracts; nesting a bare group inside one is rejected.

Patterns that implicitly match the search root itself, such as relative `!(admin)` or `{!(admin),web}`, are rejected because tinyglobby can add a zero-segment match that fast-glob excluded. Explicit `.` and `./.` roots remain supported. To include the current directory alongside another root, use an array such as `[".", "web"]` instead of `{.,web}`.

Question-mark wildcards before a path separator (`apps/app?/web` or `apps/app?/`) are rejected because the pinned fast-glob version can omit roots that tinyglobby discovers. List those roots explicitly or use a star wildcard. Question marks in the final segment (`apps/app?`) and optional extglobs (`apps/?(web)/pages`) remain supported.

Extglobs following a dynamic parent segment (`apps/*/?(pages)`, `apps/{web,admin}/?(pages)` or similar compositions) are outside the adapter's supported grammar and fail explicitly. Their zero-segment behavior can otherwise omit application roots. List roots explicitly when combining these selections. Globstar tokens wrapped in extglobs (`apps/@(**)` or `apps/{@(**),web}`) are also rejected because their recursive matching differs. Ordinary repeated stars within a segment and simple extglobs under literal parents remain supported.

Slash-spanning extglob groups (`apps/@(web/pages|admin/pages)`) are rejected because they can add roots excluded by the pinned fast-glob implementation. Repeated-star segments after dynamic parents (`apps/*/***`) are rejected because they can omit the matched parent roots. The supported static-parent single-level form `apps/***` remains covered.

Malformed character classes that span a path separator (`apps/[abc/*` or `apps/[abc/def]/*`) and unmatched extglob groups (`apps/@(web`) are rejected because tinyglobby can interpret them as literal paths and add roots. The compatible final literal bracket form (`apps/[abc`) and valid POSIX classes remain supported and tested.

Dependency upgrades must pass `scripts/next-eslint-glob.node-test.mjs`, including real Next root discovery and actual ESLint diagnostics for configured roots. Review the adapter if Next changes its glob API. Keep the override scoped to the audited plugin version; prefer returning to the supported upstream dependency once its vulnerable chain is removed.

Sources: [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [tinyglobby migration guidance](https://superchupu.dev/tinyglobby/migration), [Next ESLint configuration](https://nextjs.org/docs/app/api-reference/config/eslint).
