# Coverage checklist (PRD section 16)

Every line is a feature found in today's backend. Ticked as the prototype builds it.

**Legend:** `[x]` built · `[~]` foundation in place (engine, data or gating), screen comes in a later phase · `[ ]` not started.
Phase numbers in brackets say which phase delivers the full screen.

_Last updated: Phase 7._

Every Settings page (27, PRD A4) has Save (toast + audit entry with before/after), Cancel, Reset to template, a leave-without-saving guard, read-only mode without the edit permission, and "Where this is used" links. Operational pages show the settings in effect (approval route, next number, tolerances).

Prototype-only controls (persona sign-in, demo codes and emails, open mobile window, mobile previews, "view as", "next payout fails", reset demo data, page notes and page actions such as the agent's phone steps for Journey 2) live in the **Demo panel** (flask icon, bottom-right), not in the product UI.

## Foundations (Scope 1)

- [x] Company profile — Settings → Company profile: legal/trading name, registration and tax ID, contacts, countries, currency, languages, time zone, week start, fiscal year, company code, live money/date/number preview
- [x] Platform owner role (replaces org 21) — `platformOwner` role, sees every company, Platform console gated by `platform.*`
- [x] Company list — Platform → Companies: logo, countries, type, plan, modules, active agents, farmers, status, created; View / View as company / Suspend / Reactivate / Change plan; company detail with usage charts, plan limits, modules, admins, grants, audit
- [x] Onboarding wizard — 7 steps + review with AI draft; template (Vitara / blank / cocoa / cashew / shea / grains / coffee); creates company, settings, roles, admin invites; setup checklist on the new company's dashboard
- [x] Company edit — plan and status from the console; profile and branding (logo upload, colour, email/receipt/portal previews) in Settings
- [x] Deactivate / suspend — suspend and reactivate (members of a suspended company can't sign in), audited
- [x] Plan permission ceiling — Platform → Plans shows module bundles, limits and ceiling; enforced in every permission check; Change plan applies it immediately
- [~] Company switching (web + mobile) — web switcher, command palette, persona switcher; mobile company switch from Me [9]
- [x] Company code / numbering prefix — `{orgCode}` / `{prefix}` tokens, per-company patterns
- [x] Public sign-up — account (strength meter) → verify email (6-digit code) → company basics (currency and language from country) → terms → setup checklist
- [x] Web sign-in — email + password with attempt counter and lockout, SSO (domain lookup → identity provider screen), 2-step code, remember this device, company picker
- [x] Token / session expiry — idle warning modal with countdown (company session length), sessions revocable; a revoked session signs its tab out
- [ ] Agent phone + code login [9]
- [~] OTP by SMS / email — email verification and 2-step codes (simulated, shown in the Demo panel); SMS login for agents [9]
- [x] Resend code — 2-step (with cooldown) and email verification; agent SMS resend [9]
- [x] Forgot / reset password — email sent screen, reset link (expired / used / invalid states), new password with the company policy shown
- [x] Invite acceptance — separate page: name, password (company policy), terms; expired and used states
- [x] Change password — My account → Security
- [x] Sign out (this device / all) — My account → Sessions, works across tabs
- [x] Email verification — sign-up step 2
- [x] Users list / add / bulk invite / edit / remove — Settings → Users: invite, bulk CSV with validation preview, role change, deactivate/reactivate, remove, resend/revoke invite, unlock, last active
- [x] Roles CRUD per company — Settings → Roles: user counts, create (blank or copy), rename, mobile sign-in flag, delete when unused
- [x] Permission matrix — grouped by module with search, select all per module, plan ceiling greys out what the plan excludes; compare up to 4 roles (differences only)
- [x] Permission checks per company — `can(user, permission, orgId)`, route guards, `<PermissionGate>` with "View as" mode
- [x] Public role list removed — no public role endpoint exists in the prototype
- [x] Modules catalogue + toggles + enforcement — Settings → Plan & modules: toggles within the plan, dependency errors with one-click fixes; sidebar, routes, mobile tiles and dashboard follow instantly (all tabs)
- [x] Company-specific switches (orgs 96/97 cases as settings) — sub-feature switches per module (voice purchase, consolidated bags, direct payment, bulk pay, name lookup, group scoring, auto write-off…)
- [x] Business rules settings — Buying rules, Support & loans (live ledger example), Inventory rules (tolerance check), Field team, Data quality (test on sample), Biometrics, Security, Mobile app
- [x] Per-company sequences — numbering engine with company / year / month / client / agent / community scopes
- [x] Time zone / week start — all dates via `formatDate()` in the company time zone; week start per company
- [x] Languages + terminology — EN/FR via i18next; company terms (`{{term.agent}}` → "Délégué")
- [x] Currency formatting — `formatMoney()` with minor-unit table (GHS 2, XOF 0, …)
- [x] Countries catalogue — Platform → Global catalogues: countries, currencies, commodities, question types on/off, permission catalogue, providers per country
- [ ] API versions / docs page [17]
- [x] Removed unauthenticated debug routes — no backend; nothing to expose
- [x] NFC keys server-held — Settings → Biometrics & consent shows server-held card keys and rotation

## Places and people (Scope 2)

- [x] Location levels + explorer + zones — Settings → Locations (levels, tree editor, CSV import, zones); Locations explorer `/app/locations`: tree by levels, node detail with community / farmer / agent counts, zones, add / edit / move; boundary drawing is a "coming" stub
- [~] Agent multi-area assignment — agents hold many area nodes; explorer counts agents per node [16]
- [x] Community profile (v1–v3 fields) — community profile form (Vitara v3) rendered on create / edit and in the drawer's Profile tab
- [x] Community code pattern — new communities get `{region}-{seq:3}` from Settings → Farmer ID & codes; issued once, never regenerated on edit
- [x] Leaders — communities and groups: name, role (company list), phone; add / edit / remove
- [x] Documents — type from the company list, upload with image / PDF preview, uploaded by / when
- [ ] Groups in community sync (upsert) [9] — web group create already upserts by name within a community
- [x] Community list / detail / map / dashboard / edit — filters + saved views, column picker, CSV export, drawer (overview map, profile, leaders, documents, farmers, groups, purchases, activity), `/app/communities/map` with score-coloured pins, dashboard (profiled, average farmers, bought from, top 3s, over time)
- [x] Community score — Vitara model (profile 20 + purchases 35 + training 15 + trees 30) with breakdown and recalculate (replaces); workshops / trees count as zero until phases 14–15
- [x] Farmer profile (all fields) — Vitara v3 farmer form (incl. spouse show-if, children repeat group, ID type / number); edit creates a new version with a change history
- [x] Farmer ID pattern — `{community}-{initials}-{seq}` / `KI-{region}-{seq:5}` on registration; "Import existing IDs" keeps a supplied ID
- [x] Thumbprints — left / right status on the Identity tab (capture itself on mobile, phase 9)
- [x] Consent audio / signature — Identity tab shows audio player (simulated), signature image or tick; record consent from the web
- [x] ID card and photo — status on the Identity tab, plus document upload
- [x] NFC card lifecycle — issue, replace, revoke (permission `farmers.manageNfc`)
- [x] Data-quality rules + review — `/app/data-quality`: queue (farmers, communities, groups) with rule, severity, agent, source, date; bulk assign to agent (mobile task), mark valid with reason, re-check; charts by rule, by agent, weekly trend; Vitara rules incl. disabled ewe / tertiary / tractor with notes
- [x] Farmer score — farmer model (consent, identity, purchases, group, no overdue loan) with breakdown and recalculate
- [x] Farmer list / detail / export / profiling report / dashboard — list with all PRD columns, saved views (Women farmers, No consent, Blocked by debt, Flagged), register with duplicate check (phone / ID number), drawer tabs, CSV export with column picker, profiling report by agent, dashboard (gender, age bands, education, income, real household / children averages, registrations, by agent)
- [ ] Shared farmers / communities [later — company data sharing, PRD A5]
- [x] Farmer groups profile / members / leaders / documents / payment details — group type form, membership with roles, joined / left, add / remove; MoMo / bank / cash details
- [x] Group scorecard + manual review — uploading meeting or contribution records resets that manual score and sets Pending review; reviewer scores 1–4 / 1–18 with a note → Completed; recalculation replaces
- [x] VSLA savings — Savings tab on VSLA groups: fund, saved, out on loan; contributions, loans, repayments, share-out
- [x] Community import — wizard: template from the community form, map, match parent locations, validate, import (codes from the pattern), quality re-check, undo
- [x] Farmer import — Journey 15: template (CSV / Excel) from the farmer form, sample file, auto-map with aliases, transforms (leading 0, dd/mm/yyyy…), fuzzy community matching, inline fixes, warnings for likely duplicates, result report, error file, history, undo last import
- [~] Other imports — locations import in the wizard; groups, members, leaders, recoveries, warehouse loads, price lists, users, agents show "arrives with its module"
- [x] Mobile data-fix tasks — fix tasks appear on the agent's phone (home alert, Tasks, `/m/tasks/:id`); saving re-checks the record and resolves the flag on the web; offline fixes wait in the outbox until Sync

## Field agents (Scope 3)

- [~] Agent types — CEO / Conservation / Warehouse (Vitara), Délégué / Magasinier (Kakao Ivoire) [16]
- [~] Agent record — 24 Vitara agents, 12 Kakao Ivoire agents, preview table [16]
- [~] Managers / reporting lines — supervisors seeded as managers [16]
- [ ] Visibility rules [16]
- [ ] Multi-company agents [16]
- [ ] Agent reports + resolutions + consequences [16]
- [ ] GPS activity + geofences [16]
- [ ] Activity catalogue [16]
- [ ] Weekly plans create / publish / amend [16]
- [ ] Budget requests [16]
- [ ] Manager review [16]
- [ ] Finance review [16]
- [ ] Wallet edit [16]
- [ ] Payout net of carry-forward [16]
- [ ] Absorb with carry-forward [16]
- [ ] Weekly airtime / allowances [16]
- [ ] Retirements + receipts [16]
- [ ] Unused funds + refunds [16]
- [ ] Under-spend carry-forward [16]
- [ ] Performance penalty [16]
- [~] Achievement measurement — metric engine scaffolded [16]
- [ ] Monthly maintenance allowance [16]
- [~] Agent scores — scoring engine scaffolded [16]
- [ ] Manager scores [16]
- [ ] Commission periods [16]
- [~] Commission lines + rates + eligibility — rate-card engine scaffolded [16]
- [~] Two-level approval — workflow engine supports separate permissions and separation of duties (tested) [16]
- [ ] Devices per user [17]

## Buying (Scope 4)

- [x] Purchase request create / approve / reject / hold — Purchase requests page: list + Kanban, tabs All / Waiting for me / Upcoming / Past / Archived, filters, risk flags; New request sheet (price from the zone list, tolerance warning, override reason, sourcing model, unit conversion); approve / hold / reject / resume from the drawer through the workflow engine
- [x] All PR statuses — Vitara and Kakao Ivoire status sets, current step, disbursement and reconciliation status columns
- [ ] Mobile status updates [9]
- [x] Price update — above the list price the request goes back for approval (PRICE_UPDATE), price history kept
- [x] Rate confirmation
- [x] Full / partial disbursement — tranches with amount and weight, partial count limit from Buying rules
- [~] Cash advance payout — single mobile-money payout with fee/tax quote, failure + retry (Demo panel → "Next payout fails"); full payments engine [8]
- [x] Manual disbursement + funds received — proof upload; agent's "funds received" simulated from the Demo panel until mobile [9]
- [x] Ticket activation — direct-payment requests
- [x] Receipts + signature — printable receipt (company legal name), agent signature image
- [x] Reconciliation statuses — Fulfilled, Overpaid, Refund agent, Receive refund, Reconciled; direct payment: Ticket activated / Partially paid / Fully paid; auto-matched chip; tolerance auto-reconciles
- [x] Agent refunds — full / partial with proof, or simulated mobile-money collection; pay the agent the difference
- [x] Manual write-off — within the company limit, permission + reason
- [x] Archive / export / list filters — archive, CSV export, saved tabs, column picker
- [~] Farmer purchase sync — web side done (synced purchases appear, evidence, auto-match); the phone's offline outbox [9]
- [x] Debt blocking — block / warn / deduct per policy on web purchase entry and the purchase banner; Abena Issah blocked
- [x] Bags / QR — bag registry (`/app/purchases/bags`), scannable QR codes, status, warehouse, history (purchase → PRE → inbound), per-farmer contributions
- [x] Consolidated bags — several farmers per bag, kg each, within packaging bounds
- [x] Barcode replacement — replace a damaged bag: new code, weight variance and who did it logged; purchases follow the new code
- [~] Voice notes — voice purchase evidence with a simulated player; recording on the phone [9]
- [~] Scale photo — evidence shown in the purchase drawer; capture on the phone [9]
- [x] Wallet edit — payout wallet on a purchase, permission-gated, locked once payment starts
- [x] Purchase list tabs — Cash-advance, Direct-payment, Unpaid; every PRD column incl. evidence icons and consolidated reference
- [x] Purchases dashboard (aggregator thresholds) — volume, spend, farmers, averages, smallholder vs aggregator split, top 3 agents and communities, cost per bag from PREs, purchases over time
- [~] Related unpaid purchases — selection with bulk pay button (same request, max N); the bulk pay flow itself [8]
- [x] Sourcing export — CSV export of purchases and requests
- [x] PRE create / 4-level approvals / hold / resume / disburse / receipt / edit / wallet — catalogue lines with basis, default rate and caps, bag scan when required, payee wallet, edit only before the first human approval, MoMo or manual payment, printable receipt
- [~] Pending inbound trigger — paying a PRE whose expense type triggers inbound creates the expected delivery and moves its bags in transit; warehouse receiving [12]
- [x] Price board — current price per commodity × zone, change history, paid vs list chart, suggested price (median paid within the tolerance band)
- [~] Aggregator registry — 6 suppliers seeded [10]
- [~] Aggregator purchase create / approve / reject / disburse — 15 seeded through the workflow engine [10]
- [ ] Aggregator expenses [10]
- [ ] Delivery details [10]
- [ ] Proof of delivery [10]
- [ ] Aggregator refunds / reconciliation [10]
- [x] Commodity catalogue — Settings → Commodities: names per language, codes, aliases, HS codes, units, quality parameters, grades, thresholds, EUDR and scoring flags
- [x] Units — Settings → Units & packaging: units and conversions, packaging profiles, conversion check
- [x] Price lists — Settings → Price lists: commodity × zone × grade, effective dates, tolerance, premiums, change approval switch, price history

## Money (Scope 5)

- [~] Payable types — all 12 types modelled [8]
- [ ] Payment preview + name lookup [8]
- [~] Disburse with charges — fee calculator (tiers, caps, tax, payer) tested [8]
- [~] Extra charges — supported by the fee calculator [8]
- [ ] Bulk farmer payment [8]
- [ ] Webhook / status updates (simulated) [8]
- [~] Status check — one payment seeded in Unknown status [8]
- [~] Payment history / stats / export — preview table [8]
- [~] Wallet balance — wallets seeded per provider, one below threshold [8]
- [x] Providers per company / country — Settings → Payments: providers, masked credentials, wallet names, per-payment and daily limits
- [x] Fee tiers / tax — fee tiers, tax, extra charges, maker/checker, batch size, live fee calculator
- [~] Phone validation by country — libphonenumber-js helper [5]
- [ ] Collections [8]
- [ ] Weekly budget / allowance / support payouts [8, 11, 16]
- [x] Money storage and formatting — integer minor units + currency, only through `formatMoney()`

## Farmer support (Scope 6)

- [ ] Support intake [11]
- [ ] Support types / sub-types [11]
- [ ] Ability to pay [11]
- [ ] Voice notes [11]
- [ ] Group scoring gate + board [11]
- [ ] Approval per service [11]
- [ ] Reject / hold [11]
- [ ] Amount edits [11]
- [ ] Agent confirmation + opt-outs [11]
- [ ] Group wallet [11]
- [ ] MoMo and manual disbursement [11]
- [ ] Fulfilment proof [11]
- [ ] Group fulfilment status [11]
- [ ] Declined refunds [11]
- [ ] Service providers [11]
- [ ] Support dashboards (all / cash / ploughing / input / agroforestry) [11]
- [ ] Recovery windows [11]
- [ ] Recovery request lifecycle [11]
- [ ] Manager review [11]
- [ ] Finance activation + implicit purchase request [11]
- [ ] Repayments cash / produce / mixed [11]
- [ ] Bag barcode for produce [11]
- [ ] Excess purchase [11]
- [ ] Cash confirmation [11]
- [~] Loan ledger (interest, penalty, waterfall, tolerance, rounding) — loan engine with Vitara and Kakao Ivoire terms (tested) [11]
- [~] Settlement quote — cash vs produce, with volume needed (tested) [11]
- [ ] Debt blocking [11]
- [~] Overpayment refunds — ledger reports overpayment (tested) [11]
- [ ] Recovery feedback [11]
- [ ] Recovery views / exports / dashboard [11]
- [ ] Legacy allocations [11]

## Inventory and sales (Scope 7)

- [~] Warehouses — 3 per company seeded, preview table [12]
- [ ] Stock balances [12]
- [ ] Pending inbound [12]
- [ ] Inbound with tag statuses [12]
- [ ] Discrepancies [12]
- [ ] Tolerance auto write-off [12]
- [ ] Physical resolution [12]
- [ ] Weight reimbursement allocation [12]
- [ ] Agent repayment + finance review [12]
- [ ] Outbound [12]
- [ ] Transfer out / in pipeline [12]
- [ ] Transfer weight bounds [12]
- [ ] Stock counts [12]
- [ ] Warehouse expenses + 4-level approval [12]
- [ ] Dispatch (direct + inventory) [13]
- [ ] Dispatch approval [13]
- [ ] Shipment statuses + tracking [13]
- [ ] Verification + documents [13]
- [~] Sale number — per-client sequence pattern `SN-{clientCode}-{seq:4}` [13]
- [ ] Impact metrics [13]
- [ ] Sales contracts (spec, terms, packaging, statuses, fulfilment, documents, officers) [13]
- [ ] Traceboard supplier view [13]
- [~] Traceboard buyer view — buyer companies see only Traceboard; data-sharing grant Vitara → Nordic Shea Butter AB seeded [13]
- [ ] Order detail + document download log [13]
- [ ] Insights request [13]
- [ ] Shipment notifications [13]
- [ ] Carbon projects [14]

## Trees and land (Scope 8)

- [ ] Nursery registration [14]
- [ ] Representative [14]
- [ ] Images / agreement [14]
- [ ] Nursery monitoring rounds [14]
- [ ] Nursery dashboard [14]
- [ ] Nursery list / detail / map / batch history [14]
- [~] Batch numbering — `NB-{yy}-{seq:3}` pattern [14]
- [ ] Seedling sourcing [14]
- [ ] Seedling stock [14]
- [ ] Assignment to agent / company [14]
- [ ] Nursery → farmer assignment [14]
- [ ] Seedling allocation [14]
- [ ] Tree monitoring [14]
- [ ] Tree list / detail / export [14]
- [ ] Tree maps [14]
- [ ] Tree dashboard [14]
- [ ] Tree / community / farmer tree scoring [14]
- [ ] Health score [14]
- [ ] Conservation KPIs / rates [16]
- [ ] Field mapping [14]
- [ ] Plot list / detail / images / agreement [14]
- [ ] Mapping dashboard [14]
- [ ] Plot monitoring [14]
- [ ] EUDR validation / area / deforestation check / DDS export [14]

## Forms and training (Scope 9)

- [x] Form builder — `/app/forms/:id`: palette (37 types in 7 groups, click or drag), canvas with sections and drag-to-reorder, settings panel (labels and help per language, field key, required / required-if, default, placeholder, validation incl. regex and date range, inline or shared options, "Other", randomise, scales, media limits, record type, table rows × columns, formula, maps-to field, sensitive), preview web (EN/FR) and mobile, version history with restore, publish with change summary; AI draft (scripted topics, Claude when a key is set); shared option lists page
- [x] All question types — every type renders on web and mobile, with simulated camera, GPS accuracy, boundary walk with area, QR / NFC / thumbprint, audio and signature
- [x] Skip / display logic — show-if, required-if and jump-to / end-form with AND/OR groups on earlier questions (incl. multi-select), section logic, calculated fields
- [x] Assignment + deploy — all agents, by role, agent type, location or named users; target per agent and due date; reach count
- [x] Lifecycle incl. test — Draft → Test (test users, responses tagged) → Live → Closed; schedule start / end; publishing creates version n+1, responses and records keep their version
- [x] Mobile survey delivery — `/m/surveys`: assigned forms with targets and due dates, subject pick, step-by-step renderer, drafts, offline save to the outbox and send on sync; "needs fix" items return to the phone
- [x] Responses + media — responses table (ID, version, subject, agent, date, GPS accuracy, status, completion) with filters; detail with photos, map, subject link, edit with history
- [x] Review statuses — approve, reject, send back with comment (→ mobile task + notification), resubmit keeps the number
- [x] Analytics — per question by type (choice counts, averages, medians, Likert distribution, NPS), completion, responses per week, map; filters by date, agent, location, status, version
- [x] Summary — totals, average completion, approval rate, agents
- [x] Export — Excel with chosen columns; sensitive answers masked without `farmers.viewSensitive`
- [x] Subject binding — profile forms drive web and mobile registration, farmer list column options and report fields (Journey 9); Settings → Forms picks the form for each record type
- [ ] Training catalogue / topics [15]
- [ ] Workshop planning [15]
- [ ] Status [15]
- [ ] Edit / archive / delete rules [15]
- [ ] Export [15]
- [ ] Dashboard [15]
- [ ] Attendance + ratings + comments [15]
- [ ] Images [15]

## Platform services (Scope 10)

- [x] Dashboards + caching — widget board: ask bar, setup checklist, KPI row, My approvals with inline Approve / Hold / Reject, purchases by week, volume by commodity, top communities, payouts by provider, recovery progress, stock by warehouse, field map, alerts, wallets, activity; customise (drag, resize, add from the library, remove), saved per person or as the company default, role-based default layouts; every widget gated by module and permission; module dashboards reuse the widget system in their phases
- [ ] Exports / report builder [17]
- [~] Email — reset and invite emails written to the outbox (simulated gateway); outbox screen [17]
- [ ] SMS [17]
- [ ] Push [17]
- [ ] Recovery banner / reminders [11]
- [~] Offline sync protocol — mobile outbox store, offline toggle, sync screen; stores sync across tabs [9]
- [ ] Sync logs (scoped, private, retention) [17]
- [ ] Devices [17]
- [~] Activity history (structured) — `{key, params}` events from every seeded approval, rendered via `t('activity.' + key)` [17]
- [~] Audit log — Platform audit (company created, plan changed, suspended, invites, lockouts); company audit log [17]
- [ ] Scheduled jobs [17]
- [ ] Backups (platform) [17]
- [x] Error reporting — n/a in the prototype (noted)
- [x] AI assistant — Ask your operations: dashboard bar with 4 suggestions and /app/ai with conversation history; 24 scripted EN/FR intents over company-scoped data (`src/data/ai-intents.ts`, tested for isolation); answer cards with sentence, chart, table, “Open in …” links, “Explain how this was calculated”, CSV export; module and permission checks; optional Claude fallback when `VITE_ANTHROPIC_API_KEY` is set
- [ ] Knowledge base [17]
- [x] Book a demo — book-a-demo / contact form with country phone validation → confirmation → Platform → Leads

## Hard-coded values (Scope 11)

- [x] Every item in Scope 11 appears as an editable setting with the Vitara value as the template default — 27 Settings pages edit workflows (visual builder with drag-to-reorder, conditions, parallel, auto, separation of duties, flow diagram, try-a-record), numbering, commodities, packaging, price lists, providers, fee tiers, buying rules, loan terms, inventory tolerances, agent types, budgets and penalties, notifications and templates, SMS/email, integrations, security, privacy and mobile; Reset to template restores the company's starting values
