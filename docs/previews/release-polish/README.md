# Staff workflow readability review

Synthetic previews of the actual combined components, without a database connection or customer records.

- [Phone: complete long descriptions and account-name fallbacks](phone.png)
- [Desktop: complete long descriptions and report scope names](desktop.png)
- [Phone: property setup Help](setup-help-phone.png)
- [Phone: long modal title and description](modal-phone.png)

Browser checks passed at 320, 360, 390 and 1440 pixels and at 200% CSS zoom. They measure horizontal overflow and text dimensions, check that raw UUIDs are absent, and verify modal dismissal and Help focus return. Business reference `INV-2026-0002` remains visible. Report tables retain their horizontal scrolling for numeric columns while descriptive cells wrap fully.

The property setup route has dedicated wizard guidance. Missing property, owner and account names use contextual unavailable labels; internal IDs still drive selection and submissions. Archived accounts outside the existing active account-name options display `Account unavailable`.

Local validation: the affected tests passed, lint and TypeScript passed, and the combined production build passed. A full UI run passed 1,338 of 1,339 tests and exposed a pre-existing asynchronous focus assertion; that assertion now awaits the same expected focus and its focused suite passes. Exact-head CI must pass the complete suite before release. The last report scope wrapping adjustment is additionally covered by the final browser checks and report tests.

The local build temporarily used the documented shared dependency root because this checkout reuses a node_modules junction. Its next.config.ts was restored byte-for-byte. CI uses the repository configuration unchanged.

This batch excludes new accounting-policy/RPC work, permission grants, deposits and the separate Maintenance design proposal. No customer financial correction is performed by this code release.
