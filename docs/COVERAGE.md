# Coverage checklist (PRD section 16)

Every line is a feature found in today's backend. Ticked as the prototype builds it.

**Legend:** `[x]` built · `[~]` foundation in place (engine, data or gating), screen comes in a later phase · `[ ]` not started.
Phase numbers in brackets say which phase delivers the full screen.

_Last updated: Phase 3._

Every Settings page (27, PRD A4) has Save (toast + audit entry with before/after), Cancel, Reset to template, a leave-without-saving guard, read-only mode without the edit permission, and "Where this is used" links. Operational pages show the settings in effect (approval route, next number, tolerances).

Prototype-only controls (persona sign-in, demo codes and emails, open mobile window, mobile previews, "view as", reset demo data, page notes) live in the **Demo panel** (flask icon, bottom-right), not in the product UI.

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

- [~] Location levels + explorer + zones — Settings → Locations: level labels per language, tree editor (add / rename / recode), CSV import, zones; explorer page [5]
- [~] Agent multi-area assignment — agents hold many area nodes in the data [16]
- [~] Community profile (v1–v3 fields) — Vitara template fields seeded as `customFields` [5]
- [~] Community code pattern — `{region}-{seq:3}` (Daffiama = WA-014), editable in Settings → Farmer ID & codes [5]
- [ ] Leaders [5]
- [ ] Documents [5]
- [ ] Groups in community sync (upsert) [9]
- [~] Community list / detail / map / dashboard / edit — seeded preview table [5]
- [~] Community score — scoring engine scaffolded and tested [5]
- [~] Farmer profile (all fields) — Vitara and Kakao Ivoire template fields seeded [5]
- [~] Farmer ID pattern — `{community}-{initials}-{seq}` (WA-014-AI-0023), `KI-{region}-{seq:5}`; editable with live preview in Settings → Farmer ID & codes [5]
- [~] Thumbprints — identity status seeded [5]
- [~] Consent audio / signature — consent type seeded [5]
- [~] ID card and photo — identity status seeded [5]
- [~] NFC card lifecycle — card status seeded (Issued / Replaced / Revoked) [5]
- [~] Data-quality rules + review — Settings → Data quality: rule editor with test on a sample of real records; review queue [5]
- [ ] Farmer score [5]
- [~] Farmer list / detail / export / profiling report / dashboard — seeded preview table [5]
- [ ] Shared farmers / communities [5]
- [~] Farmer groups profile / members / leaders / documents / payment details — groups, real membership table, group wallets seeded [5]
- [~] Group scorecard + manual review — one group seeded "Pending review" [5]
- [ ] VSLA savings [5]
- [ ] Community import [5]
- [ ] Farmer import [5]
- [ ] Other imports [5]

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

- [~] Purchase request create / approve / reject / hold — workflow engine (tested); 90 Vitara + 40 Kakao Ivoire requests seeded through it [7]
- [~] All PR statuses — every Vitara status seeded [7]
- [ ] Mobile status updates [9]
- [ ] Price update [7]
- [ ] Rate confirmation [7]
- [~] Full / partial disbursement — tranches seeded [7]
- [~] Cash advance payout — payments seeded [8]
- [ ] Manual disbursement + funds received [7]
- [ ] Ticket activation [7]
- [ ] Receipts + signature [7]
- [~] Reconciliation statuses — seeded [7]
- [ ] Agent refunds [7]
- [ ] Manual write-off [7]
- [~] Archive / export / list filters — sortable, paginated preview table [7]
- [ ] Farmer purchase sync [9]
- [~] Debt blocking — Abena Issah's overdue GHS 840 loan seeded; loan engine computes it [7, 11]
- [~] Bags / QR — bag registry data with consolidated bags [7]
- [~] Consolidated bags — several farmers per bag in seed [7]
- [ ] Barcode replacement [12]
- [~] Voice notes — evidence references seeded [9]
- [~] Scale photo — evidence references seeded [9]
- [ ] Wallet edit [7]
- [ ] Purchase list tabs [7]
- [~] Purchases dashboard (aggregator thresholds) — thresholds per commodity in settings [7]
- [ ] Related unpaid purchases [7]
- [ ] Sourcing export [7]
- [~] PRE create / 4-level approvals / hold / resume / disburse / receipt / edit / wallet — Vitara PRE workflow (auto + levels 2–4, hold resumes from previous step) tested; 300 PREs seeded [7]
- [ ] Pending inbound trigger [12]
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

- [~] Form builder — form schema types [6]
- [~] All question types — all 37 types in the form engine catalogue [6]
- [~] Skip / display logic — AND/OR show-if logic with all operators (tested) [6]
- [ ] Assignment + deploy [6]
- [~] Lifecycle incl. test — statuses and versioned publish in the engine [6]
- [ ] Mobile survey delivery [10]
- [ ] Responses + media [6]
- [ ] Review statuses [6]
- [ ] Analytics [6]
- [ ] Summary [6]
- [ ] Export [6]
- [~] Subject binding — bindings modelled in the engine [6]
- [ ] Training catalogue / topics [15]
- [ ] Workshop planning [15]
- [ ] Status [15]
- [ ] Edit / archive / delete rules [15]
- [ ] Export [15]
- [ ] Dashboard [15]
- [ ] Attendance + ratings + comments [15]
- [ ] Images [15]

## Platform services (Scope 10)

- [~] Dashboards + caching — Phase 1 dashboard: KPI row, approval queue, company facts [4]
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
- [ ] AI assistant [4]
- [ ] Knowledge base [17]
- [x] Book a demo — book-a-demo / contact form with country phone validation → confirmation → Platform → Leads

## Hard-coded values (Scope 11)

- [x] Every item in Scope 11 appears as an editable setting with the Vitara value as the template default — 27 Settings pages edit workflows (visual builder with drag-to-reorder, conditions, parallel, auto, separation of duties, flow diagram, try-a-record), numbering, commodities, packaging, price lists, providers, fee tiers, buying rules, loan terms, inventory tolerances, agent types, budgets and penalties, notifications and templates, SMS/email, integrations, security, privacy and mobile; Reset to template restores the company's starting values
