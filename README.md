# Trib4l

Next.js (App Router, TypeScript) on Vercel, Supabase for Postgres/Auth/RLS,
Stripe Connect for commerce, Mux for video, Sentry for errors.

- Build plan: [`docs/trib4l-build-from-zero.md`](./docs/trib4l-build-from-zero.md)
- Revenue model & mentor compensation: [`docs/revenue-model-and-mentor-compensation.md`](./docs/revenue-model-and-mentor-compensation.md)
- Session status: [`docs/session-0-checklist.md`](./docs/session-0-checklist.md),
  [`docs/session-1-checklist.md`](./docs/session-1-checklist.md)
- Data retention policy: [`docs/data-retention-policy.md`](./docs/data-retention-policy.md)

Note: the site is being renamed Trib4l → **F4milia**. Not yet applied to
code, package naming, or seed data — that happens with frontend/branding
work. New docs above use the F4milia name where the source material does.

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
