# Deploying NearStock to Vercel

Two commands. Takes about two minutes.

## Option A — Vercel CLI (recommended)

```bash
# 1. unzip and enter the project
unzip nearstock.zip -d nearstock
cd nearstock

# 2. install dependencies (needed once, locally)
npm install

# 3. install the Vercel CLI
npm i -g vercel

# 4. log in — opens your browser
vercel login

# 5. deploy to production
vercel --prod
```

The CLI will ask a few questions on first run. Safe answers:

| Prompt | Answer |
|---|---|
| Set up and deploy? | **Y** |
| Which scope? | your personal account |
| Link to existing project? | **N** |
| Project name? | `nearstock` (or press Enter) |
| In which directory is your code located? | `./` (press Enter) |
| Want to modify these settings? | **N** |

When it finishes it prints a URL like `https://nearstock-xxxx.vercel.app`. That's your live site.

### Verify it worked

```bash
curl https://YOUR-URL.vercel.app/api/health
# → {"status":"ok","service":"NearStock API", ...}
```

Then open the URL in a browser, search for `milk`, and check that `/shop.html` loads.

---

## Option B — GitHub + Vercel dashboard (no terminal after the push)

```bash
cd nearstock
git init && git add . && git commit -m "NearStock"
gh repo create nearstock --public --source=. --push     # or push to a repo you made on github.com
```

Then at [vercel.com/new](https://vercel.com/new): **Import** the repo → leave every setting at its
default (Framework Preset: *Other*) → **Deploy**. Every future `git push` redeploys automatically.

---

## Attaching a real MySQL database (optional)

Without this, the deployment runs on the seeded in-memory dataset. That is fine for a demo, but
Vercel's serverless instances are ephemeral, so stock edits and queue changes will not persist
indefinitely.

1. Create a free MySQL on **TiDB Serverless** (`tidbcloud.com`) or **Aiven** (`aiven.io`).
2. Load the schema and fixtures:
   ```bash
   mysql -h HOST -P PORT -u USER -p < db/schema.sql
   mysql -h HOST -P PORT -u USER -p nearstock < db/seed.sql
   ```
3. In Vercel: **Project → Settings → Environment Variables**, add
   ```
   DATABASE_URL = mysql://USER:PASSWORD@HOST:PORT/nearstock
   DB_SSL       = true
   ```
4. Redeploy (`vercel --prod`, or **Redeploy** in the dashboard).

Confirm the switch at `https://YOUR-URL.vercel.app/api/meta` — `data.driver` should read
`"mysql"` instead of `"memory"`.

---

## Troubleshooting

**`vercel: command not found`** — npm's global bin isn't on your PATH. Use `npx vercel --prod` instead.

**404 on `/api/health`** — check that `api/[...path].js` and `api/index.js` both survived the unzip.
They are the serverless entry points.

**Pages load but every API call fails** — open the deployment's **Functions** tab in the Vercel
dashboard and read the log; a missing dependency in `package.json` is the usual cause.

**Build fails on `mysql2`** — it is a normal dependency and should install cleanly. If it doesn't,
`rm -rf node_modules package-lock.json && npm install`, then redeploy.
