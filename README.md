# NexBill Governance Platform

Online governance workspace for the NexBill program, designed for Netlify deployment with Supabase Auth, Supabase Postgres, and Netlify Functions.

## What Is Included

- React + TypeScript + Vite operational UI.
- Supabase schema and RLS migration in `supabase/migrations/202605030001_initial_schema.sql`.
- Netlify Functions:
  - `ai-report-draft`
  - `ai-governance-triage`
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
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=
OPENAI_MODEL_FALLBACKS=
```

Use `.env.example` as the starting point. `VITE_SUPABASE_ANON_KEY` is also supported for older Supabase projects, but new projects should use `VITE_SUPABASE_PUBLISHABLE_KEY`. `OPENAI_BASE_URL` can point to either the official OpenAI API base URL or an OpenAI-compatible gateway, usually ending in `/v1`. `OPENAI_MODEL` is the primary model, and optional `OPENAI_MODEL_FALLBACKS` can be a comma-separated fallback list, for example `gpt-4o-mini,gpt-4o`, when the gateway reports a model/channel as unavailable.

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/migrations/202605030001_initial_schema.sql` in the SQL editor, then run later migration files such as `supabase/migrations/202605040001_ai_triage_runs.sql`.
3. Create users in Supabase Auth.
4. Insert matching rows into `profiles` and `user_roles`.
5. In Supabase Auth URL configuration, set the production Site URL to the Netlify URL, for example `https://nexbill-pm.netlify.app`, and add redirect URLs for production and local development:
   - `https://nexbill-pm.netlify.app/**`
   - `http://localhost:5173/**`
6. For production invites, magic links, and password recovery, configure a custom SMTP provider in Supabase Auth email settings. Supabase's default email sender is rate-limited and is only suitable for early testing.
7. Update Supabase Auth email templates so enterprise email scanners do not consume one-time links before users click them. Do not link directly to `{{ .ConfirmationURL }}` for password recovery or magic links. Link to NexBill with `token_hash`, then the app asks the user to click a button before calling `verifyOtp`:
   - Password recovery link: `{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=recovery&password_reset=1`
   - Magic link sign-in: `{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=magiclink`
   - First-access / access request link: `{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=magiclink&first_access=1`
   - Invite link, if Supabase invites are used: `{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=invite&first_access=1`
   This indirection is required for Outlook, enterprise mail gateways, and link scanners that prefetch email links. Prefetching opens the NexBill page only; the OTP is consumed only after the real user clicks the in-app continue button.
8. Set the Netlify environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`, `OPENAI_MODEL`, optional `OPENAI_MODEL_FALLBACKS`, and optional `OPENAI_BASE_URL` if AI report drafts and governance triage should call OpenAI or an OpenAI-compatible gateway.

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
