from pathlib import Path

path = Path("scripts/pilot-production-e2e-audit.mjs")
text = path.read_text(encoding="utf-8")

old = '? pass("route response", { status, durationMs: Date.now() - started, url: page.url(), screenshot: ev.screenshot })'
new = '? pass("route response", { httpStatus: status, durationMs: Date.now() - started, url: page.url(), screenshot: ev.screenshot })'

count = text.count(old)
if count != 1:
    raise RuntimeError(f"Expected one route-result match, found {count}")

path.write_text(text.replace(old, new, 1), encoding="utf-8")
