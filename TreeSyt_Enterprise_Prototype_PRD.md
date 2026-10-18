# TreeSyt Enterprise — Full Clickable Prototype PRD

**Owner:** Benjamin (Product / Design)
**Team:** Zoumana (CTO), Mateen (Mobile), Anthony (Backend)
**What this is:** A complete front-end-only prototype of TreeSyt Enterprise. It covers **every feature that exists in today's TreeSyt backend**, redesigned so any agri-sourcing company, in any country, can configure it without code changes.
**Build tool:** Claude Code (cloud). **Deploy:** Vercel.
**Source material:** Full backend audit (147 tables, ~70k lines) and the "TreeSyt Enterprise: full feature scope" doc. Section numbers in brackets, e.g. **[Scope 4.1]**, point back to that doc.

> **Rule for the builder:** if a feature is listed in this document, it must have a clickable screen. If a control is not fully built yet, it must still respond (toast: "Coming in the full product") — no dead buttons.

---

## Table of contents

0. How to use this PRD with Claude Code
1. Goals and product principles
2. Users, roles and personas
3. Tech stack
4. App architecture (web app + mobile app in a separate tab)
5. Folder structure
6. Design system
7. Web navigation map
8. Shared configurable engines
9. Web app — feature specifications (A–K)
10. Mobile app — flow specifications (M1–M12)
11. Data model
12. Demo data
13. Demo journeys (acceptance tests)
14. Build phases
15. Quality bar
16. Coverage checklist (every audited feature → prototype screen)

---

## 0. How to use this PRD with Claude Code

1. Create an empty GitHub repo `treesyt-enterprise-prototype`, add this file as `PRD.md`, connect the repo to Vercel.
2. Open the repo in Claude Code on the web.
3. Paste the starter prompt below. Build **one phase at a time** (section 14). Check the Vercel preview after each phase, then say "Start Phase N".

**Starter prompt:**

> Read `PRD.md` in full before writing code. Build the prototype it describes. This is front-end only: no backend, no real APIs, all data seeded from `src/data/` into Zustand stores persisted in `localStorage` and synced across browser tabs (section 4). Follow the tech stack, folder structure, design tokens, engines, data model and seed data exactly. Start with **Phase 1 only**. When it's done: run `npm run build` and `npm run lint`, fix all errors, commit, and give me (a) what you built, (b) exactly what to click to test it, (c) anything in the PRD you were unsure about. Then wait for me before starting the next phase. In every later phase, re-read the relevant PRD sections before coding, and keep `docs/COVERAGE.md` updated by ticking items from section 16.

**Tips:**

- If Claude Code runs low on context mid-phase, say: "Re-read PRD.md sections X–Y and continue Phase N from where you stopped. Check `docs/COVERAGE.md` and `git log` for progress."
- Ask for a **short demo video script** at the end of each phase so you can review quickly.

---

## 1. Goals and product principles

### 1.1 What the prototype must prove

| # | Idea | How it shows |
|---|---|---|
| 1 | One platform, many companies | Company switcher. Switching from Vitara (Ghana, shea, GHS, English) to Kakao Ivoire (Côte d'Ivoire, cocoa, XOF, French) changes currency, language, commodities, forms, approval steps, terminology, location levels, payment providers and number formats everywhere. |
| 2 | Settings, not code | Every list, threshold, rate, step, form and template that is hard-coded today is editable in Settings, and edits change the workflows instantly. |
| 3 | End-to-end operations | Field (mobile) → approval → payout → warehouse → dispatch → buyer traceability, all connected and visible. |
| 4 | Enterprise-safe | Company isolation, per-company roles and permissions, audit trail, approval separation, data-sharing grants. |
| 5 | Automation, AI and voice | Ask-your-operations assistant, AI setup drafting, risk flags, auto-reconciliation, voice purchase capture. |

### 1.2 Product principles (apply to every screen)

1. **Every record belongs to one company** (`orgId`). Lists never show another company's data unless an explicit sharing grant exists (shown with a "Shared by X" chip).
2. **Settings, not code.** Today's Vitara values become the "Vitara template" a company can copy.
3. **Country drives the basics** — currency, phone format, language, time zone, location levels, payment providers.
4. **Permissions per company.** Every action button checks a permission. Without it the button is hidden; for demo clarity, a "View as" mode shows it disabled with a tooltip naming the missing permission.
5. **Modules switch whole areas on/off** — sidebar, routes, mobile tiles and dashboard widgets.
6. **Money** stored as integer minor units + currency; formatted only through `formatMoney()`.
7. **Structured history** — activity events are `{key, params}` rendered in the viewer's language.
8. **Configurable approvals** everywhere money or stock moves, through one workflow engine.
9. **Plain language.** Short labels, verbs on buttons, helpful empty states.

### 1.3 Out of scope

Real authentication, real payments, real SMS/email/push, real backend, real OCR/speech recognition, real map polygon analysis (simulated), real deforestation data (simulated).

---

## 2. Users, roles and personas

### 2.1 Role templates (each company can rename, copy or create roles)

| Role template | Main jobs |
|---|---|
| Platform owner | Manage all companies, plans, global catalogues |
| Company admin | Settings, users, roles, modules |
| Operations manager | Approve purchase requests, plan weeks, review agents |
| Finance officer | Second approvals, payouts, reconciliation, budgets, recoveries |
| Logistics manager | Expenses (PRE), dispatch, transport |
| Warehouse manager | Warehouses, inventory, stock counts, discrepancies |
| Sales / BD officer | Sales contracts, buyer relationships, dispatch |
| M&E / data officer | Forms, surveys, data quality, imports, reports |
| Sustainability officer | Trees, nurseries, plots, EUDR, carbon projects |
| Field supervisor (manager) | Team of agents, weekly plans, manager reviews |
| Field agent (mobile) | Profiling, buying, support, recovery, monitoring |
| Warehouse officer (mobile) | Receive, dispatch, transfer, count stock |
| Buyer user (Traceboard) | See orders, deliveries, impact and documents from their suppliers |
| Auditor (read-only) | View everything, export, no actions |

### 2.2 Demo personas (role switcher in the avatar menu)

| Persona | Company | Role |
|---|---|---|
| Benjamin Sackey | TreeSyt (platform) | Platform owner |
| Ama Mensah | Vitara | Company admin |
| Kwame Asante | Vitara | Operations manager |
| Efua Boateng | Vitara | Finance officer |
| Ibrahim Seidu | Vitara | Logistics manager |
| Adwoa Owusu | Vitara | Warehouse manager |
| Kojo Mensah | Vitara | Sales / BD officer |
| Salamatu Iddrisu | Vitara | M&E / data officer |
| Naa Lamptey | Vitara | Sustainability officer |
| Fuseini Abdulai | Vitara | Field supervisor |
| Yaw Darko | Vitara | Field agent — Community Engagement Officer (mobile) |
| Mariama Bayor | Vitara | Field agent — Conservation agent (mobile) |
| Sulemana Bawa | Vitara | Warehouse officer, Wa (mobile) |
| Aïcha Koné | Kakao Ivoire | Company admin (French UI) |
| Jean-Marc Yao | Kakao Ivoire | Finance officer |
| Moussa Traoré | Kakao Ivoire | Délégué (field agent, mobile) |
| Lena Hartmann | Nordic Shea Butter AB (buyer) | Buyer user (Traceboard) |

> Use only invented names. Do not use real Vitara staff names or emails anywhere.

---

## 3. Tech stack (use exactly this)

| Concern | Choice |
|---|---|
| Framework | React 18 + TypeScript (strict) + Vite |
| Styling | Tailwind CSS v3 + shadcn/ui |
| Routing | React Router v6 (data routers) |
| State | Zustand with `persist` (localStorage) + cross-tab sync (section 4.3) |
| Charts | Recharts |
| Tables | TanStack Table v8 (sort, filter, column visibility, pagination, row selection) |
| Forms | React Hook Form + Zod |
| Drag and drop | dnd-kit (form builder, approval builder, Kanban) |
| Maps | react-leaflet + OpenStreetMap tiles + leaflet-draw (polygons); turf.js for area/validation |
| Icons | lucide-react |
| Motion | Framer Motion |
| i18n | i18next + react-i18next (`en`, `fr`) |
| Money / phone / dates | `Intl.NumberFormat`, `libphonenumber-js`, `date-fns` + `date-fns-tz` |
| Tours | react-joyride |
| QR | `qrcode.react` (display); simulated scanning |
| CSV / Excel | `papaparse` (import), SheetJS `xlsx` (export) |
| PDF preview | Render receipts/contracts as HTML print views (`window.print()`) |
| Audio (simulated) | Web Audio waveform animation; bundled short sample audio |
| Deploy | Vercel static build, SPA fallback rewrite |

**Rules:** No backend. Simulate latency 300–800 ms in store actions. Every entity has `orgId`. All text via `t()`. All money via `formatMoney()`. All dates via `formatDate()` in the company time zone.

---

## 4. App architecture

### 4.1 Two apps, one codebase

| App | Route base | Who | Opens how |
|---|---|---|---|
| Public site | `/` | Visitors | Default |
| Web app | `/app/*` | All office roles, buyers | After sign-in |
| Mobile app | `/m/*` | Field agents, warehouse officers, supervisors | **New browser window**, phone-sized |

The mobile app follows the same design language (section 6): white screens, 56 px inputs with uppercase labels, full-width 52 px green buttons, illustrated splash and sign-in, glass bottom sheet for the Record (+) menu, and bottom tabs with a `brand-soft` active pill.

### 4.2 Opening the mobile app

- Top bar button **"Open mobile app"** (phone icon) and a link on every agent's profile ("Open as this agent").
- Opens with `window.open('/m?org={orgId}&user={userId}', 'treesyt-mobile', 'width=420,height=880')`.
- `/m` renders inside a centred 390 × 844 viewport on desktop (with a subtle device frame) and full-screen on real phones.
- Mobile has its own sign-in (phone number + 4–6 digit code, from company settings), its own navigation (bottom tabs), and its own offline mode.
- A **"Mobile previews"** page in the web app (`/app/help/mobile`) lists every mobile flow (M1–M12) with an "Open" button that launches that flow directly in the mobile window.

### 4.3 Shared state across tabs

- Stores persist to `localStorage` under `treesyt-demo:v1:{store}`.
- A `BroadcastChannel('treesyt-demo')` sends `{store, action}` messages; other tabs rehydrate that store. Fallback: `storage` event.
- Result: a purchase recorded in the mobile window appears in the web app within a second (with a toast "New purchase synced from Yaw Darko").
- **Mobile offline mode:** items saved while "offline" sit in a mobile-only `outboxStore` and are only written to the shared stores when the agent taps Sync (or turns online).
- Help menu → **Reset demo data** clears all `treesyt-demo:*` keys and reseeds (both tabs).

### 4.4 Simulated services (`src/services/`)

| Service | Simulates |
|---|---|
| `paymentGateway` | Name lookup, transfer, status callback (2–5 s), 1-in-12 failure, "unknown" status 1-in-40 |
| `smsGateway`, `emailGateway`, `pushGateway` | Writes to the Notifications outbox (viewable in the web app) |
| `aiService` | Scripted intents; optional real call if `VITE_ANTHROPIC_API_KEY` set |
| `speechService` | Returns scripted transcripts after a 3 s waveform |
| `scanService` | Returns next bag code from a queue, or a "missing/replaced" scenario |
| `geoService` | Dummy GPS near the community; polygon area via turf; deforestation check against a bundled fake "forest loss" GeoJSON |
| `jobScheduler` | Lets the user "Run now" any scheduled job (achievements, penalties, allowances, retention) |

---

## 5. Folder structure

```
src/
  app/                 App.tsx, router.tsx, providers, guards (auth, module, permission)
  public/              landing, book-a-demo, sign-up
  web/
    layout/            AppShell, Sidebar, TopBar, CompanySwitcher, RoleSwitcher, CommandPalette
    features/
      platform/ settings/ dashboard/ locations/ communities/ farmers/ farmer-groups/
      imports/ purchase-requests/ purchases/ expenses/ aggregators/ payments/
      reconciliation/ farmer-support/ recovery/ warehouses/ dispatch/
      sales-contracts/ traceboard/ nurseries/ trees/ plots/ carbon/ forms/
      workshops/ agents/ weekly-plans/ budgets/ retirements/ allowances/
      scores/ compensation/ agent-reports/ reports/ notifications/ sync/
      audit/ jobs/ help/ ai/
  mobile/
    layout/            MobileShell, BottomTabs, SyncBar, OfflineBanner
    flows/             auth/ home/ profiling/ farmers/ groups/ buying/ support/
                       recovery/ warehouse/ trees/ plots/ surveys/ workshops/ budget/ me/
  components/
    ui/                shadcn
    shared/            DataTable, PageHeader, FilterBar, StatCard, StatusBadge, MoneyText,
                       Drawer, ApprovalTimeline, ActivityFeed, FileDropzone, MapView,
                       PolygonEditor, QRBadge, AudioPlayer, SignaturePad, EmptyState,
                       ConfirmDialog, KanbanBoard, StepperWizard, PermissionGate, ModuleGate
  engines/             workflow/ numbering/ forms/ scoring/ rules/ rates/ metrics/
                       money/ units/ terminology/ templates/ permissions/ locations/
  services/            (section 4.4)
  stores/              one per domain + sessionStore + outboxStore
  data/                seed/ (per company), catalogs/, ai-intents.ts, geo/
  i18n/                en.json, fr.json
  types/
docs/COVERAGE.md
```

---

## 6. Design system

### 6.0 Look and feel (reference direction)

The product must feel **premium, calm and well crafted** — closer to a high-end consumer app than a typical admin panel. The visual reference is a split-screen sign-up page with: a deep forest-green primary button, near-black green headings, lots of white space, large soft-cornered inputs, small UPPERCASE letter-spaced field labels, underlined text links, a dark circular logo badge with a lime-green mark, and a full-height **painterly illustration** of nature (sky, clouds, fields, flowers) with a frosted-glass message card and carousel dots on top.

Apply that language across TreeSyt (do not copy the reference brand, logo or artwork):

- **Restraint:** white and very light neutral surfaces; green used for primary actions, active states and key numbers only. One primary button per view.
- **Generous spacing:** 24–32 px inside cards, 40–64 px between page sections on desktop. Never cramped tables — 52 px rows, 16 px cell padding.
- **Type hierarchy:** large, tight-tracked headings (32–40 px page titles, semibold, `-0.02em`), calm body text, small uppercase labels (12 px, semibold, `0.08em` tracking) for form labels, table headers and section eyebrows.
- **Soft geometry:** 12 px radius inputs and buttons, 16 px cards, 24 px glass panels and modals; hairline borders; very soft shadows (`0 1px 2px rgba(15,42,32,.04), 0 8px 24px rgba(15,42,32,.06)`).
- **Frosted glass** for overlays on imagery: `bg-white/70 backdrop-blur-xl border border-white/60`.
- **Illustration:** painterly, warm, hand-made feeling West African agricultural scenes — savanna with shea trees, cocoa farms under shade trees, farmers weighing sacks, a warehouse at dusk, a truck on a red-earth road, nursery seedlings. Used on: sign-in / sign-up / invite (left half), onboarding wizard, empty states (small spot illustrations), the public landing page, the buyer portal header, and the mobile splash and sign-in.
- **Details that signal quality:** focus rings in brand green at 3 px offset, smooth 150–200 ms transitions, skeletons shaped like the real content, numbers in tabular figures, helper text under inputs ("Sets the currency your company pays in"), clear inline validation, and microcopy in a friendly, confident voice.

### 6.1 Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `brand` | `#14583F` | `#3FAF7E` | Primary buttons, active nav, links, key figures |
| `brand-hover` | `#0F4732` | `#56C08F` | Button hover/pressed |
| `brand-soft` | `#EAF3EE` | `#14271E` | Selected rows, soft badges, active nav background |
| `lime` | `#B8E05A` | `#C6EA73` | Logo mark, AI sparkle, small highlights (never for text on white) |
| `badge-dark` | `#0F2A20` | `#0F2A20` | Logo circle, dark chips, tooltips |
| `ink` | `#0F2A20` | `#F1F5F2` | Headings and main text |
| `body` | `#33413B` | `#C9D4CE` | Body text |
| `muted` | `#6B7872` | `#93A39B` | Helper text, placeholders |
| `label` | `#3D4A44` | `#AFC0B7` | Uppercase labels |
| `surface` | `#FFFFFF` | `#111D18` | Cards, inputs, panels |
| `canvas` | `#F7F8F6` | `#0A1410` | App background (auth right side is pure white) |
| `line` | `#E3E7E4` | `#24352D` | Borders, dividers |
| `info` | `#2F6FDB` | `#6A9BEA` | In approval |
| `success` | `#1F8A4C` | `#4CC07F` | Approved, paid |
| `warning` | `#B7791F` | `#E0A94A` | Pending, on hold |
| `danger` | `#C0392B` | `#E8695C` | Rejected, failed, risk |
| `ai` | gradient `#14583F → #B8E05A` | same | AI bar border, AI answer card accent |

**Fonts:** Inter (UI; `font-feature-settings: "cv11","ss01","tnum"` for tables) and JetBrains Mono (IDs, codes, bag numbers). Base 15 px web, 16 px mobile. 8 px grid.

**Components (exact):**

| Element | Spec |
|---|---|
| Primary button | 52 px tall (40 px compact in tables), radius 12, `brand` fill, white 15 px semibold text, subtle inner highlight, full width in forms |
| Secondary button | White, 1 px `line` border, `ink` text; ghost and danger variants |
| Text input / select | 56 px tall (44 px compact), radius 12, 1 px `line` border, 16 px horizontal padding, placeholder `muted`; focus: `brand` border + 3 px `brand-soft` ring; icon buttons inside (eye, chevrons) |
| Field label | Above input, 12 px uppercase semibold, `0.08em` tracking, `label` colour, 8 px gap |
| Helper / error text | 13 px under input, `muted` / `danger` |
| Links | `ink` with 1 px underline offset 3 px; brand-coloured bold for primary link ("Sign in") |
| Cards | White, radius 16, hairline border, soft shadow, 24 px padding |
| Tables | Uppercase 12 px headers on `canvas`, 52 px rows, hover `brand-soft/50`, sticky header, zebra off |
| Badges | Pill, 24 px, 12 px medium text, soft tinted background + darker text |
| Sidebar | White, 264 px, logo badge top-left, section eyebrows uppercase, active item `brand-soft` pill with `brand` text and 3 px left indicator |
| Top bar | 64 px, white, hairline bottom border, company switcher as a pill with logo + flag |
| Drawer / modal | Radius 24 (modal), white, 32 px padding, backdrop `badge-dark/40` with blur |
| Glass card | `bg-white/70 backdrop-blur-xl`, radius 24, 40 px padding, used over illustrations; carousel dots (active = 32 px `brand` pill, inactive = 8 px grey dots) |

### 6.1a Authentication and onboarding screens (pattern)

- **Split screen** ≥ 1024 px: left 50% full-height illustration with a glass card carousel (3 slides, auto-advance 6 s, dots clickable): "Know every kilo from farm to buyer." / "Pay farmers in minutes, in any currency." / "Set up your operation without writing code." Right 50% white with logo badge + "TreeSyt" wordmark top-left, "Need help? Contact support" top-right, form centred (max 440 px), legal text pinned at bottom.
- Below 1024 px: illustration becomes a 200 px header band; form below.
- Applies to: sign in, sign up, verify email, forgot/reset password, accept invite, choose company, SSO, 2-step code.
- **Sign-up fields** mirror the reference rhythm: FULL NAME, WORK EMAIL, COUNTRY (helper: "Sets your default currency, phone format and language"), PASSWORD (eye toggle), primary button "Create account", "Already have an account? **Sign in**", terms line.

### 6.1b Imagery assets

- Put illustrations in `public/illustrations/` (`auth-1.webp`, `auth-2.webp`, `auth-3.webp`, `onboarding.webp`, `buyer-hero.webp`, `mobile-splash.webp`, plus `empty-*.svg` spot illustrations).
- Benjamin will supply the final painterly illustrations. Until then, Claude Code must build **placeholder art in code**: layered SVG landscape (sky gradient `#2F7FC8 → #9CC8EE`, soft cloud blobs, rolling green fields, a few stylised shea/cocoa trees, warm sun glow) with a subtle grain overlay, so the layout and glass effect look right from day one. Never use stock photos or another brand's artwork.

Radius scale: 8 (chips inside tables) / 12 (inputs, buttons) / 16 (cards) / 24 (modals, glass panels) / 999 (pills).

**Company branding override:** a company's primary colour and logo (Settings → Branding) replace `brand` and the logo in the top bar, emails, receipts and the buyer portal.

### 6.2 Shared patterns

- **List page:** PageHeader (title, one-line description, primary action, "?" tour) → FilterBar (search, filters, saved views, date range) → DataTable (column picker, bulk actions, export) → pagination. Table → stacked cards under 768 px.
- **Detail:** right drawer (640 px) with tabs; "Open full page" link. Full page on mobile widths.
- **Create / edit:** drawer for short forms, StepperWizard for multi-step.
- **Kanban toggle** on every workflow list (columns = workflow steps).
- **ApprovalTimeline** on every approvable record.
- **ActivityFeed** tab on every record.
- **Status colours:** Draft grey · Pending amber · In approval blue · Approved green · Active/Activated teal · Paid/Disbursed solid green · Completed/Reconciled dark green · Rejected red · On hold amber outline · Failed red outline · Unknown purple.

### 6.3 Motion

Page fade+rise 150 ms; list stagger 30 ms; stat count-up; drawer slide 200 ms; success tick on approve/pay; skeleton loaders; Kanban drag with spring.

### 6.4 Responsive

Web: 1440 / 1280 / 1024 / 768 / 390. Sidebar → icon rail at 1024 → sheet menu at 768. Dashboards fill full width. Mobile app designed at 390 × 844, works 360–430.

### 6.5 Tours and help

Every page: "?" button runs a 3–6 step tour; auto-runs first visit per session. Help menu: Replay tour, Mobile previews, Knowledge base, Keyboard shortcuts, Reset demo data, What's configurable here (opens a side sheet listing the settings that affect this page, with links).

---

## 7. Web navigation map

Items appear only if the module is on and the user has a view permission. Terms in *italics* follow company terminology.

```
Dashboard
Ask operations (AI)                          /app/ai
Farmers & communities
   Communities                               /app/communities
   Farmers                                   /app/farmers
   Farmer groups                             /app/groups
   Data quality                              /app/data-quality
   Imports                                   /app/imports
Buying
   Purchase requests                         /app/purchase-requests
   Farmer purchases                          /app/purchases
   Expenses (PRE)                            /app/expenses
   Aggregator purchases                      /app/aggregators
   Reconciliation                            /app/reconciliation
Money
   Payments                                  /app/payments
   Wallets & balances                        /app/payments/wallets
Farmer support
   Support requests                          /app/support
   Recovery                                  /app/recovery
   Service providers                         /app/support/providers
Inventory & sales
   Warehouses                                /app/warehouses
   Inbound & discrepancies                   /app/inventory/inbound
   Outbound & transfers                      /app/inventory/outbound
   Stock counts                              /app/inventory/stock-counts
   Warehouse expenses                        /app/inventory/expenses
   Dispatch orders                           /app/dispatch
   Sales contracts                           /app/sales-contracts
   Traceboard                                /app/traceboard
Trees & land
   Nurseries                                 /app/nurseries
   Seedlings                                 /app/seedlings
   Tree monitoring                           /app/trees
   Plots & mapping                           /app/plots
   EUDR compliance                           /app/eudr
   Carbon projects                           /app/carbon
Forms & training
   Forms & surveys                           /app/forms
   Workshops                                 /app/workshops
Field team
   Agents                                    /app/agents
   Weekly plans                              /app/weekly-plans
   Budget requests                           /app/budgets
   Retirements                               /app/retirements
   Carry-forwards                            /app/carry-forwards
   Monthly allowances                        /app/allowances
   Scores                                    /app/scores
   Commissions                               /app/compensation
   Agent reports                             /app/agent-reports
   Field activity map                        /app/field-activity
Reports                                      /app/reports
Notifications                                /app/notifications
System
   Sync logs & devices                       /app/sync
   Audit log                                 /app/audit
   Scheduled jobs                            /app/jobs
Settings                                     /app/settings/*
Platform                                     /app/platform/*  (platform owner)
```

Top bar: company switcher · global search / command palette (⌘K) · Ask AI · language EN/FR · theme · notifications bell · Open mobile app · role switcher avatar.

---

## 8. Shared configurable engines

These are pure TypeScript modules in `src/engines/`, each with unit tests (Vitest). Every feature uses them instead of hard-coded logic. Each engine is driven by a settings object stored per company.

### 8.1 Workflow engine (`engines/workflow`) [Scope 4.1, 4.3, 4.4, 6.1, 6.2, 7.1, 3.2, 3.3]

- **Definition** per company and document type:
  `{ docType, statuses[], steps: [{ id, name, roleIds[], permission, condition?, parallel?, minApprovals?, allowEditAmount?, slaHours? }], transitions, onApprove side effects, onReject behaviour, holdAllowed, rejectReasonRequired, autoApproveFirstStep? }`
- **Conditions:** `total > X`, `commodity in [...]`, `region in [...]`, `price above list by > N%`, `agent flagged`.
- **Separation of duties:** option "the same person cannot approve two steps" and "requester cannot approve".
- **API:** `getAllowedActions(record, def, user)`, `apply(record, action, user, payload)` → new record + activity events + notifications.
- **Doc types:** purchase request, PRE expense, aggregator purchase, aggregator expense, farmer support request (per support type), recovery request, inventory repayment, warehouse expense, dispatch order, sales contract, weekly budget request, retirement review, monthly allowance, commission period, survey publish, farmer group score review, user invite, plot verification.
- **Vitara template** reproduces today exactly (e.g. PRE: auto step 1 + levels 2–4).

### 8.2 Numbering engine (`engines/numbering`) [Scope 1.4, 4.1, 11.4]

Pattern tokens: `{prefix} {yy} {yyyy} {mm} {yymm} {seq:n} {initials} {orgCode} {region} {district} {community} {commodityCode} {clientCode}`. Sequence scope: per company / per year / per month / per client / per agent. Live preview. Doc types: purchase request (CS), purchase (P), PRE, aggregator purchase (ACS), aggregator expense (ACSPRE), warehouse expense (WSPRE), support request (PF), recovery batch (RR), sales contract (SC), dispatch order, sale number, weekly budget (WAB), monthly allowance (MMA), bulk payment (BLKPUR), seedling code (TS), nursery batch, farmer ID, community code, survey response ID.

### 8.3 Form engine (`engines/forms`) [Scope 2, 9.1]

Schema for any form: sections, questions, question types (section 9 G1), validation, show-if logic (AND/OR, operators), repeat groups, calculated fields, option lists (shared), translations per language, **binding** (standalone survey, or profile form for farmer / community / farmer group / nursery / plot / plot monitoring / tree monitoring / nursery monitoring / workshop feedback / recovery feedback / agent report), and **field mapping** to core record fields. Renders identically on web (`<FormRenderer>`) and mobile (`<MobileFormRenderer>`). Versioned: publishing creates version n+1; records keep the version they were captured with.

### 8.4 Scoring engine (`engines/scoring`) [Scope 2.2, 2.3, 2.4, 3.3]

Score model per company and entity (community, farmer, farmer group, agent per agent type, manager): components `{ name, metric, rule: boolean | linear-to-target | bands | manual, target, weight, bands[] }`. Weights must total 100 (validation). Period: year / season / quarter / all-time. Versioned. "Recalculate now" button. Manual components create a review task.

### 8.5 Metric engine (`engines/metrics`) [Scope 3.3]

Metric definition: `{ key, label, source entity, filter, aggregate: count | sum | distinct, field, unit, attribution: planned communities | anywhere, date field }`. Used by weekly-plan achievement, scores, commissions, dashboards and the AI assistant.

### 8.6 Rules engine (`engines/rules`) [Scope 2.3]

Data-quality rule: `{ entity, field, operator, value, crossField?, duplicateScope: company | community, severity: info | warning | block, enabled }`. Runs on create/sync; writes flags with reasons.

### 8.7 Rate-card engine (`engines/rates`) [Scope 3.3]

Commission and allowance rates: `{ agentTypeId, metricKey, unit per (e.g. per 100 kg), rate Money, eligibility conditions[], effectiveFrom, effectiveTo }`.

### 8.8 Money, units and fees (`engines/money`, `engines/units`) [Scope 1.5, 5.2, 5.4]

`formatMoney(minor, currency, locale)`, `toMinor()`, currency minor-unit table (GHS 2, XOF 0, USD 2, EUR 2, KES 2, NGN 2). Units table with conversions (kg, g, t, bag, lb, acre, ha). Fee calculator from fee tiers `{ provider, minAmount, maxAmount, type: percent | flat, value, cap, payer: company | payee }` plus taxes.

### 8.9 Loan engine (`engines/loans`) [Scope 6.2]

Loan terms `{ interestType: none | simple | compound, period: daily | monthly, rate, graceStarts: window end | disbursement, penalty: { type: one-time-percent | late-percent | flat, trigger: on cash repayment | on late, rate }, waterfall order, settlementTolerance, rounding: up | nearest, maxCycles }`. Functions: `buildLedger(principal, terms, window, repayments[], asOf)` → rows (date, charge, payment, principal, interest, penalty, balance), `quote(asOf, mode)`. Vitara template = 5% monthly compound after window, 15% one-time cash penalty, waterfall penalty → interest → principal, tolerance 1 minor unit.

### 8.10 Terminology and i18n (`engines/terminology`) [Scope 1.5]

`term('agent')` returns the company's word ("Agent", "Délégué", "Field officer"), plural forms, in the active language. All UI strings via i18next; terminology tokens can appear inside strings (`"Assign {{term.agent}}"`).

### 8.11 Templates (`engines/templates`) [Scope 10.2]

Email / SMS / push / receipt / contract templates with variables (`{{farmer.name}}`, `{{amount}}`), per language, with company branding. Preview pane renders a realistic email, phone SMS bubble, push banner or printable receipt.

### 8.12 Permissions and modules (`engines/permissions`) [Scope 1.3, 1.4]

Permission catalogue grouped by module and sub-module (seed from today's 99 permissions, renamed in plain language, plus new ones). `can(user, permission, orgId)`. `<PermissionGate>` and `<ModuleGate>` components; route guards. Plan entitlements limit which permissions a company can grant.

### 8.13 Location hierarchy (`engines/locations`) [Scope 2.1]

Per country: ordered levels with labels (GH: Region → District → Community; CI: District → Région → Département → Village). Tree data, codes per level, GeoJSON optional per node. Company-specific zones (named groups of nodes). Agents assigned to many nodes.

### 8.14 Activity log (`engines/activity`) [Scope 10.3]

`log(orgId, entity, entityId, key, params, actorId, meta: {device, gps?})`. Rendered with `t('activity.'+key, params)`. Immutable.

### 8.15 Notification rules (`engines/notify`) [Scope 10.2]

Rule: `{ eventKey, channels[], recipients: roles | record owner | specific users | buyer admins, templateId, enabled }`. Emitting an event writes items to the in-app inbox and the simulated outbox.

---

## 9. Web app — feature specifications

Format for each feature: **Screens**, **Fields / columns**, **Actions**, **Statuses**, **Configurable via**, **Mobile link**, **Audit note** (what changes vs today).

### A. Access, platform and company setup

#### A1. Public site and sign-up [Scope 1.2, 10]

- **Landing page** (`/`): product story, modules overview, "Book a demo", "Start free trial", "Sign in".
- **Book a demo / Contact us** form: first name, last name, email, phone (country picker), business name, industry, message, type (Contact us / Book a demo). Submit → confirmation screen; entry appears in Platform → Leads.
- **Self-service sign-up** (StepperWizard): account (name, work email, password with strength meter) → verify email (6-digit code screen; code shown in a demo toast) → company basics (name, country, currency auto, language auto) → accept terms → lands in the onboarding checklist (A3).
- **Audit note:** today `/register` creates an unusable account (no role, no verification); book-a-demo goes to a hard-coded email.

#### A2. Sign-in and security [Scope 1.2]

- **Sign in:** email + password; "Sign in with SSO" (company domain lookup → fake IdP screen); 2-step code screen if enabled; "Remember this device".
- **Company picker** if the user belongs to several companies.
- **Forgot password** → email sent screen → reset link page (expired-link state) → new password with company policy shown.
- **Accept invite** page (separate from reset): set name, password, accept terms.
- **Session timeout** warning modal (company setting).
- **My account:** profile, phone, language preference, password change, 2-step setup (QR + codes), active sessions list with "Sign out this device" / "Sign out all".
- **Statuses:** user Invited / Active / Locked / Deactivated.
- **Audit note:** tokens never expire today, no 2FA/SSO, invite and reset share one flow.

#### A3. Platform console (platform owner) [Scope 1.1]

- **Companies list:** name, logo, country(s), type (Supplier / Buyer / Both / Partner), plan, modules count, active agents, farmers, status (Trial, Active, Suspended, Expired, Deactivated), created. Actions: View, View as company, Suspend, Reactivate, Change plan.
- **Company detail:** usage charts (agents active, records synced, payouts), modules, plan, admin contacts, data-sharing grants, audit.
- **Add company wizard** (7 steps): 1 Describe (free text + **AI draft** fills the rest) → 2 Basics (name, legal name, type, countries multi-select, currency, language, time zone, week start) → 3 Plan & modules → 4 Template (start from Vitara template / blank / sector template: cocoa, cashew, shea, grains, coffee) → 5 Commodities → 6 Approvals → 7 Invite admin(s) → Review → Create. New company gets a **setup checklist** on its dashboard.
- **Plans:** plan list (Starter, Growth, Enterprise) with module bundles, limits (agents, farmers), and permission ceiling.
- **Global catalogues:** countries (ISO list, currency, dial code, default language, location level labels), currencies, global commodity list, question types on/off, permission catalogue, SMS/payment providers available per country.
- **Leads:** book-a-demo and sign-up submissions.
- **Platform audit:** all admin actions across companies.
- **Audit note:** today org 21 is the hidden platform owner and onboarding has no permission check.

#### A4. Company settings [Scope 1.1–1.5, all "Configurable via" items]

Left sub-navigation; every page has Save (toast + audit event), "Reset to template", and "Where this is used" links.

| Page | Contents |
|---|---|
| Company profile | Legal name, trading name, registration and tax ID, address, phone, email, website, countries, currency, default language, additional languages, time zone, week start, fiscal year start, company code (used in numbers) |
| Branding | Logo, primary colour, email header/footer, receipt footer, social links, signature name ("The Sales Team"), sender name and reply-to; live previews of email, receipt and buyer portal |
| Plan & modules | Module cards with on/off (within plan), dependencies warning (e.g. Recovery needs Farmer support), sub-features toggles |
| Locations | Level labels, tree editor (add region/district/community), codes, import from CSV, map boundaries; zones |
| Commodities | Name (per language), code, aliases/spellings, HS code, default unit, allowed units, quality parameters (moisture %, FFA, etc. with min/max), grades, aggregator threshold (kg), farmer-sourcing max (kg), scoring inclusion |
| Units & packaging | Units and conversions; packaging profiles per commodity (bag type, min/max kg, tare, tag type QR/NFC/none, per-bag vs lot) |
| Price lists | Commodity × region/zone × grade × effective dates; price per unit; tolerance %; premiums (organic, certified); approval of price changes; history |
| Approvals | Visual builder per document type (8.1): steps as cards, drag to reorder, role picker, condition builder, parallel toggle, auto-approve toggle, separation-of-duties toggles; live flow diagram |
| Numbering | Pattern builder per doc type with live example and next number |
| Payments | Providers per country (MTN MoMo, Telecel Cash, AirtelTigo Money, Orange Money, Wave, M-Pesa, Bank transfer, Cash with proof): credentials (masked), wallet name, on/off; fee tiers table; taxes; who pays; extra charges list (e.g. transport); per-payment and daily limits; maker/checker toggle; bulk batch size |
| Buying rules | Sourcing models per commodity (agent cash advance / direct farmer payment / both); partial disbursements allowed + max count; reconciliation tolerance (amount and %); write-off limit; debt policy (block / warn / deduct) with minimum; evidence required (scale photo, voice note, GPS, signature); price override reason required |
| Support & loans | Support types catalogue (see F1), ability-to-pay options, loan terms (8.9), recovery window defaults, repayment modes, debt blocking |
| Inventory rules | Loss tolerance per commodity and movement type; transfer weight bounds; stock count frequency and basis; liability rules (who pays, price basis, include logistics cost) |
| Field team | Agent types (name, label, score model, rate card, budget eligibility, data visibility rule, required fields), reporting lines settings, weekly plan rules (week start, min/max days, plan ahead weeks), budget cost categories (fuel, airtime, per diem, lodging; min/max per trip/day/week; receipt rules), carry-forward and penalty policy (bands), monthly allowance types, unused-funds reasons, report issue categories and consequences |
| Data quality | Rule list (8.6) with test-on-sample button |
| Forms | Which form is bound to each profile (links to Forms builder) |
| Farmer ID & codes | Farmer ID pattern, community code pattern, seedling code pattern |
| Biometrics & consent | Thumbprint capture on/off, consent type (audio / signature / tick box), consent text per language, NFC cards on/off, card key status (server-held) |
| Roles & permissions | Roles list (with user count), create/copy role, permission matrix grouped by module with search, "compare roles" view |
| Users | Invite (single, bulk CSV), list with role per company, status, last active; deactivate; remove from company; resend invite |
| Terminology | Term overrides per language (Agent, Community, Farmer group, Purchase request, PRE, Ticket, Warehouse officer…) |
| Notifications | Event × channel × recipients grid (8.15); template editor (8.11) |
| SMS & email | SMS provider per country, sender ID, OTP length and expiry; email domain/sender |
| Integrations | API keys (create/revoke, scopes), webhooks (event, URL, secret, test delivery, delivery log), export to accounting (placeholder) |
| Security | Session length, 2-step required for roles, SSO (SAML/OIDC metadata), password policy, IP allow list |
| Data & privacy | Retention per data type (sync logs, audio, photos), data-sharing grants with other companies (scope: farmers, communities, purchases, traceability), export all data, delete company request |
| Mobile app | Which tiles show per agent type, offline limits, app version minimum, OTP login method |

#### A5. Company switcher and data sharing [Scope 1.1, 2.3 shared farmers, 7.3]

- Switcher lists companies the user belongs to; shows type and country flag.
- **Data-sharing grants:** Company A grants Company B read access to selected farmers/communities/orders. Shared records show a "Shared by Vitara" chip and are read-only; each company's own attributes and scores live separately.

### B. Dashboard and AI

#### B1. Home dashboard [Scope 10.1]

Top to bottom, full width:

1. **Ask your operations** bar (B2) with 4 suggested chips.
2. **Setup checklist** card (only for new companies).
3. **KPI row** (configurable, default 6): purchased volume, spend, farmers paid, open purchase requests, cash with agents, reconciliation gap. Click → filtered list.
4. **My approvals** queue: everything waiting for the current user across all doc types, with inline Approve / Hold / Reject.
5. **Charts:** purchases by week (12 weeks, stacked by commodity), volume by commodity (donut), top communities (bar), payouts by provider (bar), recovery progress (gauge), stock by warehouse (bar).
6. **Map:** communities, warehouses, active agents (last GPS), plots.
7. **Alerts:** risk flags, failed payments, discrepancies, overdue retirements, data-quality issues.

- **Customise dashboard:** drag widgets from a widget library (every module contributes widgets), resize, save per user or as the company default. Role-based default layouts.
- **Module dashboards** (each module has its own, listed in its section) use the same widget system.

#### B2. Ask your operations (AI assistant) [Scope 10.5]

- Bar on the dashboard + full page `/app/ai` with conversation history.
- Scripted intents (`src/data/ai-intents.ts`, ≥ 20): agents holding most cash; top communities this month; farmers with overdue loans; requests priced above list; late reconciliations; warehouses with open discrepancies; agents below 40% target; payouts failed this week; recovery rate by district; plots missing polygons (EUDR); farmers without consent; stock available for contract SC-…; buyer orders in transit; nursery survival by batch; commissions pending approval; budget requests waiting; top suppliers by volume; women share of suppliers; carbon project tree survival; data-quality issues by agent.
- Answer card: one-sentence answer, table or chart, "Open in …" deep links, "Explain how this was calculated" (shows the metric definition), "Export".
- Respects permissions and company (never shows another company's data).
- **AI elsewhere:** risk flags on approvals (D1, D3, H), AI draft for company setup (A3), AI draft a form from a description (G1), AI summary on agent profile, AI anomaly detection on retirements ("receipt total looks duplicated"), AI suggested price list from recent purchases.

### C. Farmers, communities and groups

#### C1. Locations [Scope 2.1]

- **Locations explorer:** tree on the left (by company levels), detail on the right: code, parent, map boundary, counts (communities, farmers, agents, plots).
- Add / edit / move node, import CSV, draw boundary.
- **Zones:** create named zones from nodes (e.g. "Wa catchment"); used in price lists, agent assignment and reports.

#### C2. Communities [Scope 2.2]

- **List:** code, name, location path, population, farmers count, groups count, agent(s), score, profiling date, quality flags, shared chip. Filters: location, agent, score band, has groups, flagged.
- **Detail drawer tabs:**
  - Overview: map pin, contact person, code, score with breakdown (from score model).
  - Profile: answers from the company's community profile form (Vitara template reproduces today: organised groups + number, VSLA available, group leaders / membership list / meeting / contribution / payment records, partnership agreement, reliable water + source, amenities, land for nursery, land for tree planting, community groups).
  - Leaders: name, role (company list), phone; add / edit.
  - Documents: type (company list: membership list, meeting records, contribution records, payment records, partnership agreement…), file preview, uploaded by/when.
  - Farmers, Groups, Purchases, Workshops, Trees & plots, Activity.
- **Create / edit** community on web (same form as mobile M3).
- **Community map** (`/app/communities/map`): all communities with score-coloured pins, clustering, filters.
- **Community dashboard:** total profiled, average farmers per community, communities bought from, top 3 by farmers, top 3 by score, profiling over time.
- **Community score** (scoring engine). Vitara template: Profile 20 (VSLA 5, leaders 5, membership list 5, records 3, agreement 2) + Purchases 35 (8,700 kg target) + Training 15 (4 workshops target, fixed to count workshops correctly) + Trees 30 (planted 350 → 5, alive 350 → 15, health 100 → 5, community parkland → 5).
- **Audit note:** fixes code regenerated on every sync, duplicated groups, pivot score never recalculated, edits not company-scoped.

#### C3. Farmers [Scope 2.3]

- **List:** photo, farmer ID, name, gender, age, community, phone, primary crop, group, agent, score, consent ✓, thumbprint ✓, NFC card ✓, quality status, outstanding loan, shared chip. Saved views ("Women farmers", "No consent", "Blocked by debt").
- **Register farmer (web):** renders the company's farmer profile form. Core fields always: first/last name, gender (company list), date of birth/age, phone (validated by country), location, community, registration date. Vitara template reproduces today's fields: marital status, number of children, household size, has mobile phone, income sources (primary/secondary), crops (primary, secondary, other), language, education level, reads/writes English, spouse name/phone, land size (unit from settings), land ownership, has access to farm land, assets in household / owned, farmer group, children (repeat group: name, age, education), ID type and number, alternative phone.
- **Detail drawer tabs:**
  - Profile (form answers, edit → creates a new version, history of changes).
  - Identity: photo, ID card image, thumbprints (left/right status), consent (audio player / signature image / tick), NFC card (number, status Issued / Replaced / Revoked, issue new card, revoke).
  - Purchases (list + total by commodity), Payments, Support & loans (with ledger link), Trees & plots (map), Trainings, Surveys answered, Groups, Score (breakdown + history), Activity.
- **Farmer ID** generated by pattern (Vitara `{community}-{initials}-{seq}` e.g. `WA-014-AI-0023`; Kakao Ivoire `KI-{region}-{seq:5}`). Option "Import existing IDs".
- **Data-quality** chip with reasons; "Resolve" opens C5.
- **Farmer dashboard:** totals, gender split, age bands (configurable), education levels (company list), primary income breakdown, average household size and children (real average — no 5.0 constant), registrations over time, by agent.
- **Exports:** farmers list (column picker), farmer profiling report by agent.
- **Duplicate check** within company (phone, ID number, thumbprint simulated) shown at registration with "Possible duplicate: Abena Issah (WA-014-AI-0023)" → merge or continue.
- **Audit note:** fixes FIN bug, payload-supplied company/user, 'N/A' defaults, global duplicates, non-scoped detail.

#### C4. Farmer groups [Scope 2.4]

- **List:** name, type (company list: Cooperative, VSLA, Women's group, Producer group…), community, members, women %, leaders, established, payment option, score, score status (Pending review / Completed).
- **Detail tabs:** Profile (group type's form; Vitara template includes date established, membership composition, number of members/women/men, has organised leadership, took previous loan, average production per year with commodity + unit — replaces "shea bags"), Members (proper membership: farmer, role, joined, left; add/remove), Leaders (name, phone, position, gender), Documents (contribution records, meeting records, others), Payment details (mobile money number/name/network, bank name/account, will accept MoMo SIM), Support requests, Purchases (by members), Score, Activity.
- **Scorecard:** automatic criteria + **manual review criteria** (Vitara: meeting minutes 1–4, contribution records 1–18). Uploading a new record document resets that manual score and creates a review task; reviewer enters a score with a note; status → Completed. Recalculation replaces (never adds to) old values.
- **Savings group (VSLA) sub-module** (toggle): savings cycles, member contributions, loans, repayments, share-out. Simple ledger screens.
- **Audit note:** adds company column, real membership table, commodity-neutral production, fixes score inflation and volume band edge.

#### C5. Data quality review [Scope 2.3]

- Queue of flagged records (farmers, communities, groups) with rule, severity, agent, date.
- Bulk actions: assign to agent for fixing (sends a mobile task), mark as valid (with reason), re-check.
- Rules summary chart: issues by rule, by agent, trend.
- Vitara template rules reproduce today: age 18–100, household 1–20, duplicate phone (company), duplicate ID number (company, ignoring empty), missing consent, children education vs age, child older than farmer; and the Vitara-specific ones (language "ewe", education "tertiary", asset "tractor") as **disabled by default** with a note.

#### C6. Imports [Scope 2.5]

- **Import wizard** for: communities, farmers, farmer groups, members, leaders, recoveries, warehouse loads, price lists, locations, users, agents.
- Steps: choose type → download template (generated from the company's current form) → upload CSV/XLSX → map columns (auto-match, drag, transform rules e.g. "add leading 0", "parse dd/mm/yyyy") → match locations (by name or code, fuzzy suggestions) → validate & preview (row errors, warnings, duplicates) → import → result report (created, updated, skipped, download error file).
- Imports history list with who/when/counts; undo last import (demo).
- **Audit note:** today imports use fixed column positions, raw inserts and one is unauthenticated.

### D. Buying

#### D1. Purchase requests [Scope 4.1]

- **List / Kanban:** number, agent, community, commodity, grade, volume + unit, unit price, list price, variance %, total, sourcing model (Cash advance / Direct farmer payment), status, current step, disbursement status, reconciliation status, age, risk flag. Tabs: All, Waiting for me, Upcoming (planned date ≥ today), Past, Archived.
- **Create (web or mobile M5):** community, commodity (catalogue), grade, unit (allowed units), volume, planned purchase date, unit price pre-filled from price list (editable within tolerance; override reason required beyond), sourcing model, notes.
- **Detail drawer tabs:** Summary (amounts, price vs list chart), Approvals (timeline), Disbursements (tranches), Purchases (farmer purchases under this request with totals), Expenses (PREs), Reconciliation, Receipts (agent signature), Files (proof images), Activity.
- **Actions (permission-gated, workflow-driven):** Submit, Approve, Hold, Reject (reason), Update price (re-approval if above list), Confirm rate, Confirm disbursement (full / partial: amount, weight; reason if full ≠ total), Pay by mobile money (E1), Mark funds disbursed manually (proof upload), Agent confirms funds received (mobile), Activate ticket (direct farmer payment), Archive, Export.
- **Statuses (Vitara template):** Pending → Management approved → Finance approved → Rate confirmed → Full / Partial disbursement → Funds received → (Ticket activated path) → Reconciled; plus Not approved, On hold, Price update, Archived.
- **Risk flags (AI):** price above list by N %, agent cash held above limit, agent flagged, many requests same community same day.
- **Receipt:** printable receipt from company profile (sender = company legal name), agent signature image.
- **Configurable via:** Approvals, Numbering, Price lists, Buying rules, Notifications.
- **Audit note:** replaces free-text commodity/price, unchecked permissions, any-status transitions, global number sequence, hard-coded "Sommalife Limited".

#### D2. Farmer purchases and bags [Scope 4.2]

- **List:** purchase number, date, farmer, community, agent, request, commodity, quantity, unit price, amount, amount paid to farmer, payment status (Not paid / Pending / Paid / Failed), bag code(s), consolidated bag reference, evidence icons (scale photo, voice note, GPS, signature), linked plot.
- Tabs: Cash-advance purchases, Direct-payment purchases (ticket activated), Unpaid.
- **Detail:** farmer card, amounts, bag(s) with QR, consolidated bag contributions (several farmers in one bag, total within packaging bounds), scale photo, voice note player, map pin, plot link (EUDR), payment attempts, wallet details (edit with permission, locked after payment starts), activity.
- **Bulk pay:** select up to N (company setting) unpaid purchases with the same wallet in the same request → E1 bulk flow.
- **Debt check banner** on farmers with overdue loans per policy (block / warn / deduct — deduct shows the deduction line).
- **Purchases dashboard:** total volume, spend, farmers bought from, average volume and income per farmer, smallholder vs aggregator split (thresholds per commodity), top 3 agents, top 3 communities, average cost per bag (from PREs), purchases over time.
- **Bag registry** (`/app/purchases/bags`): every bag code, commodity, weight, status (In stock / In transit / Out of stock / Replaced), current warehouse, history (purchase → PRE → inbound → transfer → dispatch), replacement log (old code → new code, weight variance, by whom).

#### D3. Expenses — PRE (logistics costs per bag) [Scope 4.3]

- **List:** PRE number, request, agent, expense type, cost per bag, bags, total, payee wallet, status, current level, payment status.
- **Create (mobile M5 or web):** purchase request, number of bags, cost discussed with logistics manager (yes/no), expense lines from the **company expense catalogue** (name, basis: per bag / per trip / per kg / flat, default rate, cap, requires payee wallet, requires bag scan), scanned bag codes when required, payee wallet.
- **Approvals:** workflow engine (Vitara template: auto step 1 then levels 2–4 with permissions Level 1–4; on hold resumes from previous step).
- **Disburse:** mobile money (E1) or manual proof; on success creates the warehouse **expected delivery** (H2) when the expense type is flagged "triggers inbound".
- **Receipt** printable. **Edit** only before first approval.

#### D4. Aggregator purchases (bulk from traders) [Scope 4.4]

- **Suppliers (aggregators) registry:** name, type (individual/company), address, phone, ID/KYC documents, payout methods (MoMo / bank with bank list per country), status (Pending approval / Approved / Blocked), purchase history. Approval workflow for new suppliers.
- **Aggregator purchase list:** reference (ACS), PO number, supplier, commodity, planned date, weight per bag, expected bags, expected volume (kg / t), unit price, total, deal currency + exchange rate, includes PRE cost, status (Pending / Approved / Rejected / Partially disbursed / Funds disbursed), order status (In transit / Delivered), payment status (Fulfilled / Receive refund / Refund supplier / Reconciled).
- **Create:** supplier (search or create inline), PO number (unique within company), commodity, bags, weight per bag, expected volume, price (from price list with override), PO file, weighbridge report (optional), deal currency.
- **Approve / reject** (workflow). **Disburse** part or full: provider payout (E1) or manual proof; cumulative amount validated ≤ total.
- **Aggregator expenses (ACSPRE):** number of bags + expense lines (company catalogue; Vitara template includes the 40 logistics items, e.g. Kia transport, Tricycle transport, Council ticket, Transport warehouse → Tema, Truck escort…), approve/reject/disburse.
- **Delivery & reconciliation:** delivery details (driver, contact, plate, bags and kg loaded, waybill) → In transit; proof of delivery (customer, bags/kg/t delivered, unit price, weighbridge report, invoice, quality test report) → Delivered; result computed with company tolerance; refunds (receive refund: new PO + bags + kg; refund supplier: amount + proof) → Reconciled. Money **and** volume reconciliation shown side by side.

#### D5. Reconciliation (purchase requests) [Scope 4.1]

- **List:** request, agent, money given, value bought, refunds, write-offs, gap, volume planned vs bought, status (Fulfilled, Overpaid, Refund agent, Receive refund, Reconciled; for direct-payment: Ticket activated / Partially paid / Fully paid), auto-matched chip, age.
- **Detail:** waterfall chart (given → bought → refunds → gap), purchases list, volume difference message in the right unit.
- **Actions:** Record agent refund (full / partial, proof required, optional "Collect by mobile money" simulated collection), Pay agent the difference, Write off (≤ company limit, permission, reason), Mark reconciled.
- **Tolerance** from Buying rules auto-reconciles small gaps.

#### D6. Commodities, units, prices (screens) [Scope 4.5]

Covered in Settings (A4) plus a read-only **Price board** page for managers: current price per commodity per zone, change history, chart of paid prices vs list (from purchases), AI "suggest new price".

### E. Money

#### E1. Payouts (T-Pay engine) [Scope 5.1, 5.2]

- **Payable types:** agent cash advance, PRE expense, aggregator purchase, aggregator expense, farmer support (group / farmer / supplier), single farmer purchase, bulk farmer purchase, weekly budget, monthly allowance, commission, refund to farmer, warehouse expense.
- **Pay modal (3 steps):** 1 Payees: wallet number, network auto-detected from the number, provider, **name lookup** ("Name on wallet: KOFI ADDO ✓" or mismatch warning) → 2 Charges: amount, provider fee, withdrawal charge (% or flat per tier; option "include withdrawal charges"), tax, extra charges (company list, e.g. transport 50.00), total, who pays → 3 Confirm (maker/checker: if enabled, a second user must approve before sending) → progress per payee → results (Successful / Failed with reason / Unknown → "Check status").
- **Statuses:** Pending, Awaiting checker, Processing, Successful, Failed, Unknown, Reversed.
- **Payments list:** reference, type, payable link, payee, provider, amount, fees, tax, total, currency, status, initiated by, approved by, date. Filters, stats cards (total paid, count, failed, by type, by provider), export.
- **Payment detail:** timeline (initiated, provider accepted, callback), raw provider response (simulated), retry, "mark as reversed".
- **Wallets & balances:** one card per provider wallet of the company (balance, last top-up, low-balance alert threshold), transaction list, "Request top-up" (simulated).
- **Limits & controls:** per-payment and daily limits per role; blocked if limit exceeded with explanation.
- **Audit note:** replaces MTN-only, single platform wallet, failing-on-lookup-error, global bulk lock, unscoped history.

#### E2. Collections and refunds [Scope 4.1, 6.2]

Simulated mobile-money **collection** request to an agent or farmer (refund of overpayment, cash recovery): send request → payee approves on phone (mobile window shows a prompt) → success.

#### E3. Money formatting and multi-currency

Every money value displays in the company currency; aggregator deals can show deal currency and converted company currency with the rate used.

### F. Farmer support and recovery

#### F1. Support types catalogue (Settings → Support & loans) [Scope 6.1]

Per type: name, code, icon, recoverable (yes/no), required fields, unit (acres / ha / bags / money), input types and sub-types (Vitara template: Fertilizer, Agrochemical, Sack, Seed, Tool/Machine, Planter, Harvester, Others), needs service provider, payout method (group wallet / farmer wallet / supplier / in-kind), loan terms (if recoverable), evidence requirements (leader voice note, witness voice note, agreement, thumbprints, photo), approval workflow. Vitara template types: **Cash pre-finance** (recoverable), **Ploughing**, **Farm input**, **Agroforestry** (Nursery, Tree planting, Parkland).

#### F2. Support requests [Scope 6.1]

- **Board (Kanban)** with company columns (Vitara template: Pending scoring → Pending approval → Rejected → Agent confirmation → Pending disbursement → Disbursed → Fulfilled) and **list** view.
- **List:** PF number, farmer group, community, agent, primary / secondary service, farmers count, amount per farmer, total, ability to pay summary, approval status, disbursement status, fulfilment status (Pending / Partially fulfilled / Fully fulfilled).
- **Create (mobile M6 or web):** farmer group, primary and secondary services, agroforestry interest and type, GPS, per-farmer lines (farmer, service, amount / land size / input type + sub-type + quantity + supply date, ability to pay), leader and witness voice notes.
- **Scoring gate:** if the group has unscored record documents, the request sits in "Pending scoring" with a "Score group" button (opens C4 manual review).
- **Approval per service:** Cash (expected repayment volume per farmer), Ploughing (amount, service provider, payment arrangement, expected volume), Farm input (per type/sub-type quantity and amount, provider, arrangement, expected volume). Multiple services can be approved. Hold / reject with reason. Edit amount per farmer (logged with old → new in company currency).
- **Agent confirmation** (mobile): mark which farmers turned up; others become Rejected; farmer opt-outs (Declined); confirm group wallet.
- **Disbursement:** pay group wallet (E1, amount = confirmed farmers × amount), or pay individual farmers, or pay supplier; or manual proof (full / part).
- **Fulfilment:** per farmer proof (audio, optional witness, GPS) → Fulfilled; group fulfilment status computed.
- **Refunds for declined farmers:** amount, method, reference, document.
- **Detail tabs:** Summary, Farmers (per-farmer status table), Approvals, Payments, Fulfilment evidence (audio players, map), Assets (agreement, thumbprints), Recovery (if recoverable), Activity.
- **Dashboards:** All support, and one per type (Cash, Ploughing, Farm input, Agroforestry): farmers supported, amount disbursed, by district (top N configurable), by year (from first data year), ability-to-pay split, input types breakdown, agroforestry activities.

#### F3. Service providers [Scope 6.1]

Company-scoped list: name, category (from support types), inputs offered (type + option), location, phone, status; jobs history (support lines served), amounts paid.

#### F4. Recovery [Scope 6.2]

- **Recovery windows:** list and calendar of windows per programme / season / commodity / support type: name, start, end, status (Draft / Active / Closed), remark, days remaining. Overlap validation within the same programme. In-app banner on mobile + optional SMS/push reminders.
- **Recovery requests board:** Pending review → Finance review → Activated → Partially recovered → Fully recovered (+ Rejected). Batch IDs (RR-0001…).
  - Manager review: approve with recovery commodity (catalogue), unit price per unit, optional excess-purchase price; loan terms snapshot shown ("5% monthly compound after 30 Nov 2026; 15% cash penalty"); reject with reason (only while no repayments).
  - Finance activation: may change excess price (reason required); creates the linked **direct-payment purchase request** (commodity from programme, not shea by default) if the programme setting is on.
- **Farmer loan view (ledger):** principal, interest accrued, penalty, repaid (cash / produce), balance, settlement quote for today (cash vs produce), volume needed to clear, **ledger table** (date, event, principal, interest, penalty, payment, balance) and a balance-over-time chart. "What if" slider: quote at a future date.
- **Repayments list:** date, farmer, agent, mode (Cash / Produce / Mixed), weight + bag code, cash amount, value, excess purchase (kg, amount), receipt confirmation (Pending / Confirmed / N/A) with photo, status.
- **Cash confirmation** queue: finance confirms cash receipt photos.
- **Debt blocking**: farmers list "Blocked from selling" with reason and balance; policy from settings.
- **Overpayment refunds:** computed from the ledger (not just principal); pay via E1 or record manual.
- **Recovery experience feedback:** agent's rating of the group (company question set; Vitara template: experience Excellent → Very bad; "Would you suggest we lend again?" Yes / Maybe / No).
- **Recovery dashboard:** expected vs recovered (money and volume), recovery rate by district/agent/group, overdue balances ageing (0–30, 31–60, 61–90, 90+ days), interest and penalties earned.
- **Exports:** recoveries (company currency headings), ledger per farmer (print view).

#### F5. Legacy input allocations [Scope 6.2]

Read-only **Allocations archive**: past input/cash allocations (type, quantity, amount, repayment mode Money / Farm produce, voice notes), repayments linked to purchases, status (Fully / Partially / Not paid), per-farmer totals. Button "Migrate to support & loans" (demo: converts one allocation into a support record with a ledger).

### G. Forms, surveys and training

#### G1. Forms builder [Scope 9.1]

- **Forms list:** name, binding (Survey / Farmer profile / Community profile / Farmer group profile (per group type) / Nursery profile / Nursery monitoring / Tree monitoring (per species) / Plot profile / Plot monitoring / Workshop feedback / Recovery feedback / Agent report / Custom record), version, status (Draft / Test / Live / Closed), responses, owner, updated.
- **Builder layout:** left palette, centre canvas (sections + questions, drag to reorder), right settings panel, top bar (Preview web / Preview mobile (opens mobile window), Version history, Publish).
- **Question types:** Short text, Long text, Number, Decimal, Currency, Select one, Select many, Yes/No, Ranking, Rating (stars/numbers/checks, max ≤ 10), Likert (3–10 points, labels), NPS (0–10, labels), Date, Time, Date & time, Month-year, Year, Image (camera/gallery, max count), Audio, Video (≤ size), File, Signature, GPS point, **GPS polygon / walk boundary**, Scan code (QR/barcode), NFC tap, Thumbprint, Auto ID, Contact info, Email, Phone (country validated), **Record picker** (farmer / community / group / plot / bag), Location picker (company levels), Calculated (formula), Note (display only), **Repeat group**, Table (rows × columns).
- **Question settings:** label and help per language, required, required-if, default, placeholder, validation (min/max, length, regex, date range), options (inline or **shared option list**), "Other" option, randomise, show-if logic, **maps to field** (for profile bindings), sensitive (hide in exports), media limits.
- **Logic:** show/hide and jump-to with AND/OR groups; operators equals, not equals, greater/less than, between, contains, in list, is empty, is not empty, any/all selected; on any earlier question incl. multi-select; section-level logic; end form.
- **Shared option lists** page: crops, ID types, education levels, languages, marital status, income sources, assets, water sources, amenities, causes of death, pests… (Vitara template seeds these).
- **AI draft:** describe a form → generates sections and questions to edit.
- **Lifecycle:** Draft → Test (assign test users, test responses tagged) → Live → Closed; schedule start/end; versioned redeploys (responses keep version).
- **Assignment:** by role, agent type, team, location, or named users; target counts per agent / location; deploy to all agents.

#### G2. Survey responses [Scope 9.1]

- **Responses table:** response ID, form version, subject record (farmer/community/…), agent, date, GPS accuracy, status (Submitted / Approved / Rejected / Needs fix), completion %.
- **Response detail:** answers with media, map, subject link, review actions (approve, reject, send back with comment → mobile task), edit with audit.
- **Analytics:** per question summary by type (choice counts, averages, Yes/No, number stats, Likert distribution, NPS score), filters (date, agent, location), completion rate, responses over time, map of responses.
- **Export** (XLSX with company-chosen columns; sensitive fields masked by permission).

#### G3. Workshops and training [Scope 9.2]

- **Training catalogue:** topics (name per language, category: Agronomy / Conservation / Finance / Safety / Quality…, duration, materials, linked quiz form, target audience: farmers / groups / staff). Vitara template seeds today's 14 topics. Starter templates by sector.
- **Workshops list / calendar:** title (from catalogue), date, location, community, group, facilitator (agent), expected vs actual attendees, status (Planned / Held / Cancelled / Archived), images count, rating average.
- **Plan workshops (bulk):** location, then rows of topic, agent, group (optional), expected attendees, date, community.
- **Detail:** attendance list (farmer, method: NFC / QR / thumbprint / manual, rating, comment), photos, feedback form results, archive with remarks, edit rules (company setting).
- **Training dashboard:** created, held, upcoming, unique farmers trained, attendance by topic (chart), by agent, average rating.
- **Attendance eligibility rules:** only farmers in the community/group, allow non-farmer guests, min/max attendees for commission (links J9).

### H. Inventory, dispatch, sales and traceability

#### H1. Warehouses [Scope 7.1]

- **List / map:** name, type (Community store / Aggregation hub / Central warehouse / Port), location, officer(s), capacity, stock by commodity (bags, kg), utilisation bar, open discrepancies, status.
- **Detail tabs:** Stock (by commodity, by bag, ageing), Movements (in/out/transfer with before/after balance), Expected deliveries, Discrepancies, Stock counts, Expenses, Officers, Activity.

#### H2. Inbound (receiving) and discrepancies [Scope 7.1]

- **Expected deliveries:** created from paid PRE lines (or company trigger), with source agent, commodity, bags list (code, weight), total kg, status (Pending / Completed).
- **Receive** (web or mobile M8): per bag status Original / Missing / Replaced tag (new code) / Weight top-up; received weight; result Confirmed or Discrepancy.
- **Discrepancies list:** inbound, bag, type (Missing / Weight), expected vs received, variance kg and %, status (Open / Auto written off / Resolved), resolution type (Bag returned / Tag replaced / Missing weight returned / Paid by agent / Written off).
- **Auto write-off** under the loss tolerance (per commodity/movement) with a chip and an activity note.
- **Physical resolution:** returned bag, tag replacement, weight top-up bag allocated oldest-first across open weight discrepancies (allocation table shown).
- **Agent repayment:** expected amount breakdown (lost kg × price basis — blended for bags mixing loan produce and purchases — + share of logistics cost for missing bags if policy says so) → agent submits payment with proof (mobile or web) → finance review (approve full / approve partial leaving balance / reject with reason). Inbound status: Confirmed / Discrepancy / Needs resolution / Refund submitted.

#### H3. Outbound and transfers [Scope 7.1]

- **Outbound:** select bags (scan or pick) → type Outbound (to dispatch) or Transfer (to another warehouse + receiving officer) → stock decremented, bags "In transit" / "Out of stock".
- **Transfer receiving** at destination with the same per-bag statuses, weight bounds (packaging settings) and tolerance; pipeline result shown step by step (missing recorded, returns resolved, weight resolved, stock adjusted).
- **Transfers list:** from, to, bags, kg sent / received, variance, status (Transfer pending / Transfer complete).

#### H4. Stock counts [Scope 7.1]

Schedule (company frequency: weekly / monthly / ad hoc). Count by bag scan and/or weight. Expected vs counted, difference, status (Reconciled / Inconsistent), breakdown by agent and commodity, photos. Adjustment request (workflow approval) to correct stock.

#### H5. Warehouse expenses [Scope 7.1]

Types (company list; Vitara template: Inbound handling, Outbound handling, Maintenance), lines (expense, cost per bag/kg/flat, payee wallet), workflow approval (Vitara template 4 levels, no hard-coded system approver), disbursement (E1 or proof), payment status (Pending / Partial / Full / Rejected).

#### H6. Dispatch orders (load from warehouse) [Scope 7.2]

- **Order types:** Direct purchase (from communities/agents straight to buyer) and From inventory (selects pending outbounds, optionally linked to a sales contract; commodity must match).
- **Create:** client (buyer company), contract (optional), commodity, outbounds/bags, loading location, driver (name, phone, licence image), truck (plate, image), waybill, expected weight, impact metrics snapshot (women supplier share, children per farmer — company-configurable KPIs).
- **Approval** (workflow) → **Shipment tracking:** Pending → In transit (vehicle location + ETA updates) → Arrived → Delivered → Verified (+ On hold). Map with truck pin.
- **Verification:** weighbridge report, payment invoice, quality test (optional), delivered weight, bags delivered, unit price, amount → Verified → **sale number** generated (company sequence) → buyer notified → contract fulfilment updated.
- **Documents** tab with download log.

#### H7. Sales contracts [Scope 7.2]

- **List:** reference (SC), buyer, commodity, quantity (company unit, e.g. t), price per unit, currency, quality spec, payment terms, packaging, shipment window, delivery point, officer, status (Draft / Agreed / Order created / Fulfilled / Cancelled), fulfilment % (delivered weight, with tolerance).
- **Create / edit:** from **contract templates**; quality spec from the commodity's parameters (e.g. moisture ≤ 8%); payment terms from catalogue (Vitara template: 100% after delivery, 100% on delivery, 50/50, 30/70); packaging from catalogue (PP sacks, Jute sacks, Boxes); signed contract upload; officer by role.
- **Payment schedule:** generated from the terms (instalments with due dates), mark received, overdue alerts.
- **Detail tabs:** Terms, Orders (dispatches linked), Deliveries chart (contracted vs delivered), Payments, Documents, Timeline.
- **Printable contract** using company profile as seller.

#### H8. Traceboard (buyer portal) [Scope 7.3]

- **Two views of the same data:**
  - **Supplier view** (inside the supplier's app): buyers served, top customers, orders in transit, totals, chart by month, "Share with buyer" settings.
  - **Buyer view** (buyer persona, buyer company type, branded with the supplier's logo): dashboard (total weight, amount, orders, crops by weight, upcoming dispatches, farmers and communities sourced from, **impact**: women share, children impact, trees planted, plots mapped, EUDR compliance %, certifications), order list, order detail (order and sale number, kg and t, driver, vehicle, documents, delivery timeline, **trace to source**: communities and farmers map, plot polygons with EUDR status), document downloads (logged), "Request insights" form.
- **Access:** via data-sharing grants; buyer users invited by the supplier.
- **Notifications:** In transit, Delivered (action required), Verified — to buyer roles and the supplier's sales team (recipients by role), using company branding.
- **Audit note:** replaces the org-21 seller/buyer switch, Vitara-signed emails, the always-zero women metric and the unscoped order detail.

### I. Trees, land and climate

#### I1. Nurseries [Scope 8.1]

- **List / map:** name (community nursery), community, agent, GPS, fenced, water source, material, batches, seedlings potted / germinated / alive, germination %, survival %, community representative.
- **Detail tabs:** Profile (nursery profile form; Vitara template fields + representative name/gender/phone), Batches (batch number, species, quantity, potted, germinated, alive, disbursed), Monitoring (rounds), Images (profiling / primary / secondary monitoring), Agreement (establishment agreement file), Activity.
- **Monitoring schedule:** company rounds (Vitara template: Primary — poly bags, potted, germinated; Secondary 1…N — alive, dead, new germinations), due dates, overdue chips.
- **Batch history:** per batch germination and survival over rounds (chart).
- **Nursery dashboard:** nurseries, germination %, survival %, seedlings alive, by species, chart by day / month / year.

#### I2. Seedlings (inventory and assignment) [Scope 8.1]

- **Species catalogue** (Settings or here): name, code prefix, type (fruit, timber, shea grafted/ungrafted…), planting density per land type.
- **Seedling stock:** by species: sourced, in nursery, assigned to agents, allocated to farmers, planted, alive; unassigned balance.
- **Sourcing (supplier deliveries):** supplier (nursery / external), species, quantity, date, cost; generates codes (pattern) in the background (progress bar).
- **Assign:** to agent, to another company (transfer with consent), from nursery batch to farmer; quantity or code ranges; max per farmer rule.
- **Allocations list:** farmer, community, species, quantity, codes, date, agent; timeline per agent and per farmer.

#### I3. Tree monitoring [Scope 8.2]

- **List:** tree code, species, farmer, community, plot, date planted, last visit, round, state (Alive / Dead / Not found), height (number + unit), health score, issues (pests, livestock, fire), agent.
- **Detail:** visit history (form answers per species form; Vitara template fields: available, fenced, watered, mulched, livestock protection, rainfall pattern, height, rating, field type, current state, condition, pests, cause of death), photos, map.
- **Health score** computed from the species form (calculated question) and used by scores.
- **Tree map:** clustered pins coloured by state, plot polygons, filter by species/round.
- **Tree dashboard:** disbursed, planted, farmers with trees, alive %, average height, survival by planting cohort and species, by round.
- **Export** with configurable range limit.

#### I4. Plots and field mapping [Scope 8.3]

- **List:** plot ID, type (company list: Farmland, Community parkland, Concession, Block…), farmer (required for EUDR-relevant commodities), community, area (server-calculated, unit from settings) vs declared area, geometry (Point / Polygon), GPS precision, EUDR status, trees planted (linked seedlings, or density estimate), agreement ✓, last monitoring.
- **Detail:** map with polygon (edit vertices), validation results (closed ring, no self-intersection, ≥ 6 decimal places, polygon required if area > 4 ha, overlaps with other plots), area calculation, images, agreement file, linked purchases and lots, monitoring visits, activity.
- **Map a plot (web):** draw polygon or drop point; or import GeoJSON / KML.
- **Plot monitoring:** company questionnaire per land type (Vitara template: chemical additives, tree cutting, farming activities, livestock present / past, fenced, bushfire / recent bushfires, fire protection measures).
- **Mapping dashboard:** plots by type, total and average area, plots with polygons %, trees per plot, by agent.

#### I5. EUDR compliance [Scope 8.3]

- **Compliance overview:** for commodities flagged as EUDR-relevant (cocoa, coffee, rubber, soy, palm oil, cattle, wood): % volume traceable to plots, % plots with valid geolocation, % checked against deforestation (cut-off 31 Dec 2020), at-risk plots.
- **Deforestation check:** run check (simulated overlay with bundled forest-loss layer) → per plot result: Clear / Risk / Not checked, with map overlay.
- **Lots:** link purchases → bags → dispatch order; each lot lists the plots it came from.
- **Due diligence statement (DDS) export:** select dispatch order or lot → generates GeoJSON + summary PDF view (operator, commodity, HS code, quantity, country, plots geolocation, risk assessment) → "Submit to EU TRACES" (simulated success with reference number).

#### I6. Carbon projects [Scope 7.4]

- Projects inside an existing company: name, standard (Verra / Gold Standard / Plan Vivo / Internal), start date, baseline, species targets, linked communities/plots, monitoring plan, partner organisation (link to another company or external).
- Tree assignments to the project (species, quantity), survival tracking, estimated CO₂ (simple factor per species, editable), reports.
- **Audit note:** today creating a project creates a new company and an admin with any role, with no permission check.

### J. Field team

#### J1. Agents [Scope 3.1]

- **List:** photo, name, agent type (company list), phone, areas (multiple nodes), manager(s), warehouse, wallet (network, number, verified name), cash held (unreconciled), this week's target %, score, flags, last sync, app version, status.
- **Invite agent:** name, phone (country validated), agent type, required fields per type (areas, warehouse, manager), wallet → SMS code sent (outbox) → appears as Invited until first mobile sign-in.
- **Detail tabs:** Overview (KPIs, map of activity), Areas & manager (assign many areas, reporting line), Wallet (edit with permission; name lookup; change log), Purchases & requests, Cash position (advances, purchases, refunds, balance), Weekly plans & budgets, Scores, Commissions, Reports (non-compliance), Devices, GPS activity, Activity. "Open mobile app as this agent".
- **Reporting lines** page: org chart of supervisors → agents per company; drag to reassign (permission-gated).
- **Data visibility rules** per agent type (Settings → Field team) reflected in the mobile app.

#### J2. Weekly plans [Scope 3.2]

- **Plans list:** week, manager/team, activities, targets total, assignees, status (Draft / Published / Closed), achievement %.
- **Create:** week (current or up to N ahead), dates within the week (min/max days), activities from the company catalogue (Vitara template's 25), target per activity — same for all or **per agent**; assignees (team, agent type, named agents).
- **Publish** → assignees get push + plan appears in mobile; creates allowances (e.g. weekly airtime) per policy. **Amend** after publish (versioned) with notification.
- **Activity catalogue** (Settings): name, unit, needs community, metric definition (8.5), active.
- **Plan detail:** per-agent progress grid (activities × agents, achieved / target, colour scale), trips planned map.

#### J3. Budget requests [Scope 3.2]

- **List / board:** reference (WAB), agent, week, trips, fuel, airtime/allowances, other categories, total, manager decision, finance decision, payment status, deductions (carry-forward), net paid.
- **Detail:** trips table (date, community, activities with target slices, cost lines per category with limits shown), assignee check, previous-week retirement status (blocks if policy), approval timeline (manager → finance; amount override with reason), wallet (finance can edit before payment), deductions preview (outstanding carry-forwards), Pay (E1) or **Absorb with carry-forward** when deductions ≥ total.
- Statuses: Submitted → Manager approved / On hold / Rejected → Finance approved / On hold / Rejected → Paid (Closed) → Retirement opened.

#### J4. Retirements and receipts [Scope 3.2]

- **List:** request, agent, gross, fuel/categories, receipts submitted, approved amount, status (Pending submission / Pending finance review / Pending resubmission / Awaiting refund confirmation / Retired), carry-forward created.
- **Review:** receipts gallery per category (image/PDF, amount, date, duplicate warning by AI), approve / reject each with reason in one batch; agent resubmits rejected ones from mobile.
- **Unused funds:** agent declares unused with reason (company list) → expected refund → finance confirms one or more refunds with proof → Retired.

#### J5. Carry-forwards and penalties [Scope 3.2]

- **List:** agent, type (Under-spend / Performance penalty / Manual), source request, amount, applied, remaining, status (Pending / Partially applied / Fully applied / Waived), applications history.
- **Performance penalty run:** Scheduled jobs (K6) or "Run now": shows each agent's achievement % and the band applied (company bands, e.g. 0–40% → 30% of base), preview before posting. **Waive / appeal** action with approval.

#### J6. Achievement measurement [Scope 3.3]

- **Achievements page:** week selector; agents × activities grid with achieved values from metric definitions; drill into the records counted (e.g. the 12 farmers profiled); "Recompute week".
- Explains attribution ("counted only in planned communities").

#### J7. Monthly allowances [Scope 3.2]

- **Allowance types** (Settings): name, amount or tiers by achievement, threshold, period definition, compute window, approval step.
- **Run for period:** preview eligible / not eligible agents with %, approve run, pay (E1, reference MMA-…); statuses Eligible → Pending → Paid / Failed; frozen after payment.

#### J8. Scores [Scope 3.3]

- **Agent scores:** per agent type score card (scoring engine), year/season selector, leaderboard, per-agent breakdown with targets and contribution, trend chart. Vitara templates: Conservation (farmers profiled 1,000→10, farmland 250→20, parkland 450→20, seedlings 10,000→15, trees monitored 10,000→20, farmers trained 2,000→15) and Community Engagement Officer (weights fixed to total 100).
- **Manager scores:** rolled up from their agents (configurable weights).
- Farmer, community and group scores accessible from their modules (C2–C4).

#### J9. Commissions (agent compensation) [Scope 3.3]

- **Periods:** from/to, approval window (enforced), status (Draft / In review / Confirmed / Paid). Create → lines generated from rate cards (progress).
- **Lines:** agent, items (activity, achieved, unit, rate, amount, eligibility notes e.g. "Workshop excluded: 12 attendees, min 15"), total; first approval and second approval with **separate permissions** (and separation of duties); reject / hold with reason.
- **Confirm period** → **Pay commissions** (E1 bulk) or export for payroll.
- **Rate cards** (Settings): Vitara templates reproduce today's GHS rates for Conservation and CEO types.

#### J10. Agent reports (non-compliance) [Scope 3.1]

- Report an agent: issue category (company list with severity), reason, file. Status Open → In progress → Resolved; assignee; due date; resolution comment + files.
- **Consequences** per company (Settings): flag only / block payouts / block budget requests / require extra approval — enforced across screens (e.g. Pay button disabled with "Agent has an open Critical report").
- Agent flag chip shown on all records the agent touches.

#### J11. Field activity map and geofences [Scope 3.1]

- Map of all GPS-stamped activities (purchases, profiling, support fulfilment, recovery, surveys, monitoring, mapping, workshops) with filters by agent, type and date; playback of an agent's day.
- **Geofences:** community polygons or radius; out-of-area activities flagged; report of flags by agent.

### K. Reports, notifications and system

#### K1. Reports and exports [Scope 10.1]

- **Report library:** every existing export reproduced as a saved report (farmers, farmer profiling by agent, purchases, purchase requests, PRE, reconciliation, payments, recoveries, support, workshops, tree monitoring, nurseries, plots, inventory movements, carry-forwards, commissions, sourcing by agent).
- **Report builder:** pick entity → columns (incl. form fields) → filters → group by → chart type → save / schedule (daily/weekly email to roles) / share.
- Export XLSX / CSV / PDF view; large exports run as a job with progress, then a download link that "expires" in 24 h; headings in the user's language; money in company currency.

#### K2. Notifications [Scope 10.2]

- **Inbox** (bell + page): grouped by day, filters (approvals, payments, sync, alerts), mark read, deep link.
- **Outbox (simulated delivery log):** every email/SMS/push the system "sent": channel, recipient, template, language, status (Sent / Delivered / Failed), preview (email render, SMS bubble, push banner).
- Templates and rules live in Settings (A4).

#### K3. Sync logs and devices [Scope 10.3, 12]

- **Sync logs:** time, agent, device, app version, type (44 sync types reproduced as a list), records sent, created/updated/failed, status (Success / Partial / Failed), duration; detail shows request/response JSON (masked personal fields unless permission), retry guidance.
- **Devices:** user, model, OS (Android/iOS), app version, push token status, last seen, company; "Sign out device", "Require update".
- **App versions** chart; minimum version setting.
- **Retention** follows company Data & privacy setting (shows next purge date).

#### K4. Audit log [Scope 10.3]

Immutable list: time, actor, company, entity, action key (rendered in viewer language), before/after diff, IP/device, GPS. Filters, export. Platform-level audit for platform owner.

#### K5. Activity history on records

Every record's Activity tab uses the same feed (who, what, when, comment, attachments).

#### K6. Scheduled jobs [Scope 10.4]

List of jobs with schedule in the company time zone, last run, next run, status, duration, "Run now", log: weekly achievements, performance penalties, monthly allowances, score recalculation, recovery interest accrual, data retention purge, dashboard cache refresh, report schedules, payment status polling, backups (platform only).

#### K7. Help and knowledge base [Scope 10]

Knowledge base articles (markdown, per company + global), searchable; "What's configurable here" side sheet; tours; keyboard shortcuts; Mobile previews (4.2); Reset demo data.

#### K8. Integrations and public API (demo screens) [Scope 1.5]

API keys, webhooks with test delivery and log, a read-only API docs page (OpenAPI-style list of endpoints with sample JSON), accounting export placeholder.

---

## 10. Mobile app — flow specifications

Runs at `/m/*` in its own window (section 4.2). Bottom tabs: **Home · Tasks · Record (+) · Sync · Me**. The **Record (+)** sheet shows tiles allowed by the agent type and company modules. All forms use the company's published forms (`MobileFormRenderer`). Every save works offline (goes to the outbox) and shows "Saved on phone · will sync".

**Common mobile components:** big tap targets (min 48 px), sticky bottom action button, step progress, camera simulation (pick from bundled sample photos), GPS capture with accuracy meter, QR scan simulation (animated viewfinder → code), NFC tap simulation, thumbprint capture simulation, audio recorder (waveform + playback), signature pad, offline banner, sync bar, language switch.

### M1. Sign in and setup

Phone number (country prefix from company) → code (shown in a demo toast; length from settings) → choose company if several → download data screen (progress per module) → home. Session lock with PIN after inactivity. Company switch from Me (re-downloads data, re-registers device).

### M2. Home, tasks and sync

- **Home:** greeting, sync status, cash held, this week's plan (activities with achieved/target bars), today's trips, alerts (recovery window banner, rejected receipts, data-fix tasks, survey assignments, workshops today), quick actions.
- **Tasks:** everything assigned: plan activities, data-quality fixes, survey assignments, monitoring due (nurseries, trees, plots), workshops, recoveries due, inbound deliveries (warehouse officers), receipts to resubmit.
- **Sync:** outbox list by type with counts, "Sync now" (animated, per-item results incl. one simulated conflict with "Keep mine / Keep server"), last sync time, data usage, offline toggle.
- **Me:** profile, wallet (view), language, company switch, device info, app version, help, sign out.

### M3. Community profiling

Search/create community → location (company levels) → GPS (accuracy) → community profile form → leaders (repeat) → farmer groups (repeat, upsert) → documents (camera) → review → save. Edit existing communities in the agent's visibility scope.

### M4. Farmers and farmer groups

- **Register farmer:** duplicate check as you type phone/ID → farmer profile form → photo → ID card photo → thumbprints (left/right) → consent (audio / signature / tick, consent text in chosen language read aloud button) → NFC card tap (if on) → review → save.
- **Farmer list** (visibility rules), farmer detail (profile, purchases, loans with balance and quote, trees, plots), edit, fix data-quality task.
- **Farmer groups:** create/edit group (group type form), members (pick farmers), leaders, payment details, record documents (meeting minutes, contribution records).

### M5. Buying

- **Purchase request:** create (community, commodity, unit, volume, planned date, price auto from list with tolerance warning), list with statuses, detail with approval timeline, confirm rate, confirm funds received, sign receipt (signature pad), managers can approve from mobile if permitted.
- **Record farmer purchase:** pick request (only active ones) → farmer (search / NFC tap / scan card) → **debt check** (block / warn / deduct per policy) → commodity, weight (manual or "read scale" simulation), price (from request) → bag: scan QR or **consolidated bag** (add several farmers to one bag, live total vs bag min/max) → scale photo → voice note → GPS → payment: cash advance (paid in cash, farmer signs) or direct mobile money (wallet, name lookup, "Pay now" → simulated prompt → success) → receipt (show, SMS to farmer simulated).
- **Voice purchase:** mic → waveform → transcript (Twi / Dagbani / Hausa / French scripted) → pre-filled purchase form → confirm.
- **PRE expense:** request → bags → expense lines from catalogue → scan bag codes when required → payee wallets → submit; status list.
- **Related unpaid purchases** prompt for bulk payment.

### M6. Farmer support

Create support request for a group (services, per-farmer lines, ability to pay, leader + witness voice notes, GPS) → status list → **confirm recipients** (tick farmers present, opt-outs, group wallet) → **fulfilment** (per farmer audio/photo + witness, GPS) → agreement and thumbprint assets.

### M7. Recovery

Recovery window banner → recovery request for a group (eligible farmers listed) → after activation: **record repayment** (farmer → balance and quote shown → mode Cash / Produce / Mixed → weight + bag scan → cash amount → excess purchase toggle with price → photo for cash confirmation) → farmer receipt → group feedback form at the end.

### M8. Warehouse officer

Home shows expected deliveries and stock. **Receive inbound:** pick expected delivery → scan each bag (original / missing / replaced tag / weight top-up) → weigh → summary with discrepancies and auto write-offs → confirm. **Outbound / transfer:** scan bags → choose type and destination → confirm. **Receive transfer.** **Stock count:** scan all bags → summary vs expected → photos → submit. **Warehouse expenses:** create lines, status. **Resolve discrepancy:** returned bag, tag replacement, top-up bag.

### M9. Trees and land

- **Nursery:** register (nursery form + representative) → batches → images → agreement → **monitoring** (primary / secondary rounds due) → **assign seedlings to farmer** from batch.
- **Seedling allocation:** farmer → species → scan or enter codes (count must match quantity) → save.
- **Tree monitoring:** due list → scan tree code / pick farmer's trees → species form (alive/dead logic) → photos → GPS → save.
- **Map a plot:** choose type → **walk the boundary** (simulated: points appear along a path with live area and accuracy; or tap points on map) → validation feedback (closed, precision, > 4 ha needs polygon) → link farmer → agreement photo → images → save.
- **Plot monitoring:** due list → questionnaire → photos → save.

### M10. Surveys and workshops

- **Surveys:** assigned forms (with targets and due dates) → pick subject record if bound → fill (logic, repeat groups, media) → save draft / submit → "Needs fix" items returned by reviewers.
- **Workshops:** today's and upcoming → start → take attendance (NFC tap / scan card / search / thumbprint), rating + comment per farmer → photos → finish → feedback form.

### M11. Weekly plan, budget and retirement

View published plan → **create budget request** (trips: date, community, activities with target slices, cost categories with limits shown live, totals; blocked banner if previous retirement open) → status timeline → payout notification → **retirement** (upload receipts per category with amount/date, airtime receipt once per week) → see rejected receipts and resubmit → or declare unused funds (reason) → refund confirmation.

### M12. Agent self-service

My cash position (advances, spent, to reconcile), my commissions (period lines and status), my score (breakdown), my reports (non-compliance, add response), notifications inbox.

---

## 11. Data model

Define in `src/types/`. Every entity has `id`, `orgId`, `createdAt`, `updatedAt`, `createdBy`, `version` (where versioned) and `customFields: Record<string, unknown>` (form answers) where a profile form applies.

| Area | Entities |
|---|---|
| Platform | Organisation (type, countries, currency, locale, timezone, weekStart, plan, status, branding, terminology), Plan, Country, Currency, Lead, DataSharingGrant |
| Access | User, Membership (user × org × roleIds × status), Role, Permission, Session, Device, ApiKey, Webhook |
| Settings | OrgSettings (all section A4 objects), WorkflowDefinition, NumberingPattern + Sequence, FeeTier, PaymentProvider, Commodity, Unit, PackagingProfile, PriceListEntry, QualityRule, ScoreModel, MetricDefinition, RateCard, LoanTerms, SupportType, AgentType, CostCategory, AllowanceType, PenaltyPolicy, IssueCategory, ExpenseType, NotificationRule, Template, OptionList, LocationLevel, LocationNode, Zone |
| People & places | Community, CommunityLeader, CommunityDocument, Farmer, FarmerIdentity (photo, thumbprints, consent, NFC card), FarmerGroup, GroupMembership, GroupLeader, GroupDocument, SavingsCycle, SavingsTransaction, DataQualityFlag, ImportJob |
| Buying | PurchaseRequest, Approval, Disbursement, Receipt, Purchase, Bag, BagEvent, BarcodeReplacement, Expense (PRE) + ExpenseLine, Supplier, AggregatorPurchase, AggregatorExpense, Delivery, Refund, WriteOff |
| Money | Payable (union), Payment, PaymentAttempt, Wallet, Collection |
| Support | SupportRequest, SupportLine, ServiceProvider, SupportAsset, RecoveryWindow, RecoveryRequest, LoanAccount, Repayment, LedgerEntry, RecoveryFeedback, LegacyAllocation |
| Inventory & sales | Warehouse, StockBalance, PendingInbound, Inbound, InboundItem, Discrepancy, Resolution, InventoryRepayment, Outbound, Transfer, StockCount, WarehouseExpense, DispatchOrder, Shipment, SalesContract, PaymentScheduleItem, ContractTemplate, DocumentDownload |
| Trees & land | Nursery, NurseryBatch, NurseryMonitoring, Species, Seedling (or SeedlingLot with code ranges), SeedlingSourcing, SeedlingAssignment, TreeMonitoring, Plot, PlotMonitoring, ForestCheck, Lot, DueDiligenceStatement, CarbonProject, ProjectTreeAssignment |
| Forms & training | Form, FormVersion, Question, LogicRule, Assignment, Response, Answer, ReviewAction, TrainingTopic, Workshop, Attendance, WorkshopImage |
| Field team | Agent, ReportingLine, WeeklyPlan, PlanTarget, PlanAssignee, BudgetRequest, Trip, CostLine, AllowanceGrant, Retirement, RetirementReceipt, UnusedFundsDeclaration, CarryForward, CarryForwardApplication, Achievement, MonthlyAllowance, Score, CommissionPeriod, CommissionLine, CommissionItem, AgentReport, Resolution, ActivityLocation, Geofence |
| System | ActivityEvent, AuditEntry, Notification, OutboxMessage, SyncLog, ScheduledJob, JobRun, Report, KnowledgeArticle |

Key shapes (TypeScript) to include verbatim:

```ts
type Money = { amountMinor: number; currency: string };
type Status<T extends string> = { value: T; since: string; by?: string };

interface WorkflowStep { id: string; name: string; roleIds: string[]; permission: string;
  condition?: { field: string; op: '>'|'>='|'<'|'in'|'aboveListPct'; value: unknown };
  parallel?: boolean; minApprovals?: number; allowEditAmount?: boolean; slaHours?: number; auto?: boolean }

interface ApprovalRecord { stepId: string; userId: string; decision: 'APPROVED'|'REJECTED'|'HELD'; comment?: string; amountOverride?: Money; at: string }

interface Purchase { id: string; orgId: string; number: string; requestId: string; farmerId: string; agentId: string;
  commodityId: string; quantity: number; unitId: string; unitPrice: Money; amount: Money; paidToFarmer: Money;
  bagCodes: string[]; consolidationRef?: string; plotId?: string;
  evidence: { scalePhoto?: string; voiceNote?: string; gps?: { lat: number; lng: number; accuracy: number }; signature?: string };
  paymentStatus: 'NOT_PAID'|'PENDING'|'PAID'|'FAILED'; deductedForLoan?: Money; syncedFrom?: 'MOBILE'|'WEB'; createdAt: string }

interface LedgerEntry { date: string; type: 'PRINCIPAL'|'INTEREST'|'PENALTY'|'REPAYMENT'|'REFUND'; amount: Money; balanceAfter: Money; note?: string }

interface ActivityEvent { id: string; orgId: string; entity: string; entityId: string; key: string; params: Record<string, unknown>; actorId: string; at: string; gps?: {lat:number;lng:number} }
```

---

## 12. Demo data

Seeded with a fixed random seed (`src/data/seed/`). Names and places must feel real; all people and companies are invented.

### 12.1 TreeSyt (platform)

Platform owner Benjamin; plans Starter / Growth / Enterprise; 3 leads; global catalogues.

### 12.2 Vitara (Ghana — supplier, the reference template)

- GH, GHS, English, Africa/Accra, Monday weeks. Modules: all.
- Locations: Upper West (Wa, Daffiama-Bussie-Issa, Nadowli-Kaleo, Jirapa, Lawra, Sissala East), Northern (Tamale, Savelugu, Kumbungu, Tolon, Karaga), Savannah (Damongo, Bole, Sawla), North East (Walewale, Gambaga). 40 communities.
- Commodities: Shea nuts (bag 75–120 kg, loss 0.5%), Soybeans, Maize, Groundnuts, Sesame, Cowpea, White millet. Price lists by zone.
- 600 farmers (60% women), 45 groups (incl. 10 VSLA), 24 agents (CEO 14, Conservation 8, Warehouse 2), 4 supervisors, 3 warehouses (Wa, Tamale, Tema port).
- 90 purchase requests (all statuses), 1,200 purchases, 300 PREs, 15 aggregator purchases with 6 suppliers, 1,000 payments (MTN MoMo 75%, Telecel Cash 20%, AirtelTigo 5%).
- 35 support requests (Cash, Ploughing, Farm input, Agroforestry), 1 active recovery window, 20 recovery requests, 400 repayments.
- 12 inbounds (2 with discrepancies), 6 transfers, 3 stock counts, 20 dispatch orders, 5 sales contracts, 2 buyers (Nordic Shea Butter AB, Accra Food Processors Ltd).
- 8 nurseries, 6,000 seedlings, 3,000 tree monitoring visits, 350 plots (60% polygons), 1 carbon project.
- 12 forms (incl. profile forms), 1,500 responses, 30 workshops.
- 8 weeks of plans, budgets, retirements; carry-forwards; 2 allowance periods; 2 commission periods; 6 agent reports.

### 12.3 Kakao Ivoire (Côte d'Ivoire — fictional cocoa cooperative union)

- CI, XOF (0 decimals), French, Africa/Abidjan. Terminology: Agent → **Délégué**, Community → **Village**, Purchase request → **Demande d'achat**.
- Location levels District → Région → Département → Village (Bas-Sassandra/Nawa/Soubré, Méagui; Gôh-Djiboua/Gôh/Gagnoa; Sassandra-Marahoué/Haut-Sassandra/Daloa). 25 villages.
- Commodities: Cacao (bag 60–70 kg, loss 0.3%, EUDR-relevant), Noix de cajou.
- 350 farmers, farmer form adds Certification (Rainforest Alliance / Fairtrade / Aucune) and Hectares de cacao; land unit hectares; plots required for every farmer (EUDR), 85% polygons.
- Workflow: Superviseur de zone → Directeur des opérations (only if > 2,000,000 XOF) → Finance. Numbering `DA-{yy}-{seq:6}`.
- Providers: Orange Money 60%, Wave 25%, MTN MoMo CI 15%. Fee tiers different from Ghana.
- No weekly budget module; commissions on; recovery with simple interest 2%/month, no cash penalty.

### 12.4 Nordic Shea Butter AB (buyer, Sweden)

Buyer company type, EUR display, English. Buyer user Lena Hartmann. Data-sharing grant from Vitara (orders, traceability, impact).

### 12.5 Fixed demo moments (must exist)

- Vitara request priced 18% above list → HIGH risk.
- Agent Yaw Darko holds the most unreconciled cash (≈ GHS 12,400).
- Farmer Abena Issah (Daffiama) overdue loan GHS 840 → blocked purchase.
- Inbound at Wa with 1 missing bag and 1 bag at 1.2% loss + 3 bags under 0.5% (auto write-off).
- Five items in Kwame's approval queue across 3 doc types.
- A payment stuck in Unknown status.
- A retirement with a duplicated receipt (AI flag).
- A Kakao Ivoire plot overlapping the fake forest-loss layer → EUDR Risk.
- A dispatch In transit to Nordic Shea Butter AB.
- A farmer group with a newly uploaded meeting record awaiting manual score.

---

## 13. Demo journeys (acceptance tests)

Each journey must run end to end without errors at 1440 px and (where relevant) in the mobile window.

1. **Configurable company:** Switch Vitara → Kakao Ivoire: language, currency, terminology, location levels, providers, workflow all change. Switch to the buyer company: only Traceboard is visible.
2. **Buy to pay:** Yaw (mobile) creates a request → Kwame approves → Efua approves and pays the cash advance (one failure, retry) → Yaw records 3 purchases offline incl. a consolidated bag and a voice purchase → sync → purchases appear on web → Reconciliation auto-matches with a small refund.
3. **Direct farmer payment:** activate ticket → Yaw records purchase with direct MoMo payment → bulk pay 4 related purchases from web.
4. **Logistics to warehouse:** Yaw submits a PRE → approvals (auto + 3 levels) → paid → expected delivery at Wa → Sulemana (mobile) receives: missing bag + weight loss → discrepancy → agent repayment → finance approves.
5. **Dispatch to buyer:** create dispatch from inventory against a contract → approve → in transit → delivered → verified (sale number) → contract fulfilment updates → Lena (buyer) sees the order, impact and trace-to-plot map.
6. **Support and recovery:** group support request → scoring gate → approval → agent confirms recipients → MoMo to group → fulfilment audio → recovery request → activation → repayment (mixed with excess purchase) → ledger shows interest/penalty → Abena blocked then unblocked after settlement.
7. **Field team week:** Fuseini publishes a plan → Yaw submits budget → manager + finance approve → paid net of carry-forward → retirement with receipts (one rejected, resubmitted) → run achievements and penalty jobs → see carry-forward created.
8. **Commissions and scores:** create commission period → lines generated with eligibility notes → two approvals by two different users → pay in bulk.
9. **Forms drive profiles:** Aïcha adds a "Certification" question to the farmer profile and publishes → appears on web registration, mobile registration, farmer list column options and report builder.
10. **Settings change behaviour:** remove a workflow step, change the loss tolerance, change a numbering pattern, disable the Inventory module → each change visible immediately.
11. **EUDR:** Moussa walks a plot boundary on mobile → plot appears with area → run deforestation check → one Risk → generate DDS for a dispatch.
12. **Onboard a company:** platform owner uses the wizard with AI draft (cashew exporter, Ghana) → new company created → empty states + checklist.
13. **AI:** ask 5 different questions; each returns a correct, company-scoped answer with deep links.
14. **Trees:** nursery monitoring round → seedling assignment to farmer → tree monitoring visit (dead tree with cause) → tree dashboard updates.
15. **Data quality and import:** import 50 farmers from the sample CSV with 4 errors → fix → 3 new quality flags → send fix task to mobile → resolved.

---

## 14. Build phases

| Phase | Scope | Done when |
|---|---|---|
| 1 | Project setup, tokens, AppShell, routing for every route in section 7 (placeholder pages with PageHeader), stores with persistence + cross-tab sync, all engines scaffolded with tests for workflow, numbering, money, loans, seed data for all companies, company/role switchers, i18n EN/FR, `/m` shell opening in its own window | Every route loads; switching company changes currency/language/terms; mobile window opens and shows the signed-in agent; build + lint + tests pass |
| 2 | Public site, sign-up, sign-in, SSO/2FA screens, invites, my account, platform console, onboarding wizard | Journey 12 |
| 3 | Settings (all A4 pages) + permissions/modules gating | Journey 10 (partial) |
| 4 | Dashboard, widget system, AI assistant | Journey 13 |
| 5 | Locations, communities, farmers, groups, data quality, imports | Journey 15 |
| 6 | Forms builder, responses, analytics; Form renderers on web and mobile | Journey 9 |
| 7 | Purchase requests, purchases, bags, PRE, reconciliation, price board | Journey 2 (web side) |
| 8 | Payments engine, wallets, bulk pay, collections | Journeys 2–3 |
| 9 | Mobile: M1–M5 + offline/outbox/sync | Journeys 2–3 complete |
| 10 | Aggregator purchases and suppliers | Supplier → ACS → delivery → reconciled |
| 11 | Farmer support, service providers, recovery, loan engine UI, legacy allocations; mobile M6–M7 | Journey 6 |
| 12 | Warehouses, inbound, discrepancies, outbound, transfers, stock counts, warehouse expenses; mobile M8 | Journey 4 |
| 13 | Dispatch, sales contracts, Traceboard (supplier + buyer views) | Journey 5 |
| 14 | Nurseries, seedlings, trees, plots, EUDR, carbon; mobile M9 | Journeys 11, 14 |
| 15 | Workshops/training; mobile M10 | Attendance flow works |
| 16 | Field team: agents, reporting lines, plans, budgets, retirements, carry-forwards, achievements, allowances, scores, commissions, agent reports, field activity map; mobile M11–M12 | Journeys 7–8 |
| 17 | Reports, notifications inbox/outbox, sync logs, devices, audit, scheduled jobs, help, integrations | All K screens clickable |
| 18 | Polish: motion, responsive at all widths, dark mode, empty/loading/error states, tours on every page, accessibility, performance, COVERAGE.md 100% | All 15 journeys pass |

---

## 15. Quality bar

- `npm run build`, `npm run lint`, `npm run test` pass. No console errors or React warnings.
- No dead controls; unfinished ones toast "Coming in the full product".
- Every list: loading skeleton, empty state (with a helpful action), filtered-empty, error state.
- Permission and module gating on every route and action.
- No data from another company ever appears (write a test that switches company and checks every store selector).
- All text translated (no hard-coded English in components; a lint rule or test greps for string literals in JSX).
- Lighthouse accessibility ≥ 90; keyboard navigable; visible focus; colour contrast AA.
- Performance: lists virtualised above 200 rows; first load < 3 s on Vercel.

---

## 16. Coverage checklist

Copy into `docs/COVERAGE.md` and tick as built. Every line is a feature found in today's backend.

**Foundations (Scope 1):** company profile · platform owner role (replaces org 21) · company list · onboarding wizard · company edit · deactivate/suspend · plan permission ceiling · company switching (web + mobile) · company code/numbering prefix · public sign-up · web sign-in · token/session expiry · agent phone + code login · OTP by SMS/email · resend code · forgot/reset password · invite acceptance · change password · sign out (this device/all) · email verification · users list/add/bulk invite/edit/remove · roles CRUD per company · permission matrix · permission checks per company · public role list removed · modules catalogue + toggles + enforcement · company-specific switches (orgs 96/97 cases as settings) · business rules settings · per-company sequences · time zone/week start · languages + terminology · currency formatting · countries catalogue · API versions/docs page · removed unauthenticated debug routes · NFC keys server-held.

**Places and people (Scope 2):** location levels + explorer + zones · agent multi-area assignment · community profile (v1–v3 fields) · community code pattern · leaders · documents · groups in community sync (upsert) · community list/detail/map/dashboard/edit · community score · farmer profile (all fields) · farmer ID pattern · thumbprints · consent audio/signature · ID card and photo · NFC card lifecycle · data-quality rules + review · farmer score · farmer list/detail/export/profiling report/dashboard · shared farmers/communities · farmer groups profile/members/leaders/documents/payment details · group scorecard + manual review · VSLA savings · community import · farmer import · other imports.

**Field agents (Scope 3):** agent types · agent record · managers/reporting lines · visibility rules · multi-company agents · agent reports + resolutions + consequences · GPS activity + geofences · activity catalogue · weekly plans create/publish/amend · budget requests · manager review · finance review · wallet edit · payout net of carry-forward · absorb with carry-forward · weekly airtime/allowances · retirements + receipts · unused funds + refunds · under-spend carry-forward · performance penalty · achievement measurement · monthly maintenance allowance · agent scores · manager scores · commission periods · commission lines + rates + eligibility · two-level approval · devices per user.

**Buying (Scope 4):** purchase request create/approve/reject/hold · all PR statuses · mobile status updates · price update · rate confirmation · full/partial disbursement · cash advance payout · manual disbursement + funds received · ticket activation · receipts + signature · reconciliation statuses · agent refunds · manual write-off · archive/export/list filters · farmer purchase sync · debt blocking · bags/QR · consolidated bags · barcode replacement · voice notes · scale photo · wallet edit · purchase list tabs · purchases dashboard (aggregator thresholds) · related unpaid purchases · sourcing export · PRE create/4-level approvals/hold/resume/disburse/receipt/edit/wallet · pending inbound trigger · aggregator registry · aggregator purchase create/approve/reject/disburse · aggregator expenses · delivery details · proof of delivery · aggregator refunds/reconciliation · commodity catalogue · units · price lists.

**Money (Scope 5):** payable types · payment preview + name lookup · disburse with charges · extra charges · bulk farmer payment · webhook/status updates (simulated) · status check · payment history/stats/export · wallet balance · providers per company/country · fee tiers/tax · phone validation by country · collections · weekly budget/allowance/support payouts · money storage and formatting.

**Farmer support (Scope 6):** support intake · support types/sub-types · ability to pay · voice notes · group scoring gate + board · approval per service · reject/hold · amount edits · agent confirmation + opt-outs · group wallet · MoMo and manual disbursement · fulfilment proof · group fulfilment status · declined refunds · service providers · support dashboards (all/cash/ploughing/input/agroforestry) · recovery windows · recovery request lifecycle · manager review · finance activation + implicit purchase request · repayments cash/produce/mixed · bag barcode for produce · excess purchase · cash confirmation · loan ledger (interest, penalty, waterfall, tolerance, rounding) · settlement quote · debt blocking · overpayment refunds · recovery feedback · recovery views/exports/dashboard · legacy allocations.

**Inventory and sales (Scope 7):** warehouses · stock balances · pending inbound · inbound with tag statuses · discrepancies · tolerance auto write-off · physical resolution · weight reimbursement allocation · agent repayment + finance review · outbound · transfer out/in pipeline · transfer weight bounds · stock counts · warehouse expenses + 4-level approval · dispatch (direct + inventory) · dispatch approval · shipment statuses + tracking · verification + documents · sale number · impact metrics · sales contracts (spec, terms, packaging, statuses, fulfilment, documents, officers) · Traceboard supplier view · Traceboard buyer view · order detail + document download log · insights request · shipment notifications · carbon projects.

**Trees and land (Scope 8):** nursery registration · representative · images/agreement · nursery monitoring rounds · nursery dashboard · nursery list/detail/map/batch history · batch numbering · seedling sourcing · seedling stock · assignment to agent/company · nursery → farmer assignment · seedling allocation · tree monitoring · tree list/detail/export · tree maps · tree dashboard · tree/community/farmer tree scoring · health score · conservation KPIs/rates · field mapping · plot list/detail/images/agreement · mapping dashboard · plot monitoring · EUDR validation/area/deforestation check/DDS export.

**Forms and training (Scope 9):** form builder · all question types · skip/display logic · assignment + deploy · lifecycle incl. test · mobile survey delivery · responses + media · review statuses · analytics · summary · export · subject binding · training catalogue/topics · workshop planning · status · edit/archive/delete rules · export · dashboard · attendance + ratings + comments · images.

**Platform services (Scope 10):** dashboards + caching · exports/report builder · email · SMS · push · recovery banner/reminders · offline sync protocol · sync logs (scoped, private, retention) · devices · activity history (structured) · audit log · scheduled jobs · backups (platform) · error reporting (n/a in prototype; noted) · AI assistant · knowledge base · book a demo.

**Hard-coded values (Scope 11):** every item in Scope 11 appears as an editable setting with the Vitara value as the template default.




