# F4milia

Next.js (App Router, TypeScript) on Vercel, Supabase for Postgres/Auth/RLS,
Stripe Connect for commerce, Mux for video, Sentry for errors.

- Build plan: [`docs/trib4l-build-from-zero.md`](./docs/trib4l-build-from-zero.md)
  (kept under its original filename — a historical planning doc, written
  before the rename; content unchanged)
- Revenue model & mentor compensation: [`docs/revenue-model-and-mentor-compensation.md`](./docs/revenue-model-and-mentor-compensation.md)
- Session status: [`docs/session-0-checklist.md`](./docs/session-0-checklist.md),
  [`docs/session-1-checklist.md`](./docs/session-1-checklist.md),
  [`docs/session-2-checklist.md`](./docs/session-2-checklist.md),
  [`docs/session-3-checklist.md`](./docs/session-3-checklist.md),
  [`docs/session-4-checklist.md`](./docs/session-4-checklist.md) (skipped
  per direct instruction — see that file),
  [`docs/session-5-checklist.md`](./docs/session-5-checklist.md),
  [`docs/session-6-checklist.md`](./docs/session-6-checklist.md)
- Data retention policy: [`docs/data-retention-policy.md`](./docs/data-retention-policy.md)
- Design system: [`docs/design-system.md`](./docs/design-system.md)

Renamed Trib4l → **F4milia** as of Session 3: package name, seed data, and
all UI copy use F4milia now. The GitHub repo, Vercel project, and Supabase
project names (`Trib4l-staging`, `Trib4l-production`) still say Trib4l —
renaming hosted infrastructure is a separate, more disruptive step not yet
requested. Test/seed accounts use `@f4milia.test` email addresses.

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
- `npm test` — Vitest (fast, mocked, no DB needed)
- `npm run test:isolation` — RLS isolation suite against a real local
  Supabase instance (resets the local DB first; needs Docker running)
