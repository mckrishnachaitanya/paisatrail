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
- **Status:** actively being built — core flows are working end-to-end and deployable today (see Build status below)

---

## 2. Build status

**Built and working:**
PWA shell (manifest, service worker, SVG icon) · PIN setup/unlock with
5-fail lockout and 2-minute idle auto-lock · IndexedDB data layer
(expenses/categories/paymentMethods/attachments stores, default categories
and payment methods auto-seeded on first run) · Home screen with an
Overview/Warranties tab switcher at the top (Overview: monthly total,
category donut, recent list with swipe-to-delete; Warranties: Active/Expired
list, soonest-expiring first) · Add/Edit expense screen (category grid,
payment-method chips, date, category-aware note placeholder, any number of
camera/gallery/file attachments with a tap-to-view viewer, an optional
warranty toggle with 6mo/1yr/2yr shortcuts or a hand-edited date) ·
Transactions screen (grouped by date, live search, tap-to-edit, single
delete) · Settings screen with a working "Clear old expenses" bulk-delete
tool (age presets or a custom cutoff date, or manual tick-to-select — both
paths funnel into one confirm dialog) · Insights screen (Week/Month/Year/
Custom period switching with Categories/Compare/Payment-breakdown views,
each compared against the matching previous period) · one soft-delete-with
-undo system used everywhere, single or batched, with every expense-derived
view refreshing together so nothing goes stale after an Undo.

**Not yet built:**
Filters sheet (category/payment/date-range multi-select on Transactions —
search alone covers it for now) · the rest of Settings: manage categories,
manage payment methods, export/import, change PIN (bulk delete is the only
Settings feature shipped so far).

---

## 3. Scope

**V1 — ships first**
✅ Add/edit/delete expense (amount, date, category, payment method, note) ·
✅ attachments (photo, PDF, doc) · ✅ simple dashboard (monthly total,
category donut, recent list) · ✅ PIN lock with idle-timeout · ✅
offline-installable PWA shell · ✅ warranty tracking (toggle + expiry date
with duration shortcuts; Active/Expired list lives in a Home tab) · ✅
search · ✅ bulk delete (age presets or manual tick-to-select, in Settings)
· 🔲 editable categories with icon + color (seeded defaults exist; no
add/edit/delete-category UI yet) · 🔲 editable payment methods (same —
seeded, no management UI yet) · 🔲 stackable filters (category, payment
method, date range) · 🔲 export/import (JSON).

**V2 — once v1 feels solid**
Budgets per category with alerts (could reuse Insights' per-category
aggregation — see Architecture decisions) · biometric step-up for
sensitive actions · recurring expenses · amount-range filter · dark mode ·
playful flourishes (streak counter, save celebration) · proactive
warranty-expiry reminders (an in-app banner; the Warranties tab already
covers manual lookup).

**V3 — later, needs a backend**
Cash-flow forecasting (depends on recurring expenses existing first) ·
multi-device cloud sync · bank/card auto-sync, OCR receipt scanning, voice
logging.

---

## 4. Data model

- **Expenses** — id, amount, categoryId, paymentMethod (stores the payment method's *id*, despite the field name), date, note, attachmentIds (array, possibly empty — falls back to the older singular `attachmentId` on read for records saved before that migration), recurringId (nullable), warrantyExpiry (nullable ISO date — presence of a value *is* the "under warranty" flag), warrantyDurationMonths (nullable — 6/12/24 if a shortcut chip was used, null if hand-edited; only used to re-highlight the right chip on re-edit), createdAt
- **Categories** — id, name, icon (emoji), color, isDefault — seeded with 6 defaults; editable in principle, no management UI yet
- **Payment methods** — id, name, icon — same shape and caveat as categories
- **Attachments** — id, expenseId, type (image/pdf/word/other), fileName, mimeType, data (raw ArrayBuffer)

---

## 5. Architecture decisions

- **Storage:** raw IndexedDB, no Dexie. One `expenses` object store indexed on `date`, `categoryId`, and `paymentMethod`. Filters, search, and Insights' aggregation all pull a wide date-range cursor first, then filter/group in plain JS.
- **Security:** PIN lock + idle-timeout, **no encryption** of the underlying data. Biometric step-up (WebAuthn) is v2.
- **Attachments:** stored as raw `ArrayBuffer` in IndexedDB, unencrypted, linked to an expense via `expenseId`; an expense can have any number (the Camera/Gallery/File buttons stay visible even once some exist). Removing an attachment during an edit is soft — not committed until Save is pressed — with no explicit undo for that specific action.
- **Viewing attachments:** a full-screen in-app viewer for images (object URL). PDFs open in a real browser tab instead, for the device's native viewer; Word/other files go straight to a download. Opening a PDF this way backgrounds the page the same as a native picker would, so it reuses the same "expected interruption" suppression flag (see **Lock vs. native pickers** below) instead of needing its own handling.
- **Warranty tracking, surfaced via a Home tab:** an optional toggle on the Add/Edit screen (collapsed by default). Turning it on defaults to a 1-year expiry from the purchase date; 6mo/1yr/2yr shortcut chips recompute it, or the date can be hand-edited (which clears the chip selection). Everything tracked shows on Home's Warranties tab, grouped into Active (soonest-expiring first) and Expired (most recent first) — a segmented control at the top of Home switches between this and the Overview dashboard. Both panels render on every `renderHome()` call regardless of which is visible, so switching tabs, locking mid-tab, or returning from Add/Edit never shows stale data and needed no extra screen-restore plumbing: `state.homeTab` just persists on its own as ordinary app state. No push reminders yet (deliberately scoped to lookup-only); the existing attachment (the bill/receipt) doubles as proof when something needs to be claimed.
- **Insights, inside the Stats tab:** a Week/Month/Year/Custom period switcher (‹ › steps through periods; Custom shows From/To date inputs instead) feeds three views — Categories (every category's total for the period vs. the matching previous period), Compare (pick one category, see it side-by-side against its previous period), and Payment (the same comparison grouped by payment method — originally a separate V2 item, built alongside Insights since the aggregation underneath is identical). Weeks start on Sunday. For Custom, "previous period" is the same number of days immediately before the chosen range, since there's no calendar-natural equivalent; an invalid Custom range (to-date before from-date) shows a message instead of letting the IndexedDB query throw. Insights persists its period type, bounds, and view across navigation, same as `state.homeTab` — nothing resets it on revisit; the only default-on-first-use is Compare's category picker, which lazily falls back to the first category if nothing's been picked yet, then remembers the choice. `getCategoryTotalsForPeriod` is generic enough that V2's per-category budgets could likely reuse it directly.
- **Two segmented-control implementations exist side by side:** `.home-tabs`/`.home-tab` (Home's Overview/Warranties switcher, built first) and the more generic `.segmented-tabs`/`.segmented-tab` (Bulk delete's mode switch, Insights' period/view switches). Visually identical by design — the duplication was deliberate, to avoid touching already-shipped Home code — worth consolidating into one if either ever needs a style change.
- **Note placeholders:** a blank note falls back to the bare category name in list rows, which is hard to tell apart across entries — so the input's placeholder nudges with category-specific examples (e.g. Shopping → "e.g. iPhone case, Levi's jeans") instead of forcing a note. Unrecognized/custom category names fall back to a generic prompt.
- **Delete UX:** three entry points — an explicit trash icon on Transactions rows and the Edit screen's top bar, swipe-left-to-reveal-delete on Home's Overview recent list (adapted from the reference doc's `addSwipeToDelete`, with a fix for a listener leak on aborted vertical scrolls), and Settings' bulk delete (age presets or manual tick-to-select). All three funnel into the same soft-delete: a record is added to `pendingDeletes` (which every list/total query already filters out) and only actually removed from IndexedDB — with its attachments — after a 4-second Undo window expires. `deleteExpensesWithUndo` is the batch-capable version (one shared timer/Undo for the whole group); `deleteExpenseWithUndo` wraps the single-item case. Both the initial hide *and* the Undo restore call `refreshAllExpenseViews()` (Home's both tabs plus Transactions) rather than just whichever screen the delete started from — an earlier version only refreshed the originating screen, which left a stale Warranties tab after deleting from Transactions and hitting Undo from somewhere else. The one exception: the Edit-screen delete button still navigates back to the return screen immediately on delete, but only refreshes in place (no forced navigation) if Undo is tapped later from elsewhere.
- **Lock vs. native pickers:** opening the camera/gallery/file picker briefly hides the page, which the visibility-based auto-lock would otherwise misread as the app being backgrounded. A short-lived "expected interruption" flag set right before any picker (or the PDF-viewer's new tab) opens suppresses that false lock.
- **Screen restoration on lock:** any lock remembers which screen was visible and restores it after unlock, instead of dropping back to Home — so an in-progress Add/Edit draft, or whichever Home tab was active, survives a lock with no special-case code, since both just live in already-persistent app state.
- **Export/Import (not built yet):** plan stays plain JSON for data-only backups, JSZip bundle when attachments are included — same pattern as the vault's docs backup.
- **Hosting:** GitHub Pages, files directly at the repo root (no wrapper folder). `manifest.json`'s `start_url`/`scope` and the service worker registration use relative (`./`) paths so this works under a project-site subpath too.

---

## 6. Design system

- **Style direction:** colorful & playful
- **Palette:** paper `#FFFCF7` · ink `#241F3D` · sunshine `#FFC23C` · coral `#FF6B5B` · mint `#2EC4B6` · grape `#8657E0` · canvas `#2A1F4D`
- **Fonts:** Fredoka (display/headings) · Plus Jakarta Sans (body) · Space Mono (amounts — "receipt" numerals)
- **Signature motif:** a perforated/stamp-style edge under amount displays, echoing a ticket stub / receipt tear
- **Built but deviates slightly from the original mockup:** Home ships without a budget progress bar — budgets are V2
- **Still visually undesigned:** the category/payment-method manager and the rest of Settings beyond bulk delete (export/import, change PIN) — fine to design during their build rather than separately

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
swipe-to-delete (adapted for Home's Overview recent list — see Architecture
decisions), the IndexedDB attachment layer, backup export, and the JSZip
bundling pattern.

---

## 9. Open follow-ups / next up

- Filters sheet — category/payment/date-range multi-select on Transactions
- Settings — manage categories, manage payment methods, export/import, change PIN (bulk delete is already shipped)
- Real-device testing still pending for: Home's swipe-to-delete gesture, bulk delete's confirm dialog and manual checklist, and Insights' period steppers and custom date range — none of this has been hands-on tested on Android yet
- Warranty expiry reminders — an in-app banner on Home when something's about to expire (deliberately deferred; the Warranties tab covers manual lookup for v1)
- App icon is a simple placeholder SVG — fine to commission something more polished later
- True push notifications for recurring-expense reminders need a backend; v1/v2 will show an in-app banner instead
