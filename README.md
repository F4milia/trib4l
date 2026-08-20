# Trib4l

Next.js (App Router, TypeScript) on Vercel, Supabase for Postgres/Auth/RLS,
Stripe Connect for commerce, Mux for video, Sentry for errors.

- Build plan: [`docs/trib4l-build-from-zero.md`](./docs/trib4l-build-from-zero.md)
- Session status: [`docs/session-0-checklist.md`](./docs/session-0-checklist.md),
  [`docs/session-1-checklist.md`](./docs/session-1-checklist.md)
- Data retention policy: [`docs/data-retention-policy.md`](./docs/data-retention-policy.md)

## Local development

```bash
npm install
cp .env.example .env.local   # fill in Supabase local project keys
npx supabase start           # local Postgres via Docker
npx supabase db reset        # apply migrations + seed data
npm run dev
```

## Scripts

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Vitest
