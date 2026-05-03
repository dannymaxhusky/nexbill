# NexBill Governance Platform

Online governance workspace for the NexBill program, designed for Netlify deployment with Supabase Auth, Supabase Postgres, and Netlify Functions.

## What Is Included

- React + TypeScript + Vite operational UI.
- Supabase schema and RLS migration in `supabase/migrations/202605030001_initial_schema.sql`.
- Netlify Functions:
  - `ai-report-draft`
  - `workbook-import-preview`
  - `workbook-import-commit`
- Full first-release module coverage:
  Actions, Risks, Issues, Dependencies, Assumptions, Decisions, Benefits, Lessons, Scope & Change Requests, Financials, Schedule, Go-live Readiness, Documents, Future Projects, and Program Site content.
- Demo mode when Supabase environment variables are not configured.

## Local Setup

```bash
npm install
npm run dev
```

The app runs in demo mode until these variables are set:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=
```

Use `.env.example` as the starting point. `VITE_SUPABASE_ANON_KEY` is also supported for older Supabase projects, but new projects should use `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/migrations/202605030001_initial_schema.sql` in the SQL editor.
3. Create users in Supabase Auth.
4. Insert matching rows into `profiles` and `user_roles`.
5. Set the Netlify environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY` and `OPENAI_MODEL` if AI draft generation should call OpenAI.

This is a Vite + React app, not a Next.js app, so it does not use `@supabase/ssr`, `page.tsx`, or Next middleware. Session persistence is handled by `@supabase/supabase-js` in the browser, and privileged server writes run through Netlify Functions.

## Netlify Deployment

Push this project to GitHub and connect it to Netlify. Netlify will use:

```toml
[build]
command = "npm run build"
publish = "dist"
functions = "netlify/functions"
```

## Verification

```bash
npm run test
npm run build
```
