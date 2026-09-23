# V2H Platform

**Fullstack visual site builder + no-code app maker + instant publishing.**
One self-contained Node server, zero dependencies, one mission: be the local-first alternative to
WordPress (publishing/CMS), Odoo App Maker (no-code data apps) and Figma (visual design canvas).

```
┌──────────────────────────────────────────────────────────────┐
│                      V2H Platform                             │
│                                                               │
│  Design Studio ──────► Publish ────► /s/<slug>/  (live site)  │
│  (visual canvas)                  └─► SEO, custom CSS, data   │
│                                                               │
│  App Maker ──────────► Share ────► /app/<slug>  (live app)    │
│  (schema + records)              └─► public JSON API          │
│                                                               │
│  Data Lists ◄──────── collections power dynamic site content  │
└──────────────────────────────────────────────────────────────┘
```

## Quick start

```bash
cd platform
npm start          # or: node server.js
# open http://localhost:3000
```

Requires Node 18+. No install step, no database server — everything is stored in `data/`.

## What's inside

| Area | Route | What it does |
|---|---|---|
| Dashboard | `/` | Sign in/up, manage sites, apps and published URLs |
| Design Studio | `/studio.html` | Canvas editor (shapes, text, images, animations, layers, multi-page), syncs to your account, exports pure HTML/ZIP |
| App Maker | `/apps.html` | Schema designer + record grid + view config (Odoo-style) |
| Live app | `/app/<slug>` | Auto-generated public app from any collection: cards/table, search, detail view, owner CRUD |
| Published sites | `/s/<slug>/` | Sites published from the Studio, served instantly with SEO meta + custom CSS |
| Public data API | `/api/public/collections/<id-or-slug>/records` | JSON feed powering data lists on published sites |

### The three competitors, one platform

- **vs Figma** — the Studio: free-form canvas, layers, drag/resize/pinch gestures, animations,
  undo/redo, multi-page design. Your design compiles to real HTML/CSS, not a proprietary file.
- **vs Odoo App Maker** — the App Maker: define fields (text, number, date, select, boolean,
  image, link), edit records in a grid, then flip the app public and share `/app/<slug>`.
  Templates: Blog, Products, Contacts (CRM), Tasks.
- **vs WordPress** — publishing: one click pushes your whole project live at `/s/<slug>/`
  with SEO title/description, favicon and custom CSS. Data Lists on the canvas render live
  records from your collections (a blog loop, a product grid, …) — content updates without
  republishing.

## API (all JSON, Bearer-token auth)

```
POST /api/auth/register|login|logout     GET /api/auth/me
GET|POST /api/projects                   GET|PUT|DELETE /api/projects/:id
POST /api/projects/:id/duplicate
POST /api/publish                        GET /api/sites    DELETE /api/sites/:slug
GET|POST /api/collections                GET|PUT|DELETE /api/collections/:id
GET|POST /api/collections/:id/records    PUT|DELETE /api/collections/:id/records/:rid
GET /api/public/collections/:idOrSlug[?search=&limit=]
```

## Storage

```
platform/data/
  db.json          # users, tokens, projects, collections, records, sites index
  sites/<slug>/    # published static sites (html + assets)
```

`db.json` is written atomically; back it up by copying the `data/` directory.

## Notes

- The original client-only builder lives untouched at the repo root ([`index.html`](../index.html)).
  The Studio is a port of it — your old `v2h_projects` localStorage data still opens via **Import JSON**.
- Auth is intentionally simple (scrypt hashes + 30-day tokens). Put it behind a reverse proxy
  with HTTPS before exposing it publicly.
