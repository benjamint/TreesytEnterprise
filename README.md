# TreeSyt Enterprise — clickable prototype

Front-end-only prototype of TreeSyt Enterprise, built from [`TreeSyt_Enterprise_Prototype_PRD.md`](TreeSyt_Enterprise_Prototype_PRD.md).
No backend: all data is seeded from `src/data/` into Zustand stores, persisted (gzip-compressed) in `localStorage` and synced across browser tabs.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
npm run lint       # ESLint (incl. "no raw text in JSX" i18n rule)
npm run test       # Vitest: engines, seed data, translations
```

Deploy: Vercel static build; `vercel.json` rewrites every path to `index.html` (SPA fallback).

## Layout

| Path | What |
|---|---|
| `src/app` | App, router, providers, guards, route catalogue (`routes.ts`), mobile window opener |
| `src/web` | Web app shell (sidebar, top bar, switchers, command palette) and feature pages |
| `src/mobile` | Mobile app (`/m/*`): shell, bottom tabs, Record sheet, screens |
| `src/engines` | Pure TypeScript engines: workflow, numbering, money, units, loans, permissions, terminology, forms, scoring, rules, rates, metrics, locations, templates, activity, notify |
| `src/stores` | One store per domain + session, mobile session, outbox; persistence and cross-tab sync |
| `src/data` | Deterministic seed (`seed/`), catalogues (countries, providers) |
| `src/i18n` | `en.json`, `fr.json` |
| `docs/COVERAGE.md` | PRD section 16 checklist, ticked per phase |

## Demo tips

- Every demo account uses the password **`demo1234`** (e.g. `kwame.asante@vitara.example`).
- **Demo panel** (flask icon, bottom-right, on every screen): sign in as any persona, see the one-time codes and emails the simulated gateways "sent", read notes about the current page, open the mobile window, mobile previews, "view as" mode and reset demo data. Every section starts closed; the product UI carries no prototype controls.
- **Company switcher** (top-left pill): Vitara (Ghana, GHS, EN) ↔ Kakao Ivoire (Côte d'Ivoire, XOF, FR) ↔ Nordic Shea Butter AB (buyer).
- The store registry is exposed as `window.__treesytStores` for debugging.
