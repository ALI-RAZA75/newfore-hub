# Newfore Hub

Newfore's performance, plans and tasks in one place:

- **Performance:**
  - live visitors right now (GA4 Realtime)
  - this week vs last week for leads, AI visits, Google profile actions, website visits, Google clicks and question-search ranking
  - visits by channel per week, with AI assistants and Google Maps split out
  - a source → lead flow chart
  - AI platforms
  - Google Search by type, plus key-search rankings
  - every Google Business Profile location: views, calls, website clicks, directions, reviews and rating
- **Plans & goals:** any number of plans (the 3-month AI Visibility & Maps plan is preloaded). Each goal links to a live metric, so its progress bar moves on its own, with a marker showing where we should be by today.
- **Tasks:**
  - board, list and by-week views
  - priority (urgent, high, medium, low), owner, due date, plan, area, comments
  - overdue tasks flagged
  - admins (Seif, Ali) create and assign; members see everything and update their own tasks.

Stack: Next.js 14 (App Router), Supabase (Postgres, Auth, row-level security), Google APIs, Recharts, Tailwind. It's built to run on Vercel.

---

## Setup (about 30 minutes, plus Google's approval for Business Profile)

### 1. Supabase

1. Create a project at supabase.com.
2. Open **SQL Editor**, then run `supabase/migrations/001_schema.sql`, then `supabase/migrations/002_seed_plan.sql`. The second file loads the 3-month plan, its 9 goals and 81 tasks.
3. Go to **Authentication → URL Configuration**:
   - Site URL: your app URL (for example `https://hub.newfore.com`)
   - Redirect URLs: add `https://YOUR-APP/auth/callback` and `http://localhost:3000/auth/callback`
4. Go to **Authentication → Users → Add user** and create your own account with a password. **The first account becomes admin.** Everyone after that joins as a member; an admin can promote them in Settings.
5. Go to **Authentication → Sign In / Providers** and turn off "Allow new users to sign up". From then on, people only join when an admin invites them from Settings.
6. Go to **Project Settings → API** and copy the URL, the `anon` key and the `service_role` key.

### 2. Google Cloud (data access)

1. Go to console.cloud.google.com and create a project, for example "Newfore Hub".
2. Under **APIs & Services → Library**, enable:
   - Google Analytics Data API
   - Google Analytics Admin API
   - Google Search Console API
   - My Business Account Management API
   - My Business Business Information API
   - Business Profile Performance API
   - Google My Business API (used for review counts)
3. Set up the **OAuth consent screen**:
   - If newfore.com uses Google Workspace, choose **Internal**. There's no review and no expiring logins.
   - Otherwise choose **External**, add your Google account as a test user, then **Publish app**. Apps left in "Testing" lose the connection every 7 days.
4. Go to **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized redirect URI: `https://YOUR-APP/api/google/callback` (add `http://localhost:3000/api/google/callback` for local use)
   - Copy the Client ID and Client secret.
5. **Business Profile API access.** Google keeps these APIs at zero quota until it approves your project. Apply here: https://developers.google.com/my-business/content/prereqs and use the "Business Profile API access request" form with the project number from step 1. Approval usually takes a few days to two weeks. Until then the Maps section stays empty, and GA4 and Search Console work normally.

### 3. Deploy on Vercel

1. Push this folder to a private GitHub repo and import it in Vercel.
2. Add these environment variables (see `.env.example`):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | from Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | from Supabase (secret) |
   | `GOOGLE_CLIENT_ID` | from Google Cloud |
   | `GOOGLE_CLIENT_SECRET` | from Google Cloud (secret) |
   | `APP_URL` | your app URL, no trailing slash |
   | `CRON_SECRET` | any long random string |

3. Deploy. `vercel.json` runs the sync every morning at 06:15 UTC (2:15 am Toronto during daylight time, 1:15 am in winter). Vercel passes `CRON_SECRET` automatically.

### 4. First run

1. Sign in and open **Settings → Connect Google**. Use the Google account that can see the GA4 property, Search Console and all 4 Business Profiles, and allow every permission.
2. Pick:
   - the GA4 property (the one Seif confirms; "Newfore Clean Data" is `540352974`)
   - the Search Console site
   - the 4 Maps locations
3. Check the key searches and brand words, then save.
4. Click **Backfill 16 weeks**. The charts fill straight away.
5. Invite the team from **Settings → Team**. They get an email, set a password and land in the app.

### 5. Tag each Google profile's website link

So that the app (and GA4) can tell which Maps listing sent each visitor, set every profile's website link to:

```
https://newfore.com/?utm_source=google&utm_medium=organic&utm_campaign=gbp-stoneycreek
https://newfore.com/?utm_source=google&utm_medium=organic&utm_campaign=gbp-hamilton
https://newfore.com/?utm_source=google&utm_medium=organic&utm_campaign=gbp-brantford
https://newfore.com/?utm_source=google&utm_medium=organic&utm_campaign=gbp-stcatharines
```

---

## How the numbers are built

- **AI assistants:** GA4 sessions whose source matches ChatGPT, Claude, Perplexity, Gemini, Copilot, DeepSeek, Grok, Meta AI and others. The rules are in `src/lib/classify.ts` and match the Data Studio report.
- **Google Maps:** sessions whose campaign contains `gbp`, plus Business Profile API figures (views, calls, website clicks, directions) per location.
- **Leads:** GA4 key events (quote form, phone click, email click).
- **Bot traffic:** visits from Council Bluffs, Singapore and Larnaca are dropped.
- **Search types:**
  - Brand: the query contains "newfore"
  - Question: it starts with how, what, cost and similar words, or is 5 or more words long
  - Short: everything else
- **Week to week:** the last 7 days against the 7 days before. Search Console uses a window 3 days earlier because Google reports it late.
- **Goals:** each one uses the last 28 days, matching what was agreed with Seif.
- **Storage:** every sync re-pulls the last 35 days, so late corrections from Google are picked up. Raw daily figures live in `metrics_daily`.

## Running locally

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
```

## Security

- Google tokens are stored in a table with no read policies. Only the server can read them, with the service-role key; they are never sent to the browser.
- Row-level security:
  - members can read everything, add tasks and edit tasks they own or created
  - only admins change plans, goals, settings and roles
  - only the server writes analytics data
- Google access is read-only for Analytics and Search Console. Business Profile's only scope (`business.manage`) also allows changes, but the app only reads.
