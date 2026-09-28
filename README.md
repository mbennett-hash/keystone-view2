# Keystone View

A self-hosted, Flourish-style chart editor and publisher. Build a chart in
the browser, publish it, and embed it anywhere with a script tag — the
same `<div>` + `<script>` + `<noscript>` pattern Flourish uses, so it
drops into HubSpot (or anywhere else) the same way your existing embeds do.

This is a proof of concept: it proves the whole loop — edit, publish,
embed on an external page — works end to end.

## Running it locally

```
npm install
npm run dev
```

Publishing a chart needs a Vercel Blob store connected (see "Chart
storage" below) — without one, the editor loads fine but clicking
**Publish** will fail with a "No blob credentials found" error. To
publish locally:

```
vercel link      # connects this folder to your Vercel project (one-time)
vercel env pull .env.local
npm run dev
```

That pulls down the `BLOB_READ_WRITE_TOKEN` Vercel already generated for
your project (see below) so local publishing writes to the same store
production uses. `.gitignore` already excludes `.env*.local`, so that
token never gets committed.

Then open:

- **http://localhost:3000/** — the chart library: every published chart,
  click one to edit and republish it, or **+ New chart** to start one.
- **http://localhost:3000/editor.html** — the chart editor on its own
  (a fresh chart). Build a chart, set a slug, click **Publish**.
  `editor.html?slug=<slug>` (what the library's "Edit" links use) loads
  an existing published chart back in instead of starting fresh.
- **http://localhost:3000/test.html** — a stand-in for a real page (e.g.
  a HubSpot post), with the embed snippet already pasted in. Publish a
  chart with the slug `funding-masters-2026` in the editor and refresh
  this page to see it render via the embed script — exactly what a site
  visitor would see.
- **http://localhost:3000/chart/\<slug\>** — a bare page for one published
  chart on its own (what the embed snippet's fallback link points at).

## How it fits together

```
editor.html  →  publishes chart JSON  →  /api/charts/<slug>  →  Vercel Blob (charts/<slug>.json)
                                                 ↑
                        embed.js fetches it, on whatever page it's pasted into
```

- **`public/chart-lib.js`** — the actual charting logic (brand themes,
  number formatting, building the ECharts config). Both the editor and
  the embed script load this file, so a published chart is always built
  by the exact same code that previewed it — no drift between what you
  saw in the editor and what a site visitor sees.
- **`public/editor.html`** — the interactive tool. A plain HTML/JS page
  (no React), same as the earlier prototype you tried. `?slug=<slug>`
  loads a saved chart in for editing.
- **`public/charts.html`** — the library: lists every published chart
  (title, brand, chart type, created/updated dates), links to edit or
  view each one live. Has a folder sidebar down the left — drag a chart
  card onto a folder to file it there, click a folder to filter to it,
  **+ New folder** to create an empty one ahead of time. A sort dropdown
  switches between recently updated, recently created, and title A–Z.
- **`public/embed.js`** — the runtime that makes a chart show up on an
  external page. It works out its own origin from its own `<script src>`
  tag, so it fetches its data and assets from *this* app regardless of
  what site it's embedded in.
- **`app/api/charts/[slug]/route.js`** — stores and serves one
  published chart's config as JSON, via Vercel Blob. `POST` publishes
  (keeping the chart's original `createdAt` and appending to its
  `changeLog`); `PATCH` moves a chart into a folder without touching its
  content or history.
- **`app/api/charts/route.js`** — lists every published chart, for
  `charts.html`.
- **`app/api/folders/route.js`** — the list of folder names charts can
  be filed under (kept separately from the charts themselves, so an
  empty folder you've just created doesn't disappear).
- **`public/echarts.min.js`** — a self-hosted copy of the charting
  library. This isn't loaded from a CDN on purpose: the very first bug
  you hit in the artifact prototype was the chart silently failing to
  render because a CDN script didn't load. Self-hosting it removes that
  failure mode entirely, here and on the embed — worth keeping even once
  this is on Vercel.

## Chart storage — setting up Vercel Blob

Published charts are stored in **Vercel Blob**, not on local disk — an
earlier version wrote JSON files to disk, which worked with `npm run dev`
but failed once deployed, since Vercel's servers don't allow writing
files like that. To turn this on:

1. In the Vercel dashboard: your project → **Storage** tab → **Create
   Database** → **Blob** → follow the prompts to create and connect a
   store.
2. That's it for production — Vercel automatically sets the
   `BLOB_READ_WRITE_TOKEN` environment variable your deployed app needs,
   no further config.
3. For local publishing too, see "Running it locally" above
   (`vercel link` + `vercel env pull`).

## Organising charts, and who changed what

- **Folders** — in the chart library, drag a chart card onto a folder in
  the left sidebar to file it there (or onto **Uncategorized** to take it
  out of one). Folders themselves live in one small file
  (`meta/folders.json` in Blob storage) separately from the charts, so an
  empty folder you've created ahead of time doesn't vanish.
- **Dates** — every chart records when it was first published
  (`createdAt`, set once and never touched again) and when it was last
  updated (`updatedAt`, stamped on every publish). The library's sort
  dropdown uses both.
- **Edit history** — the editor has a "Your name" field, remembered on
  that device (browser `localStorage` — there's no login, so it's just a
  courtesy, not something enforced) so you don't have to retype it every
  time, and an optional "What did you change, and why?" note. Every
  publish appends one entry — name, note, timestamp — to that chart's
  history, shown at the bottom of the editor once a chart has been
  published at least once. Nothing is ever removed from it.
- **Legend** — clicking a series in a chart's legend hides just that
  series, independently of the others, both in the editor preview and on
  a live embedded chart; clicking it again brings it back. (Earlier
  builds had a bug where this got silently undone by the next unrelated
  edit — fixed by tracking which series are hidden ourselves instead of
  relying on the charting library's own memory of it, which turned out
  not to survive a full re-render.)

## Before this goes live

One more thing worth doing before this is anything more than a proof of
concept: `npm audit` flags a batch of advisories against Next.js 14.x
(mostly Server Actions / middleware edge cases this app doesn't use, but
worth knowing about) — I've pinned the latest 14.2.x patch, but a proper
pre-launch pass should consider the Next.js 15/16 upgrade.

Once deployed, the editor is at `https://<your-project>.vercel.app/editor.html`
and the embed snippet it generates will point at that domain instead of
`localhost:3000` automatically (it reads its own origin at publish time).
