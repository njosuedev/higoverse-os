# Moving higoverse.vercel.app to higoverse.com

The old site at `https://higoverse.vercel.app` still answers and tells Google it
is the main address, so Google keeps showing it above `higoverse.com`. Making
every old page redirect permanently (308/301) to `higoverse.com` tells Google
the site has moved: it then drops the old results and moves their ranking to
the new address, usually within a few weeks.

`vercel.json` here does that: `/login`, `/privacy` and `/download` go to the
same page on higoverse.com, every other old page to the home page.

## 1. Redirect the old site (in your Vercel account)

In the Vercel project that serves `higoverse.vercel.app`, replace what it
deploys with this folder:

- **With the Vercel CLI** (`npm i -g vercel`, then `vercel login`):

  ```bash
  cd deploy/vercel-redirect
  vercel link        # choose the project that serves higoverse.vercel.app
  vercel --prod
  ```

- **Or in its Git repository:** put this `vercel.json` at the root of the
  repository that Vercel builds for that project (replacing the old site), and
  push. Vercel redeploys it.

Check: `curl -I https://higoverse.vercel.app/technology` must answer `308`
with `location: https://higoverse.com/`.

Keep the project (and the redirect) running for at least a year: removing it
early brings the old pages back.

## 2. Google Search Console (search.google.com/search-console)

1. Add a **Domain** property for `higoverse.com` and verify it with the TXT
   record Google gives you (Cloudflare → DNS → add record).
2. Sitemaps → submit `https://higoverse.com/sitemap.xml`.
3. URL Inspection → `https://higoverse.com/login` → Request indexing (and the
   same for `https://higoverse.com/download`).

## 3. Google Business Profile (business.google.com)

Edit the Higoverse profile → **Website** → `https://higoverse.com`. The
"Website" button on the search panel then opens the new address.

## Already done on higoverse.com

- `www.higoverse.com` redirects permanently to `higoverse.com`.
- Every page names `https://higoverse.com/...` as its canonical address, and
  the sign-in page describes the business (name, logo, phone, Kigali) for
  search engines.
