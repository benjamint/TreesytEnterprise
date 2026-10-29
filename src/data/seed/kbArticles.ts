import type { KbArticle } from '@/types';
import { ORG } from './templates';

type Seed = Omit<KbArticle, 'updatedAt'> & { daysAgo: number };

/** Help articles: global ones every company sees, plus a few each company wrote for its own team (PRD K7). */
export const KB_ARTICLES: Seed[] = [
  {
    id: 'kb_start', slug: 'getting-started', category: 'basics', tags: ['setup', 'checklist'], daysAgo: 40, updatedBy: 'u_benjamin',
    title: { en: 'Getting started with TreeSyt', fr: 'Bien démarrer avec TreeSyt' },
    body: {
      en: `TreeSyt runs your sourcing from the farmer to the buyer: **farmers, buying, payments, stock, sales and the field team** in one place.

## First steps
1. Open **Settings → Company profile** and check your currency, time zone and week start.
2. Turn on the modules you use in **Settings → Plan & modules**.
3. Invite your office team from **People → Users** and your agents from **Agents**.
4. Publish your farmer profile form in **Forms** so agents can register farmers on the phone.

## Where things are
- The **dashboard** shows what needs you today: approvals, payments and alerts.
- Every list has saved views, filters and an export.
- The **?** menu has this help, keyboard shortcuts and "What's configurable here".

Need more? See [Approvals and workflows](/app/help?a=approvals).`,
      fr: `TreeSyt gère votre approvisionnement du producteur à l’acheteur : **producteurs, achats, paiements, stock, ventes et équipe terrain** au même endroit.

## Premiers pas
1. Ouvrez **Paramètres → Profil de l’entreprise** et vérifiez la devise, le fuseau horaire et le début de semaine.
2. Activez les modules que vous utilisez dans **Paramètres → Offre et modules**.
3. Invitez l’équipe du bureau depuis **Personnes → Utilisateurs** et vos agents depuis **Agents**.
4. Publiez le formulaire de profil producteur dans **Formulaires** pour l’enregistrement sur téléphone.

## Où trouver quoi
- Le **tableau de bord** montre ce qui vous attend : validations, paiements et alertes.
- Chaque liste a des vues enregistrées, des filtres et un export.
- Le menu **?** contient cette aide, les raccourcis clavier et « Ce qui est paramétrable ici ».`,
    },
  },
  {
    id: 'kb_approvals', slug: 'approvals', category: 'workflows', tags: ['approvals', 'workflow', 'hold'], daysAgo: 25, updatedBy: 'u_benjamin',
    title: { en: 'Approvals and workflows', fr: 'Validations et circuits' },
    body: {
      en: `Requests move through the approval steps your company set in **Settings → Approvals**.

## Approve, hold or reject
- **Approve** moves the request to the next step. The last step makes it ready to pay.
- **Hold** keeps it waiting with a reason; it comes back to your queue.
- **Reject** needs a reason, which the agent sees on the phone.

## Who can approve
Each step names a permission. People with that permission see the request in **My approvals**. You never approve your own request.

> Tip: use the board view to approve several requests at once.`,
      fr: `Les demandes passent par les étapes définies dans **Paramètres → Validations**.

## Valider, suspendre ou rejeter
- **Valider** fait passer à l’étape suivante. La dernière étape la rend payable.
- **Suspendre** la garde en attente avec un motif.
- **Rejeter** exige un motif, visible par l’agent sur le téléphone.

## Qui peut valider
Chaque étape demande une permission. Les personnes qui l’ont voient la demande dans **Mes validations**. On ne valide jamais sa propre demande.`,
    },
  },
  {
    id: 'kb_payments', slug: 'mobile-money', category: 'payments', tags: ['payments', 'momo', 'wallet', 'unknown'], daysAgo: 18, updatedBy: 'u_benjamin',
    title: { en: 'Paying by mobile money', fr: 'Payer par mobile money' },
    body: {
      en: `Payments go out from your company wallets through the provider of each payee's number.

## Statuses
- **Successful** — the provider confirmed the transfer.
- **Failed** — nothing was sent. Fix the number and **Retry**.
- **Unknown** — the provider did not answer. Use **Check status** before paying again: the job "Payment status polling" also checks every 5 minutes.

## Charges
Provider fees and tax are shown before you confirm. Bulk runs show the total for all payees.`,
      fr: `Les paiements partent de vos portefeuilles vers l’opérateur du numéro de chaque bénéficiaire.

## Statuts
- **Réussi** — l’opérateur a confirmé.
- **Échoué** — rien n’est parti. Corrigez le numéro et **Réessayez**.
- **Inconnu** — pas de réponse de l’opérateur. Utilisez **Vérifier le statut** avant de repayer ; la tâche « Suivi des paiements » vérifie aussi toutes les 5 minutes.`,
    },
  },
  {
    id: 'kb_offline', slug: 'working-offline', category: 'mobile', tags: ['offline', 'sync', 'phone', 'outbox'], daysAgo: 12, updatedBy: 'u_benjamin',
    title: { en: 'Working offline on the phone', fr: 'Travailler hors ligne sur le téléphone' },
    body: {
      en: `Everything an agent saves on the phone works without a network. It waits in the outbox until they tap **Sync**.

## When a sync fails
Open **Sync logs** in the office to see what happened:
- **Duplicate** — the farmer or bag already exists. Ask the agent to search before adding.
- **Conflict** — the office changed the record first. The agent chooses which version to keep.
- **Timeout** — usually photos on a slow network. Sync again on Wi-Fi.
- **Version** — the app is older than your minimum version. The agent must update.`,
      fr: `Tout ce que l’agent enregistre sur le téléphone fonctionne sans réseau et attend dans la boîte d’envoi jusqu’à **Synchroniser**.

## Quand une synchronisation échoue
Ouvrez **Journaux de synchronisation** au bureau :
- **Doublon** — le producteur ou le sac existe déjà.
- **Conflit** — le bureau a modifié la fiche avant.
- **Délai dépassé** — souvent des photos sur un réseau lent.
- **Version** — l’application est plus ancienne que la version minimale.`,
    },
  },
  {
    id: 'kb_reports', slug: 'reports', category: 'reports', tags: ['reports', 'export', 'excel', 'schedule'], daysAgo: 6, updatedBy: 'u_benjamin',
    title: { en: 'Reports and exports', fr: 'Rapports et exports' },
    body: {
      en: `The **report library** has every standard export. Copy one to change its columns or filters.

## Build a report
1. Pick what to report on (farmers, purchases, payments…).
2. Choose columns, including your profile form fields.
3. Add filters and, if you like, a **group by** and a chart.
4. Save it, share it with roles, or **schedule** a daily or weekly email.

Large exports run in the background. You get a download link that stays valid for **24 hours**.`,
      fr: `La **bibliothèque** contient tous les exports standards. Copiez-en un pour changer colonnes ou filtres.

## Créer un rapport
1. Choisissez le sujet (producteurs, achats, paiements…).
2. Choisissez les colonnes, y compris les champs de votre formulaire.
3. Ajoutez des filtres, un **regroupement** et un graphique.
4. Enregistrez, partagez avec des rôles ou **planifiez** un e-mail quotidien ou hebdomadaire.

Les gros exports tournent en arrière-plan ; le lien reste valable **24 heures**.`,
    },
  },
  {
    id: 'kb_privacy', slug: 'data-retention', category: 'security', tags: ['privacy', 'retention', 'audit', 'gdpr'], daysAgo: 30, updatedBy: 'u_benjamin',
    title: { en: 'Data retention and the audit log', fr: 'Conservation des données et journal d’audit' },
    body: {
      en: `**Settings → Data & privacy** sets how long each kind of data is kept. The nightly "Data retention purge" job removes what is older.

- Sync logs and their request bodies follow separate limits.
- The audit log cannot be edited or deleted by anyone in the company.
- Personal fields in sync payloads are masked unless you can view sensitive data.`,
      fr: `**Paramètres → Données et confidentialité** fixe la durée de conservation. La tâche de nuit « Purge de conservation » supprime le reste.

- Les journaux de synchronisation et leurs contenus ont des limites séparées.
- Le journal d’audit ne peut être ni modifié ni supprimé.
- Les champs personnels sont masqués sauf permission de voir les données sensibles.`,
    },
  },
  {
    id: 'kb_field', slug: 'plans-and-budgets', category: 'fieldTeam', tags: ['plans', 'budgets', 'retirement', 'carry-forward'], daysAgo: 9, updatedBy: 'u_benjamin',
    title: { en: 'Weekly plans, budgets and retirements', fr: 'Plans hebdomadaires, budgets et justificatifs' },
    body: {
      en: `1. A supervisor **publishes** the weekly plan.
2. Agents send a **budget** from the phone for their trips.
3. The manager and finance approve; payment goes to the agent's wallet minus any **carry-forward**.
4. After the week the agent **retires** the budget with receipts. Unused money is refunded or carried forward.`,
      fr: `1. Le superviseur **publie** le plan de la semaine.
2. Les agents envoient un **budget** depuis le téléphone.
3. Le responsable et la finance valident ; le paiement part moins les **reports**.
4. Après la semaine l’agent **justifie** avec ses reçus.`,
    },
  },
  {
    id: 'kb_shortcuts', slug: 'keyboard-shortcuts', category: 'basics', tags: ['keyboard', 'shortcuts'], daysAgo: 50, updatedBy: 'u_benjamin',
    title: { en: 'Keyboard shortcuts', fr: 'Raccourcis clavier' },
    body: {
      en: `- \`Ctrl K\` or \`⌘ K\` — search and jump anywhere
- \`?\` — show all shortcuts
- \`G\` then \`D\` — dashboard
- \`G\` then \`F\` — farmers
- \`Esc\` — close a dialog or side sheet`,
      fr: `- \`Ctrl K\` ou \`⌘ K\` — rechercher et aller partout
- \`?\` — tous les raccourcis
- \`G\` puis \`D\` — tableau de bord
- \`G\` puis \`F\` — producteurs
- \`Échap\` — fermer une fenêtre`,
    },
  },
  {
    id: 'kb_api', slug: 'api-and-webhooks', category: 'integrations', tags: ['api', 'webhooks', 'integrations'], daysAgo: 20, updatedBy: 'u_benjamin',
    title: { en: 'API keys and webhooks', fr: 'Clés API et webhooks' },
    body: {
      en: `Create keys in **Settings → Integrations** and give each one only the scopes it needs. Webhooks send an event to your URL when something happens, such as a completed payment. See the [API reference](/app/help/api) for the endpoints and sample JSON.`,
      fr: `Créez des clés dans **Paramètres → Intégrations** avec seulement les droits nécessaires. Les webhooks envoient un événement à votre URL, par exemple un paiement réussi. Voir la [référence API](/app/help/api).`,
    },
  },
  // ---- Vitara's own articles ----
  {
    id: 'kb_vit_season', orgId: ORG.vitara, slug: 'shea-season-checklist', category: 'buying', tags: ['shea', 'season', 'checklist'], daysAgo: 14, updatedBy: 'u_kwame',
    title: { en: 'Shea season checklist (Vitara)' },
    body: {
      en: `Before the first market day of the season:
- [ ] Price list for shea published and shared with agents
- [ ] Every CEO agent has scales checked and bag codes printed
- [ ] Wallets topped up: MTN and Telecel above **GHS 40,000**
- [ ] Warehouses in Wa and Tamale have space for **120 t**

Questions: ask the operations desk in Tamale.`,
    },
  },
  {
    id: 'kb_vit_topup', orgId: ORG.vitara, slug: 'wallet-top-ups', category: 'payments', tags: ['wallet', 'top-up', 'finance'], daysAgo: 4, updatedBy: 'u_efua',
    title: { en: 'Wallet top-ups at Vitara' },
    body: {
      en: `Finance tops up the mobile money wallets every **Monday and Thursday**. If a wallet goes below its low-balance alert, request a top-up from **Payments → Wallets** and add the bank reference. Two people must confirm a top-up above GHS 20,000.`,
    },
  },
  {
    id: 'kb_vit_budget', orgId: ORG.vitara, slug: 'budget-rules', category: 'fieldTeam', tags: ['budget', 'limits', 'fuel'], daysAgo: 8, updatedBy: 'u_fuseini',
    title: { en: 'Weekly budget rules at Vitara' },
    body: {
      en: `- Fuel is paid per trip: up to **GHS 60** per community visit.
- Food: **GHS 25** per field day.
- Retire last week's budget before you send a new one.
- Receipts must be dated inside the plan week.`,
    },
  },
  // ---- Kakao Ivoire's own articles ----
  {
    id: 'kb_ki_campagne', orgId: ORG.kakao, slug: 'campagne-cacao', category: 'buying', tags: ['cacao', 'campagne'], daysAgo: 11, updatedBy: 'u_serge',
    title: { fr: 'Ouverture de la campagne cacao' },
    body: {
      fr: `- Le prix bord champ est publié dans **Achats → Tableau des prix** le jour de l’ouverture.
- Chaque délégué vérifie sa balance et son stock de sacs.
- Les achats au-dessus de **5 t** par jour passent par le superviseur de zone.`,
    },
  },
  {
    id: 'kb_ki_rdue', orgId: ORG.kakao, slug: 'cartographie-rdue', category: 'land', tags: ['rdue', 'eudr', 'parcelles'], daysAgo: 22, updatedBy: 'u_naa',
    title: { fr: 'Cartographier une parcelle pour le RDUE' },
    body: {
      fr: `1. Faites le tour de la parcelle avec le téléphone, précision **10 m** ou mieux.
2. Fermez le polygone au point de départ.
3. Vérifiez la surface déclarée par le producteur.
4. Les parcelles « à risque » sont revues au bureau avant toute vente.`,
    },
  },
];
