# Security notes

## npm audit findings

### GHSA-qx2v-qp2m-jg93 — PostCSS XSS via unescaped `</style>` (moderate)

**Affected package:** `postcss <8.5.10`, bundled internally by `next` as `node_modules/next/node_modules/postcss@8.4.31`

**Status:** Accepted — not exploitable in this project.

PostCSS is a build-time CSS transform tool. It runs during `next build` and is not present or invoked at runtime. No user-controlled input reaches PostCSS in production, so the XSS vector (injecting `</style>` into stringified CSS output) has no path to the browser.

`npm audit fix --force` would downgrade Next.js to 9.3.3, which is not a safe remediation. An `overrides` entry could force the patched version into Next's dependency tree, but given the finding is not exploitable, the added risk of overriding an internal dependency is not justified.

**Recheck when:** Next.js ships a release that upgrades its bundled `postcss` to `>=8.5.10`, at which point the finding will resolve naturally.

## Nominatim geocoding — OSMF policy compliance

The geocoder uses the [Nominatim public API](https://nominatim.openstreetmap.org) as a fallback when swisstopo returns no usable result. Usage complies with the [OSMF Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/):

- **User-Agent** is set to `wogibteskurse/1.0 (https://github.com/mathiasaebersold/wogibteskurse)` on every request.
- **Rate limit** is enforced at ≥ 1 100 ms between requests (policy requires ≤ 1 req/sec). Each concurrent caller reserves its slot synchronously before awaiting, so parallel calls are queued rather than coalesced.
- **Server-side caching** in SQLite means each venue is geocoded at most once; repeated map loads never re-hit Nominatim.
- **No bulk geocoding** — venues are resolved lazily and individually as they appear in API results.
- **Attribution** is disclosed in the legal/privacy notice at `/legal`.

The Nominatim fallback can be disabled entirely without a code change by setting `NOMINATIM_DISABLED=true` in the environment.
