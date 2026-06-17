# PaisaTrail — Project Handover

A personal expense tracker PWA. This document captures every decision made
during planning and building so a future conversation (or another dev) can
pick up without re-deriving any of it. Pair this with
`paisatrail-reference-patterns.md` for the original reusable code this was
built from. This is a living document — re-share it (and ask for an update)
whenever a build session wraps up.

---

## 1. Overview

- **Name:** PaisaTrail
- **Platform:** Android (installable PWA)
- **Hosting:** GitHub Pages
- **Stack:** Vanilla HTML/CSS/JS — no framework, no bundler, no build step
- **Currency:** INR only for v1 (no multi-currency)
- **Status:** actively being built — core add/edit/delete flow is working end-to-end and deployable today (see Build status below)

---

## 2. Build status

**Built and working:**
PWA shell (manifest, service worker, SVG icon) · PIN setup/unlock with
5-fail lockout and 2-minute idle auto-lock · IndexedDB data layer
(expenses/categories/paymentMethods/attachments stores, default categories
and payment methods auto-seeded on first run) · Home dashboard (monthly
total, category donut, recent list, and an "Under warranty" preview card
that only appears once something is being tracked — tap any row to edit) ·
Add/Edit expense screen (category grid, payment-method chips, date, note,
support for any number of camera/gallery/file attachments per expense with
a tap-to-view viewer — images render inline, PDFs open in a real browser
tab for the native viewer, Word/other files fall back to a download — and
an optional warranty toggle with 6mo/1yr/2yr duration shortcuts or a
manually-edited end date) · dedicated Warranties
screen (Active/Expired grouping, soonest-expiring first, tap a row to
edit) · Transactions screen (full list grouped by date, live search,
tap-to-edit, delete with a 4-second Undo toast) · Home's recent list now
supports swipe-left-to-reveal-delete as an alternative to opening Edit,
and the note field's placeholder is category-aware to nudge more specific
notes.

**Not yet built (still placeholders in the app):**
Filters sheet (category/payment/date-range multi-select — search alone
covers Transactions for now) · Settings screen content (manage categories,
manage payment methods, export/import, change PIN, bulk delete) · Stats →
Insights screen content (category/period comparison, payment-method
breakdown) · Home's Overview/Warranties tab switcher (replaces the current
standalone Warranties screen and its Home preview card) · Bulk delete flow
(age-based presets + manual multi-select, confirm dialog then a brief
Undo).

---

## 3. Scope

**V1 — ships first**
✅ Add/edit/delete expense (amount, date, category, payment method, note) ·
✅ attachments (photo, PDF, doc) · ✅ simple dashboard (monthly total,
category donut, recent list) · ✅ PIN lock with idle-timeout · ✅
offline-installable PWA shell · ✅ warranty tracking (toggle + expiry date
with duration shortcuts, Active/Expired list) — no expiry *reminders* yet,
just lookup · 🔲 Home Overview/Warranties tab switcher (the Warranties list
moves from a standalone screen to a tab at the top of Home; the Home
preview card goes away) · 🔲 editable categories with icon + color (seeded
defaults exist; no add/edit/delete-category UI yet) · 🔲 editable payment
methods (same — seeded, no management UI yet) · ✅ search · 🔲 stackable
filters (category, payment method, date range) · 🔲 export/import (JSON) ·
🔲 bulk delete (age-based presets + manual multi-select, in Settings).

**V2 — once v1 feels solid**
Budgets per category with alerts · Stats → Insights (category spend by
Week/Month/Year/Custom period, with a current-vs-previous-period
comparison) plus payment-method breakdown, both living in the Stats tab ·
biometric step-up for sensitive actions · recurring expenses ·
amount-range filter · dark mode · playful flourishes (streak counter, save
celebration) · proactive warranty-expiry reminders (an in-app banner —
same backend-free pattern as the recurring-expense reminder below; the
Warranties tab already covers manual lookup for v1).

**V3 — later, needs a backend**
Cash-flow forecasting (depends on recurring expenses existing first) ·
multi-device cloud sync · bank/card auto-sync, OCR receipt scanning, voice
logging.

---

## 4. Data model

- **Expenses** — id, amount, categoryId, paymentMethod (stores the payment method's *id*, despite the field name), date, note, attachmentIds (array, possibly empty — see Architecture decisions for the migration from the old singular `attachmentId`), recurringId (nullable), warrantyExpiry (nullable ISO date — presence of a value *is* the "under warranty" flag, no separate boolean), warrantyDurationMonths (nullable — 6/12/24 if a shortcut chip was used, null if the date was hand-edited; purely so the right chip re-highlights on re-edit, not load-bearing for display), createdAt
- **Categories** — id, name, icon (emoji), color, isDefault — seeded with 6 defaults; editable in principle, but no management UI exists yet
- **Payment methods** — id, name, icon — same shape and same caveat as categories
- **Attachments** — id, expenseId, type (image/pdf/word/other), fileName, mimeType, data (raw ArrayBuffer)

---

## 5. Architecture decisions

- **Storage:** raw IndexedDB, no Dexie. One `expenses` object store indexed on `date`, `categoryId`, and `paymentMethod`. Stacked filters and search are handled by pulling a wide date-range cursor first, then filtering the rest in plain JS.
- **Security:** PIN lock + idle-timeout, **no encryption** of the underlying data. Biometric step-up (WebAuthn) is v2.
- **Attachments:** stored as raw `ArrayBuffer` in IndexedDB, unencrypted, each linked to an expense via `expenseId`. An expense can have any number of attachments (zero is the common case; the same expense screen supports adding more at any time — the Camera/Gallery/File buttons stay visible even once one or more are already attached, rather than disappearing after the first). The expense itself stores `attachmentIds`, an array of ids; this replaced the original singular `attachmentId` field. **Migration:** reading an older expense record falls back to `[existing.attachmentId]` if `attachmentIds` isn't present, so nothing already saved breaks; the record gets upgraded to the new array format the next time that expense is edited and saved. Removing an attachment during an edit is soft (not committed to IndexedDB) until Save is pressed, same spirit as the Undo-toast delete below but without an explicit undo — re-adding the file is the only way back if removed by mistake before saving.
- **Viewing attachments:** a full-screen in-app viewer (👁️ button on each attachment preview row). Images render directly via an object URL in that in-app overlay. PDFs instead open in a real browser tab — the device's native PDF viewer (pinch-zoom, search, etc.) is a meaningfully better experience than a cramped embedded frame, which is why this isn't done via an `<iframe>` despite the iframe avoiding a lock-related edge case (see below). Word docs and any other type a browser can't render at all go straight to a download. Object URLs are created on open and revoked on the next open (or on overlay close, for images).
- **Lock vs. opening PDFs in a new tab (same bug class as the picker fix below):** opening a new tab backgrounds the page the same way a native camera/file picker does, which would otherwise cause an instant false lock via the visibility check. PDFs reuse the exact same "expected interruption" suppression flag as the pickers before opening, so this is already covered — no separate handling needed, and no real time limit in practice: only the single hide-transition at open time matters, returning to the tab later just resets the idle timer rather than locking.
- **Warranty tracking:** an optional toggle on the Add/Edit screen (collapsed by default so it doesn't clutter routine expenses). Turning it on defaults to a 1-year expiry computed from the purchase date; 6mo/1yr/2yr shortcut chips recompute it, or the date field can be hand-edited directly (which clears the chip selection, since the date is now custom). Everything tracked groups into Active (soonest-expiring first) and Expired (most recently expired first) — see **Home tabs** below for where this now lives in the UI. No push reminders yet — this was deliberately scoped to lookup-only for v1 (see Scope); the existing attachment (the bill/receipt) already doubles as proof when something needs to be claimed.
- **Home tabs (Overview / Warranties) — planned, not yet built:** a segmented tab control sits at the top of Home, below the greeting, with two tabs — Overview and Warranties — swapping which content fills the scrollable body underneath. Overview is today's dashboard (spend card, donut, recent list); Warranties reuses the existing Active/Expired grouped list, just rendered inline instead of as its own screen. This replaces the standalone Warranties screen (the one with its own topbar/close button) and removes the "Under warranty" preview card from Overview entirely — the tab is the only entry point going forward. The bottom nav and FAB are untouched; this lives entirely inside Home. Needs a `state.homeTab` (or similar) alongside `state.returnScreen`, so editing a warranty item from the Warranties tab and saving/closing lands back on Warranties rather than defaulting to Overview — and the lock/unlock screen-restore logic (see **Screen restoration on lock** below) needs the same addition so locking mid-tab doesn't quietly drop the user back to Overview.
- **Insights, inside the Stats tab — planned, not yet built:** Stats stops being a placeholder and becomes Insights. A period switcher (Week / Month / Year / Custom, with ‹ › to step through and a real date-range picker for Custom) sits at the top. Two views toggle between each other: "All categories" (every category's total for the selected period, each with a delta vs. the immediately preceding equivalent period) and "Single category" (pick one category, compare it current-period-vs-previous-period). Opens to This month, all categories, by default. For Custom ranges, "previous period" is defined as the same number of days immediately before the selected range, since there's no calendar-natural equivalent — worth double-checking this still feels right once it's actually built; skipping the comparison for Custom instead is the fallback if not. Payment-method breakdown (the original V2 scope for this screen) still belongs here too, as a further view within the same Stats tab — Insights doesn't replace it.
- **Note placeholders:** when the note field is left blank, list rows fall back to the bare category name ("Shopping", "Bills"...), which becomes indistinguishable across multiple entries. Rather than forcing a note, the placeholder text now nudges with category-specific examples (e.g. Shopping → "e.g. iPhone case, Levi's jeans") that update live as the category selection changes. Unrecognized/custom category names fall back to the generic "What was this for?" prompt, so this degrades gracefully once category management ships.
- **Delete UX:** two patterns now coexist, by deliberate choice. Transactions rows and the Edit screen's top bar use an explicit trash icon — no gesture, zero interaction risk. Home's recent list uses swipe-left-to-reveal-delete instead (adapted from the reference doc's `addSwipeToDelete`, with a small fix: the original leaked a document-level touchmove/touchend listener on every vertical-scroll-abort path — this version always removes both listeners on touchend regardless). Both patterns share the same safety net: deletes are soft, the record is hidden immediately and only actually removed from IndexedDB after a 4-second "Undo" toast window expires — so the swipe gesture's only real risk is interaction reliability (not tested on a real device yet), never data loss. Tapping a swiped-open row closes it instead of opening Edit, matching the usual swipe-list convention.
- **Bulk delete, in Settings → "Clear old expenses" — planned, not yet built:** lives in Settings, not Transactions. Two entry points feed the same flow: age-based presets (older than 6 months / older than 1 year / a custom cutoff date) and a manual mode where individual expenses are ticked from a list. Both paths lead to the same confirmation step first — a dialog showing the count and total ₹ amount about to be deleted — and only after confirming does the existing soft-delete pattern take over (records hidden immediately, a brief Undo toast, the actual IndexedDB + attachment deletion only happening once that window expires). This reuses the spirit of `deleteExpenseWithUndo`, but needs a batch-aware version — one timer and one Undo action for the whole batch, rather than the current per-expense-id assumption baked into `pendingDeletes`.
- **Lock vs. native pickers (bug fixed):** opening the camera/gallery/file picker briefly hides the page, which the visibility-based auto-lock initially misread as the user backgrounding the app and triggered an instant false lock. Fixed with a short-lived "expected interruption" flag set right before any picker opens. Worth remembering if a future feature opens another native picker (e.g. a share sheet) — the same flag pattern applies.
- **Screen restoration on lock:** any lock (idle or otherwise) now remembers which screen was visible and restores it after unlock, instead of always dropping back to Home — so an in-progress Add/Edit draft survives a lock. Once Home tabs ship, this needs to also remember which Home tab (Overview vs. Warranties) was active, not just that Home itself was the screen.
- **Export/Import (not built yet):** plan stays plain JSON for data-only backups, JSZip bundle when attachments are included — same pattern as the vault's docs backup.
- **Hosting:** GitHub Pages, files sitting directly at the repo root (no wrapper folder) — see File structure below. `manifest.json`'s `start_url`/`scope` and the service worker registration use relative (`./`) paths so this works under a project-site subpath too.

---

## 6. Design system

- **Style direction:** colorful & playful
- **Palette:** paper `#FFFCF7` · ink `#241F3D` · sunshine `#FFC23C` · coral `#FF6B5B` · mint `#2EC4B6` · grape `#8657E0` · canvas `#2A1F4D`
- **Fonts:** Fredoka (display/headings) · Plus Jakarta Sans (body) · Space Mono (amounts — "receipt" numerals)
- **Signature motif:** a perforated/stamp-style edge under amount displays, echoing a ticket stub / receipt tear
- **Built but deviates slightly from the original mockup:** the Home dashboard ships without a budget progress bar — budgets are V2, so it's just total + donut + recent for now
- **Still placeholder:** Stats/Insights, Settings, and a category/payment-method manager have no real visual design yet — fine to design during their build rather than separately

---

## 7. File structure (as deployed)

```
your-repo/
├── index.html       ← entire app: HTML + CSS + JS, no build step
├── manifest.json     ← PWA install config
├── sw.js             ← service worker (offline caching)
└── icons/
    └── icon.svg      ← app icon (simple coin/₹ placeholder — fine to swap later)
```

No wrapper folder — these four sit directly at whatever GitHub Pages serves as the site root.

---

## 8. Code reuse

See `paisatrail-reference-patterns.md` for the original code this was built
from: screen system, PIN lock + idle auto-lock, step-up modal (basis for a
future biometric step-up), theme toggle, toast notifications,
swipe-to-delete (adapted for Home's recent list — see Architecture
decisions), the IndexedDB attachment layer, backup export, and the JSZip
bundling pattern.

---

## 9. Open follow-ups / next up

- Filters sheet — category/payment/date-range multi-select on Transactions
- Home Overview/Warranties tab switcher — spec finalized, see Architecture decisions
- Settings screen — manage categories, manage payment methods, export/import, change PIN, bulk delete ("Clear old expenses")
- Stats → Insights screen — category/period comparison (spec finalized, see Architecture decisions) plus payment-method breakdown
- Bulk delete flow — age-based presets + manual multi-select, confirm dialog then a brief Undo (spec finalized, see Architecture decisions)
- Warranty expiry reminders — an in-app banner on Home when something's about to expire (deliberately deferred; v1 is lookup-only via the Warranties tab)
- Verify the new swipe-to-delete gesture on a real Android device (scroll-vs-swipe direction locking, no stuck "open" rows) — this is the one piece of UI in the app that couldn't be hands-on tested while building
- App icon is a simple placeholder SVG — fine to commission something more polished later
- True push notifications for recurring-expense reminders need a backend; v1/v2 will show an in-app banner instead
