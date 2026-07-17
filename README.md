# LeadHunter

LeadHunter is an early-access B2B prospecting workspace for agencies and outbound teams. It finds public business leads from Google Maps and supported web/community sources, saves them to a private workspace, and exports them to CSV, Excel, or Google Sheets.

## Technology

- Next.js App Router, React, and TypeScript
- Tailwind CSS
- Supabase Auth and PostgreSQL
- Google Places API
- Google Sheets API with a service account
- ScrapeGraphAI for supported website and directory extraction
- Hacker News Firebase and Algolia APIs
- Upstash Redis when configured

## Local development

Requirements:

- Node.js 20 or newer
- npm
- A Supabase project

Install dependencies:

```powershell
npm install
```

Create the local environment file without overwriting an existing one:

```powershell
Copy-Item .env.local.example .env.local
```

Fill in the variables described in the environment section below, then apply every migration in `supabase/migrations` in filename order. With a linked Supabase CLI project:

```powershell
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Alternatively, paste each migration into the Supabase SQL Editor in filename order.

Start the app:

```powershell
npm run dev
```

Open `http://localhost:3000`.

## Authentication setup

In Supabase:

1. Open **Authentication > Providers > Email**.
2. Enable email/password authentication.
3. Decide whether email confirmation is required.
4. Add `http://localhost:3000/**` to the local redirect allow list.
5. Add `https://leadhunter.irssmex.com/**` to the production redirect allow list.
6. Set the Site URL to `https://leadhunter.irssmex.com` for production.

The application stores Supabase access and refresh tokens in HTTP-only cookies. `proxy.ts` protects private pages and APIs, refreshes sessions when possible, and redirects unauthenticated page requests to `/login?next=<path>`.

## Database migrations

Apply all migrations in `supabase/migrations`:

- `202607160001_add_community_lead_fields.sql`
- `202607160002_add_indiehackers_source.sql`
- `202607160003_add_producthunt_source.sql`
- `202607170001_add_auth_profiles_and_rls.sql`

The auth migration:

- Adds nullable `jobs.user_id`
- Creates `profiles` with a default `free` plan
- Backfills profiles for existing Supabase Auth users
- Creates a trigger for new free-plan profiles
- Adds user/time indexes
- Enables row-level security for leads, jobs, and profiles

Legacy `leads.user_id = 'default'` records are preserved. Normal users never receive them. Emails listed in `ADMIN_EMAILS` can access legacy records through server-side compatibility filters.

## Environment variables

Copy `.env.local.example` and provide values only in `.env.local` or the deployment platform's encrypted environment settings.

| Variable | Required | Purpose |
|---|---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public Supabase anonymous key used for authentication |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only database access; never expose to browser code |
| `NEXT_PUBLIC_APP_URL` | Yes | Public application origin |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Yes | Public support/demo email |
| `ADMIN_EMAILS` | Recommended | Comma-separated internal admin emails |
| `FREE_MONTHLY_LEAD_LIMIT` | Recommended | Free-plan limit; defaults to 25 |
| `GOOGLE_PLACES_API_KEY` | For Maps | Google Places API key |
| `GOOGLE_CREDENTIALS_B64` | For Sheets | Base64-encoded Google service-account JSON |
| `SGAI_API_KEY` | For extraction | ScrapeGraphAI key for website, directory, Indie Hackers, Product Hunt, and enrichment |
| `UPSTASH_REDIS_REST_URL` | Optional | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Upstash Redis REST token |
| `COMMUNITIES_ENABLED` | Optional | Enables community scraping; defaults to false |
| `HACKERNEWS_ENABLED` | Optional | Enables Hacker News; defaults to true |
| `REDDIT_ENABLED` | Optional | Enables Reddit prototype; defaults to true |
| `INDIEHACKERS_ENABLED` | Optional | Enables ScrapeGraphAI Indie Hackers extraction |
| `PRODUCTHUNT_ENABLED` | Optional | Enables ScrapeGraphAI Product Hunt extraction |
| `REDDIT_USER_AGENT` | Optional | Reddit request user-agent |
| `COMMUNITIES_MAX_RESULTS` | Optional | Community default/hard-limit configuration |
| `COMMUNITIES_REQUEST_TIMEOUT_MS` | Optional | Community external request timeout |
| `COMMUNITIES_CONCURRENCY` | Optional | Community request concurrency |

## Google Sheets setup

Share the destination spreadsheet with this service account as an Editor:

```text
leadhunter-sheets@leadhunter-498411.iam.gserviceaccount.com
```

The spreadsheet ID is the value between `/d/` and `/edit`:

```text
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```

The private `/integrations` page and Google Sheets sync modal contain the complete setup guide.

## Plans and usage

Plan limits live in `lib/plans.ts`:

| Plan | Monthly leads | Early-access price |
|---|---:|---:|
| Free | 25 | $0 |
| Starter | 500 | $19 |
| Pro | 2,500 | $49 |
| Agency | 10,000 | $99 |

New users receive the free plan through a database trigger. Scraping APIs count leads created during the current UTC calendar month and clamp saves to the user's remaining allowance. Admin emails bypass limits for internal testing. Paddle and checkout are not implemented.

## Verification

Run:

```powershell
cmd /c npm run typecheck
cmd /c npm run build
```

Production smoke checks:

- `/`, `/login`, `/privacy`, and `/terms` are public
- `/dashboard`, `/finder`, `/leads`, and `/integrations` redirect signed-out users
- Private APIs return `401` when signed out
- A signed-in user sees only their own leads/jobs
- Google Maps and Hacker News save leads with the authenticated user ID
- CSV, Excel, and Google Sheets export only accessible rows
- `/google-sheets` redirects to `/integrations`
- `/api/health` returns a minimal health response

## Vercel deployment

1. Push the repository to a Git provider.
2. In Vercel, choose **Add New > Project** and import the repository.
3. Keep the detected framework as Next.js.
4. Keep the build command as `npm run build`.
5. Add every required environment variable from the table above for **Production**. Add non-production values separately for Preview if needed.
6. Apply the Supabase migrations before sending production traffic to the app.
7. Configure Supabase Authentication Site URL and redirect allow-list entries for `https://leadhunter.irssmex.com`.
8. Deploy and verify `/api/health`, `/`, `/login`, authentication, one private route, and one authenticated lead query.
9. In Vercel **Settings > Domains**, add `leadhunter.irssmex.com`.

## Domain setup

After adding `leadhunter.irssmex.com` in Vercel:

1. Open the DNS provider for `irssmex.com`.
2. Create a CNAME record:
   - Name/Host: `leadhunter`
   - Target: `cname.vercel-dns.com`
3. Remove conflicting A, AAAA, or CNAME records for the same `leadhunter` host.
4. Wait for DNS propagation.
5. Return to Vercel Domains and confirm the domain shows **Valid Configuration**.
6. Verify HTTPS loads at `https://leadhunter.irssmex.com`.
7. Confirm `NEXT_PUBLIC_APP_URL` and the Supabase Site URL both use that exact HTTPS origin.

## Production checklist

- Migrations applied in order
- Supabase email/password authentication configured
- Production URL and auth redirects configured
- Service-role key stored server-side only
- Google Places restrictions configured for the intended project
- Google service account has only the required Sheets access
- Monthly limits verified with a non-admin account
- Admin compatibility verified only for emails in `ADMIN_EMAILS`
- Public pages indexed; private pages and APIs excluded from robots
- Typecheck and production build pass
- Google Maps, Hacker News, CSV, Excel, and Google Sheets smoke-tested

## Current limitations

- ScrapeGraphAI-backed features depend on provider credits and availability.
- Reddit public JSON access can be blocked; reliable OAuth access is not implemented.
- Email enrichment only searches public website pages and may not find an email.
- Paid subscription activation and Paddle checkout are not implemented.
- LeadHunter does not automate outreach.
