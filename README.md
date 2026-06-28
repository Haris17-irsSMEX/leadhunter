<div align="center">

# ⚡ LeadHunter

### AI-powered lead generation tool — scrape, enrich, and export leads at scale

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green?logo=supabase)](https://supabase.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

[Features](#features) · [Tech Stack](#tech-stack) · [Getting Started](#getting-started) · [Screenshots](#screenshots)

</div>

---

## What is LeadHunter?

LeadHunter is a full-stack AI lead scraper that lets you find, 
qualify, and export business leads from three sources:

- **Company websites** — extract founder names, emails, tech stack, pricing
- **Google Maps** — find local businesses with phone numbers and addresses
- **Business directories** — sweep listing pages like Crunchbase, AngelList, Product Hunt

Every lead gets an **AI quality score** (Hot / Warm / Cold) based on available 
contact data. Export to Google Sheets, download as Excel, or sync via CSV.

---

## Features

- 🔍 **Three scraping sources** — websites, Google Maps, business directories
- 🤖 **AI lead scoring** — automatic Hot/Warm/Cold classification
- 📧 **Email enrichment** — auto-finds emails by crawling contact pages
- 📊 **Google Sheets sync** — export selected leads directly to any spreadsheet
- 📥 **Excel + CSV export** — download leads with formatted headers
- 🗑️ **Bulk actions** — select, delete, or export multiple leads at once
- ⚡ **Real-time job tracking** — watch batch scrapes complete in the UI
- 🌙 **Dark premium UI** — Stakent-inspired design with purple accents

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Scraping | ScrapeGraphAI Cloud API |
| Maps | Google Places API |
| Sheets | Google Sheets API v4 (via jose JWT auth) |
| Queue | Upstash Redis |
| Auth | Supabase Auth (coming in v2) |
| Billing | Lemon Squeezy (coming in v2) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [ScrapeGraphAI](https://scrapegraphai.com) account (free tier available)
- A [Supabase](https://supabase.com) project
- A [Google Cloud](https://console.cloud.google.com) project with Sheets API enabled
- An [Upstash](https://upstash.com) Redis database
- A [Google Places API](https://developers.google.com/maps/documentation/places) key

### Installation

**1. Clone the repo**
```bash
git clone https://github.com/YOUR_USERNAME/leadhunter.git
cd leadhunter
```

**2. Install dependencies**
```bash
npm install
```

**3. Set up environment variables**

Copy the example file and fill in your keys:
```bash
copy .env.local.example .env.local
```

Open `.env.local` and fill in:

| Variable | Where to get it |
|---|---|
| `SGAI_API_KEY` | dashboard.scrapegraphai.com → API Keys |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API |
| `UPSTASH_REDIS_REST_URL` | Upstash dashboard → REST API |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash dashboard → REST API |
| `GOOGLE_PLACES_API_KEY` | Google Cloud Console → Credentials |
| `GOOGLE_CREDENTIALS_B64` | Base64-encoded Google service account JSON |

**4. Set up the database**

Run this SQL in your Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL DEFAULT 'default',
  company_name text NOT NULL,
  website text, description text, founder_name text,
  email text, phone text, linkedin_url text,
  twitter_handle text, location text, country text,
  industry text, employee_count text, pricing_model text,
  tech_stack text[], source text DEFAULT 'website',
  source_url text DEFAULT '', status text DEFAULT 'active',
  job_id text, scraped_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY,
  user_id text DEFAULT 'default',
  status text DEFAULT 'queued',
  source_type text DEFAULT 'website',
  input_data jsonb, results_count int DEFAULT 0,
  error text, created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
```

**5. Get your Google Credentials as Base64**

Download your service account JSON from Google Cloud Console, then run:
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\credentials.json"))
```
Paste the output as `GOOGLE_CREDENTIALS_B64` in your `.env.local`.

**6. Share your Google Sheet**

When using Sheets export, share your spreadsheet with your service account email:
`your-service-account@your-project.iam.gserviceaccount.com` — give it Editor access.

**7. Run the development server**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---


## Screenshots

![LeadHunter Dashboard](screenshots/dashboard.png)
![Lead Finder](screenshots/finder.png)
![Leads Table](screenshots/leads.png)

---

## Roadmap

- [ ] User authentication (Supabase Auth)
- [ ] Credit-based billing (Lemon Squeezy)
- [ ] AI email writer for each lead
- [ ] Webhook notifications on scrape complete
- [ ] Team workspaces

---

## License

MIT — use it however you want.

---

<div align="center">
Built by <a href="https://github.com/ Haris17-irsSMEX">Haris</a> · 
<a href="https://irssmex.com">irsSMEX</a>
</div>
