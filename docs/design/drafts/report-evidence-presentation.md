# Standalone report evidence presentation

This draft adds an optional `preserveRowDetails` flag to the existing generic
PDF/Excel renderers. It uses an already-built `TrustedReport`; it does not derive
accounting facts, recalculate totals, authorize sources or certify completeness.

Long text uses continuation rows without repeating numeric amounts. Excel keeps
Unicode code points intact and anchors header styles, filters and frozen panes
after expanded context. PDF repeats short identities and chunks long identity
cells so they fit within the printable body. Existing callers do not opt in.

The Cash presentation patches were prepared over an unreleased owner-report
model. Their adapter cannot stand alone on current main. The adapter, accounting
model, their accounting acceptance tests and the separate Accrual PDF subtotal
change remain held and are excluded from this final integration. The generic
export tests use literal synthetic `TrustedReport` fixtures without that model.

There are no live Cash routes, source readers, permission changes, deposit
commands, SQL or migrations here. Existing Accrual subtotal behavior and published
owner-statement renderers are unchanged. Future Cash activation and its source,
accounting-policy and database acceptance gates remain separate work.
