# Dependency Audit Exceptions

Run `npm audit --omit=dev` before production releases. The exceptions below are
accepted until compatible upstream fixes are available.

## Next.js bundled PostCSS

- Advisory: GHSA-qx2v-qp2m-jg93
- Package path: `next/node_modules/postcss`
- Severity: moderate
- Current audit result: npm suggests `npm audit fix --force`, which would
  downgrade the app to `next@9.3.3`.
- Reason accepted: the advisory concerns unescaped `</style>` in stringified CSS
  output. This app does not stringify untrusted CSS at runtime; PostCSS runs at
  build time over project-owned stylesheets.
- Review trigger: re-check whenever Next.js is upgraded.

## Prisma Tooling Bundled @hono/node-server

- Advisory: GHSA-92pp-h63x-v22m
- Package path: `prisma -> @prisma/dev -> @hono/node-server`
- Severity: moderate
- Current audit result: npm suggests `npm audit fix --force`, which would
  downgrade Prisma to `6.19.3`.
- Reason accepted: `prisma` is used as project tooling for generate, migrate,
  and studio workflows. The vulnerable advisory is for `serveStatic` repeated
  slash handling in `@hono/node-server`; the production Nest API does not serve
  static files through Prisma tooling or `@hono/node-server`.
- Review trigger: re-check whenever Prisma is upgraded. Remove this exception
  once Prisma bundles `@hono/node-server >= 1.19.13`.
