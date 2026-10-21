# Coverage checklist (PRD section 16)

Every line is a feature found in today's backend. Ticked as the prototype builds it.

**Legend:** `[x]` built · `[~]` foundation in place (engine, data or gating), screen comes in a later phase · `[ ]` not started.
Phase numbers in brackets say which phase delivers the full screen.

_Last updated: Phase 13._

Every Settings page (28, PRD A4) has Save (toast + audit entry with before/after), Cancel, Reset to template, a leave-without-saving guard, read-only mode without the edit permission, and "Where this is used" links. Operational pages show the settings in effect (approval route, next number, tolerances).

Prototype-only controls (persona sign-in, demo codes and emails, open mobile window, mobile previews, "view as", "next payout fails", reset demo data, page notes and page actions such as the agent's phone steps for Journey 2) live in the **Demo panel** (flask icon, bottom-right), not in the product UI.

## Foundations (Scope 1)

- [x] Company profile — Settings → Company profile: legal/trading name, registration and tax ID, contacts, countries, currency, languages, time zone, week start, fiscal year, company code, live money/date/number preview
- [x] Platform owner role (replaces org 21) — `platformOwner` role, sees every company, Platform console gated by `platform.*`
- [x] Company list — Platform → Companies: logo, countries, type, plan, modules, active agents, farmers, status, created; View / View as company / Suspend / Reactivate / Change plan; company detail with usage charts, plan limits, modules, admins, grants, audit
- [x] Onboarding wizard — 7 steps + review with AI draft; template (Vitara / blank / cocoa / cashew / shea / grains / coffee); creates company, settings, roles, admin invites; setup checklist on the new company's dashboard
- [x] Company edit — plan and status from the console; profile and branding (logo upload, colour, email/receipt/portal previews) in Settings
- [x] Deactivate / suspend — suspend and reactivate (members of a suspended company can't sign in), audited
- [x] Plan permission ceiling — Platform → Plans shows module bundles, limits and ceiling; enforced in every permission check; Change plan applies it immediately
- [x] Company switching (web + mobile) — web switcher, command palette, persona switcher; mobile Me → Switch company re-downloads that company's data
- [x] Company code / numbering prefix — `{orgCode}` / `{prefix}` tokens, per-company patterns
- [x] Public sign-up — account (strength meter) → verify email (6-digit code) → company basics (currency and language from country) → terms → setup checklist
- [x] Web sign-in — email + password with attempt counter and lockout, SSO (domain lookup → identity provider screen), 2-step code, remember this device, company picker
- [x] Token / session expiry — idle warning modal with countdown (company session length), sessions revocable; a revoked session signs its tab out
- [x] Agent phone + code login — `/m`: phone (country + number) → one-time code (company OTP length, shown in the Demo panel and a toast) → company pick when several → data download per module → 4-digit PIN; auto-lock after 5 minutes idle, unlock with the PIN
- [x] OTP by SMS / email — email verification, 2-step and agent phone sign-in codes (simulated, shown in the Demo panel)
- [x] Resend code — 2-step (with cooldown), email verification and agent phone sign-in
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
- [x] Groups in community sync (upsert) — groups added during mobile community profiling, and mobile group saves, upsert by name within the community; meeting / contribution records send the group score for review
- [x] Community list / detail / map / dashboard / edit — filters + saved views, column picker, CSV export, drawer (overview map, profile, leaders, documents, farmers, groups, purchases, activity), `/app/communities/map` with score-coloured pins, dashboard (profiled, average farmers, bought from, top 3s, over time)
- [x] Community score — Vitara model (profile 20 + purchases 35 + training 15 + trees 30) with breakdown and recalculate (replaces); workshops / trees count as zero until phases 14–15
- [x] Farmer profile (all fields) — Vitara v3 farmer form (incl. spouse show-if, children repeat group, ID type / number); edit creates a new version with a change history
- [x] Farmer ID pattern — `{community}-{initials}-{seq}` / `KI-{region}-{seq:5}` on registration; "Import existing IDs" keeps a supplied ID
- [x] Thumbprints — left / right status on the Identity tab; captured on the phone during registration (simulated reader) with photo, ID card, consent (audio / signature / tick with read-aloud) and NFC card
- [x] Consent audio / signature — Identity tab shows audio player (simulated), signature image or tick; record consent from the web
- [x] ID card and photo — status on the Identity tab, plus document upload
- [x] NFC card lifecycle — issue, replace, revoke (permission `farmers.manageNfc`)
- [x] Data-quality rules + review — `/app/data-quality`: queue (farmers, communities, groups) with rule, severity, agent, source, date; bulk assign to agent (mobile task), mark valid with reason, re-check; charts by rule, by agent, weekly trend; Vitara rules incl. disabled ewe / tertiary / tractor with notes
- [x] Farmer score — farmer model (consent, identity, purchases, group, no overdue loan) with breakdown and recalculate
- [x] Farmer list / detail / export / profiling report / dashboard — list with all PRD columns, saved views (Women farmers, No consent, Blocked by debt, Flagged), register with duplicate check (phone / ID number), drawer tabs, CSV export with column picker, profiling report by agent, dashboard (gender, age bands, education, income, real household / children averages, registrations, by agent)
- [x] Mobile communities, farmers and groups — `/m/communities` (list, profile with location, GPS, live profile form, leaders, groups, documents), `/m/farmers` (list, detail with loans and balance, purchases, fix task; edit as a new version, conflict-checked on sync), `/m/groups` (details, form, members, leaders, payment, records); all save offline
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
- [x] Mobile status updates — `/m/buying`: the agent's requests with status, home alerts link to the request, confirm funds received, sign the receipt, approve / hold / reject when the role allows, approval timeline
- [x] Price update — above the list price the request goes back for approval (PRICE_UPDATE), price history kept
- [x] Rate confirmation
- [x] Full / partial disbursement — tranches with amount and weight, partial count limit from Buying rules
- [x] Cash advance payout — 3-step pay modal (lookup, charges, maker–checker), failure + retry (Demo panel → "Next payout fails"), partial tranches with weight
- [x] Manual disbursement + funds received — proof upload; agent's "funds received" simulated from the Demo panel until mobile [9]
- [x] Ticket activation — direct-payment requests
- [x] Receipts + signature — printable receipt (company legal name), agent signature image
- [x] Reconciliation statuses — Fulfilled, Overpaid, Refund agent, Receive refund, Reconciled; direct payment: Ticket activated / Partially paid / Fully paid; auto-matched chip; tolerance auto-reconciles
- [x] Agent refunds — full / partial with proof, or simulated mobile-money collection; pay the agent the difference
- [x] Manual write-off — within the company limit, permission + reason
- [x] Archive / export / list filters — archive, CSV export, saved tabs, column picker
- [x] Farmer purchase sync — `/m/buying/purchase`: request → farmer (search, NFC tap, card scan) with debt check → weight (manual or read scale) → bags (scan each, or one consolidated bag shared by several farmers with live total vs packaging min / max) → scale photo, voice note, GPS → cash with farmer signature, or direct mobile money (wallet, name check, pay now) → receipt with SMS. Offline purchases wait in the outbox; Sync writes them, sends the SMS receipts, the web shows a toast and auto-reconciliation runs
- [x] Debt blocking — block / warn / deduct per policy on web purchase entry and the purchase banner; Abena Issah blocked
- [x] Bags / QR — bag registry (`/app/purchases/bags`), scannable QR codes, status, warehouse, history (purchase → PRE → inbound), per-farmer contributions
- [x] Consolidated bags — several farmers per bag, kg each, within packaging bounds
- [x] Barcode replacement — replace a damaged bag: new code, weight variance and who did it logged; purchases follow the new code
- [x] Voice notes — `/m/buying/voice`: Twi / Dagbani / Hausa / French, 3 s waveform, scripted transcript parsed into farmer and kg, continues into the purchase with the voice note attached; simulated player on the web
- [x] Scale photo — captured on the phone (required step), shown in the purchase drawer
- [x] Wallet edit — payout wallet on a purchase, permission-gated, locked once payment starts
- [x] Purchase list tabs — Cash-advance, Direct-payment, Unpaid; every PRD column incl. evidence icons and consolidated reference
- [x] Purchases dashboard (aggregator thresholds) — volume, spend, farmers, averages, smallholder vs aggregator split, top 3 agents and communities, cost per bag from PREs, purchases over time
- [x] Related unpaid purchases — purchase drawer offers paying the request's other unpaid purchases together; bulk pay from the list (same request, up to the company batch size)
- [x] Sourcing export — CSV export of purchases and requests
- [x] PRE create / 4-level approvals / hold / resume / disburse / receipt / edit / wallet — catalogue lines with basis, default rate and caps, bag scan when required, payee wallet, edit only before the first human approval, MoMo or manual payment, printable receipt; agents create PREs on the phone too (`/m/buying/pre/new`, offline-capable)
- [x] Pending inbound trigger — paying a PRE whose expense type triggers inbound creates the expected delivery at the agent's warehouse (or the company hub) and moves its bags in transit
- [x] Price board — current price per commodity × zone, change history, paid vs list chart, suggested price (median paid within the tolerance band)
- [x] Aggregator registry — `/app/aggregators/suppliers`: individual / company, contact, address, ID / KYC documents, payout by mobile money or bank (bank list per country), status Pending approval / Approved / Blocked, purchase history; new suppliers need approval by someone other than their creator, blocking needs a reason, payout edits are logged
- [x] Aggregator purchase create / approve / reject / disburse — `/app/aggregators`: list with every PRD column, views and filters, CSV export; create with supplier search or a new supplier inline, unique PO number, bags × weight per bag, price from the list with tolerance and override reason, deal currency and exchange rate (company-currency total shown), includes PRE, PO file and optional weighbridge report, aggregator-threshold hint; approval through the workflow engine; disburse in part or in full by mobile money / bank (payments engine, maker-checker) or manual proof, never above the total and only once the supplier is approved
- [x] Aggregator expenses — ACSPRE (`/app/aggregators/expenses`): bags and lines from the company catalogue (Vitara template: the 40 logistics lines, editable in Settings → Buying rules → Expense catalogue alongside PRE lines), caps, payee wallet, two-step approval, edit only before the first approval, mobile-money or manual payment, printable receipt
- [x] Delivery details — load truck (driver, contact, plate, bags and kg loaded, waybill) → In transit
- [x] Proof of delivery — customer, bags / kg / t delivered, unit price, weighbridge report, invoice, quality report → Delivered; the result is previewed and computed with the company tolerance
- [x] Aggregator refunds / reconciliation — receive refund (goods on a new PO with bags and kg, or money with proof), refund the supplier (proof, or pay the difference by mobile money), Fulfilled → Mark reconciled; money and volume reconciliation side by side
- [x] Commodity catalogue — Settings → Commodities: names per language, codes, aliases, HS codes, units, quality parameters, grades, thresholds, EUDR and scoring flags
- [x] Units — Settings → Units & packaging: units and conversions, packaging profiles, conversion check
- [x] Price lists — Settings → Price lists: commodity × zone × grade, effective dates, tolerance, premiums, change approval switch, price history

## Money (Scope 5)

- [~] Payable types — all 12 types in the engine; agent cash advance, PRE, single and bulk farmer purchase, aggregator purchase and expense, farmer support and loan refunds pay through it now; the others with their modules [16]
- [x] Payment preview + name lookup — Payees step: network detected from the number, provider override, "Name on wallet ✓" or mismatch warning that must be confirmed
- [x] Disburse with charges — Charges step: provider fee (tiers, caps, payer), withdrawal charge per provider (% or flat, "include withdrawal charges"), tax, extra charges, total, who pays
- [x] Extra charges — picked per payment from the company list (company- or payee-paid)
- [x] Bulk farmer payment — select unpaid direct-payment purchases → one batch, progress and result per payee
- [x] Webhook / status updates (simulated) — Processing → provider callback (Successful / Failed with reason / Unknown), timeline and raw provider response on every payment
- [x] Status check — "Check status" on Unknown payments (pay modal results, drawer, list)
- [x] Payment history / stats / export — Payments page: every column, filters (type, provider, initiated by, period), views, stat cards, by type / by provider charts, CSV export, retry selected
- [x] Maker–checker — above the company threshold a second person with payments.check approves (never the maker), bulk approve or reject from the Awaiting checker view; notifications to checkers
- [x] Limits & controls — per-payment and daily limits per role (Settings → Roles) and per provider, wallet balance check, blocked with an explanation
- [x] Reversal — mark a successful payment reversed (reason), wallet credited back, payable reset
- [x] Wallet balance — Wallets & balances: card per provider wallet, low-balance alert, paid out today, transactions (payouts, reversals, collections, top-ups), simulated top-up request
- [x] Providers per company / country — Settings → Payments: providers, masked credentials, wallet names, per-payment and daily limits, withdrawal charge
- [x] Fee tiers / tax — fee tiers, tax, extra charges, maker/checker with threshold, batch size, live fee calculator
- [~] Phone validation by country — libphonenumber-js helper [5]
- [x] Collections — mobile-money collection request (agent refund from Reconciliation); the agent's phone shows the approval prompt (PIN); approved money credits the wallet and records the refund; Collections view on Payments
- [~] Weekly budget / allowance / support payouts — support payouts built; budgets and allowances [16]
- [x] Money storage and formatting — integer minor units + currency, only through `formatMoney()`

## Farmer support (Scope 6)

- [x] Support intake — web sheet and phone wizard (M6): group, primary + secondary support, amount per farmer (capped by the type maximum), ability to pay, agroforestry interest, farmers picked from the group, GPS
- [x] Support types / sub-types — Settings → Support & loans: name per language, code, kind, unit, sub-types, maximum, provider needed, paid to, evidence required, scoring, recoverable (Vitara: cash, ploughing, 8 farm inputs, agroforestry; Kakao Ivoire: inputs, cash)
- [x] Ability to pay — company list, per farmer line, dashboard donut
- [x] Voice notes — leader and witness recordings on the request, fulfilment audio per farmer, played back in the drawer
- [x] Group scoring gate + board — a group with unscored record documents holds the request at "Waiting for score"; the manual review on the group releases it to approval; board and list views with saved views
- [x] Approval per service — dialog per service: amount per farmer, provider and arrangement, expected kg; also from the dashboard queue (opens the dialog)
- [x] Reject / hold — workflow buttons with a required reason
- [x] Amount edits — per farmer before approval, old → new kept on the line and in the activity
- [x] Agent confirmation + opt-outs — phone: here / absent / opted out per farmer, then confirm
- [x] Group wallet — confirmed or corrected by the agent at confirmation; used for the MoMo payout
- [x] MoMo and manual disbursement — pay the group, each farmer, or the provider through the payments engine (maker–checker above the threshold); manual with proof; loans open at payout
- [x] Fulfilment proof — audio (+ GPS) per farmer on the phone
- [x] Group fulfilment status — Pending / Partly / Fully fulfilled; the request moves to Fulfilled
- [x] Declined refunds — refund a farmer who opted out after payment (method, reference, document)
- [x] Service providers — list, drawer with jobs and amounts, add/edit (services, offers, location, wallet)
- [x] Support dashboards (all / cash / ploughing / input / agroforestry) — KPIs, disbursed by district (top N) and by year, ability to pay, inputs given
- [x] Recovery windows — list and calendar, create/edit with overlap and date checks, reminders, days left
- [x] Recovery request lifecycle — Manager review → Finance review → Activated → Partly / Fully recovered, or Rejected (only before any repayment)
- [x] Manager review — recovery commodity, price per kg (list price prefilled), excess price
- [x] Finance activation + implicit purchase request — excess price change needs a reason; a linked direct-payment purchase request is created (company switch)
- [x] Repayments cash / produce / mixed — web dialog and phone (M7) with quote, mode, weight (scale), cash + receipt photo; receipt with the new ledger
- [x] Bag barcode for produce — scanned on the phone, typed on the web
- [x] Excess purchase — produce beyond the balance is bought on the linked request at the excess price
- [x] Cash confirmation — finance confirms the receipt photo (Repayments → Cash to confirm)
- [x] Loan ledger (interest, penalty, waterfall, tolerance, rounding) — ledger table per loan, balance chart, print; Vitara and Kakao Ivoire terms (tested)
- [x] Settlement quote — cash vs produce with volume needed, and a what-if date slider
- [x] Debt blocking — overdue active loans block (or warn / deduct) at purchase; "Blocked at purchase" view; unblocked when settled
- [x] Overpayment refunds — "To refund" view, refund by MoMo or manually with proof
- [x] Recovery feedback — experience, would borrow again, comment (phone); shown in the drawer
- [x] Recovery views / exports / dashboard — requests board/list, loans and repayments views, CSV exports, expected vs recovered, rate by district / agent / group, ageing
- [x] Legacy allocations — read-only archive with repayments and voice notes; migrate one into a loan

## Inventory and sales (Scope 7)

- [x] Warehouses — list and map, type, place, officers, capacity, stock by commodity, utilisation, open discrepancies; detail with stock (by commodity, by bag, ageing), movements, expected, discrepancies, counts, expenses, officers, activity
- [x] Stock balances — bags in stock per warehouse; every movement keeps the balance before and after
- [x] Pending inbound — expected deliveries from paid PREs (bag list, source agent, kg) and from transfers; on the officer's phone
- [x] Inbound with tag statuses — Original / Missing / Replaced tag / Weight top-up per bag, web and phone (M8)
- [x] Discrepancies — missing and weight, expected vs received, variance kg and %, Open / Auto written off / Resolved, resolution type; list, filters, export
- [x] Tolerance auto write-off — under the commodity and movement tolerance, with a status and an activity note
- [x] Physical resolution — bag returned, tag replaced, written off with a reason
- [x] Weight reimbursement allocation — top-up bags go to the oldest open weight discrepancies first, allocation shown
- [x] Agent repayment + finance review — owed = lost kg × blended purchase/loan-produce price (or list price) + logistics share for missing bags; agent pays on the phone with proof; finance approves in full, in part (balance stays) or rejects with a reason
- [x] Outbound — pick or scan bags; bags out of stock
- [x] Transfer out / in pipeline — bags in transit, expected at the destination for its officer, received with the same bag statuses; the phone shows each step (received, missing, written off, weight, stock)
- [~] Transfer weight bounds — each bag checked against the packaging min/max and the transfer tolerance; the overall out-vs-in percentage setting is shown but not yet enforced [18]
- [x] Stock counts — scheduled (company frequency) or ad hoc, scan on the phone (blind option), expected vs counted, by agent and commodity, photos, adjustment request approved by someone else
- [x] Warehouse expenses + 4-level approval — company expense types (Settings → Inventory rules), lines per payee, Vitara 4 people / Kakao Ivoire 2, MoMo per line or manual proof, Pending / Partial / Full / Rejected
- [x] Dispatch (direct + inventory) — from inventory loads pending outbounds (commodity must match the contract) or bought direct from purchase requests; client, optional contract, loading point, driver (name, phone, licence image), truck (plate, image), waybill, expected kg and t; outbounds are marked as loaded
- [x] Dispatch approval — workflow from Settings → Approvals (Vitara: logistics/operations, Kakao Ivoire: same); the creator can't approve; on the dashboard queue
- [x] Shipment statuses + tracking — Pending → In transit → Arrived → Delivered → Verified (+ On hold); truck GPS and ETA updates, map with the truck pin, step-by-step timeline
- [x] Verification + documents — weighbridge report, invoice, optional quality test, delivered weight and bags, unit price, amount; Documents tab with add and download
- [x] Sale number — issued at verification from the per-client sequence `SN-{clientCode}-{seq:4}`; the buyer and the sales team are told
- [x] Impact metrics — snapshot on each order and live on Traceboard: farmers, communities, women share, children per farmer, trees planted, plots mapped, EUDR %; which KPIs buyers see is set in Settings → Sales rules
- [x] Sales contracts (spec, terms, packaging, statuses, fulfilment, documents, officers) — created from templates, quality spec from the commodity, payment schedule from the terms with due dates, mark received, overdue flags, Draft / Agreed / Order created / Fulfilled (with tolerance) / Cancelled, orders and deliveries chart, signed contract upload, printable contract with the company as seller
- [x] Traceboard supplier view — buyers served, delivered, amount, orders in transit, delivered by month and commodity, top customers; share settings per buyer (orders / traceability / impact) on the data-sharing grant
- [x] Traceboard buyer view — buyer companies see only Traceboard, branded with the supplier's logo: total weight, amount, orders, crops by weight, upcoming dispatches, farmers and communities, impact, certifications, trace map; only for the buyer's own client record and only while the grant shares orders
- [x] Order detail + document download log — buyer order drawer with order and sale number, kg and t, driver, truck, timeline, trace to source (communities sized by kg, plot polygons by EUDR status), impact, documents; every download is logged with the person and company
- [x] Insights request — buyer asks a supplier (optionally about one order); supplier answers from the Traceboard inbox; both are notified
- [x] Shipment notifications — In transit, Delivered (action required), Verified to the buyer's Traceboard users and the supplier's sales team, with supplier branding in the text
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
- [~] Recovery banner / reminders — open-window banner with days left on the agent's phone; push and SMS reminder switches per window (sending with notifications) [17]
- [x] Offline sync protocol — every phone save goes through one queue: applied at once when online, kept in the outbox when offline; Sync screen with counts by type, data usage, per-item results, errors kept for retry, and conflicts (the office changed the record first) resolved with Keep office version / Send mine; stores sync across tabs
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
