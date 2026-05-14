# Security notes

## npm audit findings

### GHSA-qx2v-qp2m-jg93 — PostCSS XSS via unescaped `</style>` (moderate)

**Affected package:** `postcss <8.5.10`, bundled internally by `next` as `node_modules/next/node_modules/postcss@8.4.31`

**Status:** Accepted — not exploitable in this project.

PostCSS is a build-time CSS transform tool. It runs during `next build` and is not present or invoked at runtime. No user-controlled input reaches PostCSS in production, so the XSS vector (injecting `</style>` into stringified CSS output) has no path to the browser.

`npm audit fix --force` would downgrade Next.js to 9.3.3, which is not a safe remediation. An `overrides` entry could force the patched version into Next's dependency tree, but given the finding is not exploitable, the added risk of overriding an internal dependency is not justified.

**Recheck when:** Next.js ships a release that upgrades its bundled `postcss` to `>=8.5.10`, at which point the finding will resolve naturally.
