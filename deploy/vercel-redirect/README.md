# Move higoverse.vercel.app to higoverse.com

The old site at `https://higoverse.vercel.app` still answers, so Google keeps
showing it. These files make every old page **permanently redirect** to
`https://higoverse.com`. That tells Google the site has moved: the old results
disappear and their ranking moves to higoverse.com, usually within a few weeks.

What's in this folder:

| File | What it does |
|---|---|
| `vercel.json` | The redirects: `/login`, `/privacy` and `/download` go to the same page on higoverse.com, every other old page (/technology, /labs…) to the home page. Permanent (308), which Google treats like a 301. |
| `index.html` | A fallback that also sends visitors to higoverse.com, in case the project has no other page to build. Normally never seen. |
| `README.md` | These instructions. |

---

## Before you start: your domain stays on your server

Your website and the apps run on your own server, **not on Vercel**. The
domain must point there. Check this first:

**Cloudflare** (dash.cloudflare.com → higoverse.com → DNS → Records), only
these two records for the website, both **Proxied** (orange cloud):

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `@` (higoverse.com) | `102.202.208.190` | Proxied |
| CNAME | `www` | `higoverse.com` | Proxied |

Nothing in Cloudflare points to Vercel (no `higoverse.vercel.app`,
`cname.vercel-dns.com`, `216.198.79.x` or `64.29.17.x`).

**Vercel** (the old project → Settings → Domains): **only**
`higoverse.vercel.app`. If `higoverse.com` or `www.higoverse.com` are listed,
remove them, or Vercel takes your domain away from your server.

---

## Step 1. Put the redirect on the old Vercel project

Choose **one** way.

### A. The old project is built from a GitHub repository (most likely)

1. Open that repository (the one Vercel builds `higoverse.vercel.app` from).
2. Put `vercel.json` from this folder at the **root** of the repository. If a
   `vercel.json` is already there, replace it with this one.
3. Commit and push. Vercel redeploys by itself (watch it in the project's
   **Deployments** tab until it's *Ready*).

The old pages stay in the repository but nobody reaches them any more: the
redirects in `vercel.json` answer first.

### B. Upload this folder with the Vercel CLI

```bash
npm i -g vercel
vercel login
cd "C:\Users\JOSUE\Downloads\higoverse-vercel-redirect"
vercel link      # choose the project that serves higoverse.vercel.app
vercel --prod
```

This replaces the old site with these three files.

### Check it works

Open these in a browser; each must end on higoverse.com:

- `https://higoverse.vercel.app/` → `https://higoverse.com/`
- `https://higoverse.vercel.app/technology` → `https://higoverse.com/`
- `https://higoverse.vercel.app/login` → `https://higoverse.com/login`

Or in a terminal: `curl -I https://higoverse.vercel.app/technology` shows
`308` and `location: https://higoverse.com/`.

**Keep this redirect online for at least a year.** Don't delete the Vercel
project: if the old address stops redirecting, its old pages can come back
in Google.

---

## Step 2. Google Search Console (search.google.com/search-console)

1. **Add property** → **Domain** → `higoverse.com`. Google shows a `TXT`
   record: add it in Cloudflare → DNS (Type `TXT`, Name `@`, the value Google
   gives), then press **Verify**. This TXT record doesn't affect the website.
2. **Sitemaps** → enter `https://higoverse.com/sitemap.xml` → **Submit**.
3. **URL Inspection** → `https://higoverse.com/` → **Request indexing**. Do
   the same for `https://higoverse.com/download`.
4. Optional: also add a **URL prefix** property for
   `https://higoverse.vercel.app/`. Once the redirect is live, its *Pages*
   report shows the old pages moving to higoverse.com ("Page with redirect").

## Step 3. Google Business Profile (business.google.com)

Edit the **Higoverse** profile:

- **Website** → `https://higoverse.com`
- Check that the phone (0790 885 174) and the address match the website's
  contact section, so Google ties the profile to the site.

The **Website** button on the Google panel then opens higoverse.com.

## Step 4. Everywhere else you link to the old address

Replace `higoverse.vercel.app` with `https://higoverse.com` in your Facebook
page, WhatsApp business profile, email signature, flyers and anywhere else.
Every link to higoverse.com helps it rank.

---

## Already done on higoverse.com

- A public home page at `higoverse.com/` describing Higoverse for shops and
  car dealers, with an FAQ, contact details and the apps, in five languages.
- Page titles, descriptions, share previews and structured data (business,
  website, software, FAQ) for search engines.
- `sitemap.xml` and `robots.txt`; each page names its own main address.
- `www.higoverse.com` redirects permanently to `higoverse.com`.

## How long it takes

Google usually picks up the redirect in a few days. The old
`higoverse.vercel.app` results fade over **2 to 6 weeks**, while
`higoverse.com` takes their place.
