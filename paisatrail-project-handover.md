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
camera/gallery/file attachments with a tap-to-view attachment viewer —
images render inline, PDFs render in an iframe, Word/other files fall back
to a download link — and an optional warranty toggle with 6mo/1yr/2yr
duration shortcuts or a manually-edited end date) · dedicated Warranties
screen (Active/Expired grouping, soonest-expiring first, tap a row to
edit) · Transactions screen (full list grouped by date, live search,
tap-to-edit, delete with a 4-second Undo toast) · Home's recent list now
supports swipe-left-to-reveal-delete as an alternative to opening Edit,
and the note field's placeholder is category-aware to nudge more specific
notes.

**Not yet built (still placeholders in the app):**
Filters sheet (category/payment/date-range multi-select — search alone
covers Transactions for now) · Settings screen content (manage categories,
manage payment methods, export/import, change PIN) · Stats screen content
(payment-method breakdown).

---

## 3. Scope

**V1 — ships first**
✅ Add/edit/delete expense (amount, date, category, payment method, note) ·
✅ attachments (photo, PDF, doc) · ✅ simple dashboard (monthly total,
category donut, recent list) · ✅ PIN lock with idle-timeout · ✅
offline-installable PWA shell · ✅ warranty tracking (toggle + expiry date
with duration shortcuts, dedicated Warranties list) — no expiry
*reminders* yet, just lookup · 🔲 editable categories with icon + color
(seeded defaults exist; no add/edit/delete-category UI yet) · 🔲 editable
payment methods (same — seeded, no management UI yet) · ✅ search · 🔲
stackable filters (category, payment method, date range) · 🔲 export/import
(JSON).

**V2 — once v1 feels solid**
Budgets per category with alerts · Stats screen with payment-method
breakdown · biometric step-up for sensitive actions · recurring expenses ·
amount-range filter · dark mode · playful flourishes (streak counter, save
celebration) · proactive warranty-expiry reminders (an in-app banner —
same backend-free pattern as the recurring-expense reminder below; the
Warranties list already covers manual lookup for v1).

**V3 — later, needs a backend**
Cash-flow forecasting (depends on recurring expenses existing first) ·
multi-device cloud sync · bank/card auto-sync, OCR receipt scanning, voice
logging.

---

## 4. Data model

- **Expenses** — id, amount, categoryId, paymentMethod (stores the payment method's *id*, despite the field name), date, note, attachmentId (nullable), recurringId (nullable), warrantyExpiry (nullable ISO date — presence of a value *is* the "under warranty" flag, no separate boolean), warrantyDurationMonths (nullable — 6/12/24 if a shortcut chip was used, null if the date was hand-edited; purely so the right chip re-highlights on re-edit, not load-bearing for display), createdAt
- **Categories** — id, name, icon (emoji), color, isDefault — seeded with 6 defaults; editable in principle, but no management UI exists yet
- **Payment methods** — id, name, icon — same shape and same caveat as categories
- **Attachments** — id, expenseId, type (image/pdf/word/other), fileName, mimeType, data (raw ArrayBuffer)

---

## 5. Architecture decisions

- **Storage:** raw IndexedDB, no Dexie. One `expenses` object store indexed on `date`, `categoryId`, and `paymentMethod`. Stacked filters and search are handled by pulling a wide date-range cursor first, then filtering the rest in plain JS.
- **Security:** PIN lock + idle-timeout, **no encryption** of the underlying data. Biometric step-up (WebAuthn) is v2.
- **Attachments:** stored as raw `ArrayBuffer` in IndexedDB, unencrypted, linked to an expense by id. Editing an expense can replace or remove its attachment; the old one is deleted from IndexedDB when replaced.
- **Viewing attachments:** a full-screen in-app viewer (👁️ button next to the attachment preview on the Add/Edit screen). Images render directly via an object URL; PDFs render inside an `<iframe>` using the browser's built-in PDF viewer rather than opening a new tab — this keeps the page from ever going `hidden`, which avoids retriggering the picker-lock bug below. Word docs and any other file type can't be previewed in a browser, so they fall back to a download link instead. The object URL is created on open and revoked on close (and the idle auto-lock timer is paused while the viewer is open, so a long PDF read can't trigger a lock mid-read).
- **Warranty tracking:** an optional toggle on the Add/Edit screen (collapsed by default so it doesn't clutter routine expenses). Turning it on defaults to a 1-year expiry computed from the purchase date; 6mo/1yr/2yr shortcut chips recompute it, or the date field can be hand-edited directly (which clears the chip selection, since the date is now custom). The dedicated Warranties screen lists everything tracked, grouped into Active (soonest-expiring first) and Expired (most recently expired first); it's reached via a preview card on Home that only renders once at least one item is being tracked. No push reminders yet — this was deliberately scoped to lookup-only for v1 (see Scope); the existing attachment (the bill/receipt) already doubles as proof when something needs to be claimed.
- **Note placeholders:** when the note field is left blank, list rows fall back to the bare category name ("Shopping", "Bills"...), which becomes indistinguishable across multiple entries. Rather than forcing a note, the placeholder text now nudges with category-specific examples (e.g. Shopping → "e.g. iPhone case, Levi's jeans") that update live as the category selection changes. Unrecognized/custom category names fall back to the generic "What was this for?" prompt, so this degrades gracefully once category management ships.
- **Delete UX:** two patterns now coexist, by deliberate choice. Transactions rows and the Edit screen's top bar use an explicit trash icon — no gesture, zero interaction risk. Home's recent list uses swipe-left-to-reveal-delete instead (adapted from the reference doc's `addSwipeToDelete`, with a small fix: the original leaked a document-level touchmove/touchend listener on every vertical-scroll-abort path — this version always removes both listeners on touchend regardless). Both patterns share the same safety net: deletes are soft, the record is hidden immediately and only actually removed from IndexedDB after a 4-second "Undo" toast window expires — so the swipe gesture's only real risk is interaction reliability (not tested on a real device yet), never data loss. Tapping a swiped-open row closes it instead of opening Edit, matching the usual swipe-list convention.
- **Lock vs. native pickers (bug fixed):** opening the camera/gallery/file picker briefly hides the page, which the visibility-based auto-lock initially misread as the user backgrounding the app and triggered an instant false lock. Fixed with a short-lived "expected interruption" flag set right before any picker opens. Worth remembering if a future feature opens another native picker (e.g. a share sheet) — the same flag pattern applies.
- **Screen restoration on lock:** any lock (idle or otherwise) now remembers which screen was visible and restores it after unlock, instead of always dropping back to Home — so an in-progress Add/Edit draft survives a lock.
- **Export/Import (not built yet):** plan stays plain JSON for data-only backups, JSZip bundle when attachments are included — same pattern as the vault's docs backup.
- **Hosting:** GitHub Pages, files sitting directly at the repo root (no wrapper folder) — see File structure below. `manifest.json`'s `start_url`/`scope` and the service worker registration use relative (`./`) paths so this works under a project-site subpath too.

---

## 6. Design system

- **Style direction:** colorful & playful
- **Palette:** paper `#FFFCF7` · ink `#241F3D` · sunshine `#FFC23C` · coral `#FF6B5B` · mint `#2EC4B6` · grape `#8657E0` · canvas `#2A1F4D`
- **Fonts:** Fredoka (display/headings) · Plus Jakarta Sans (body) · Space Mono (amounts — "receipt" numerals)
- **Signature motif:** a perforated/stamp-style edge under amount displays, echoing a ticket stub / receipt tear
- **Built but deviates slightly from the original mockup:** the Home dashboard ships without a budget progress bar — budgets are V2, so it's just total + donut + recent for now
- **Still placeholder:** Stats, Settings, and a category/payment-method manager have no real design yet — fine to design during their build rather than separately

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
swipe-to-delete (not used in the end — see Architecture decisions), the
IndexedDB attachment layer, backup export, and the JSZip bundling pattern.

---

## 9. Open follow-ups / next up

- Filters sheet — category/payment/date-range multi-select on Transactions
- Settings screen — manage categories, manage payment methods, export/import, change PIN
- Stats screen — payment-method breakdown
- Warranty expiry reminders — an in-app banner on Home when something's about to expire (deliberately deferred; v1 is lookup-only via the Warranties screen)
- Verify the new swipe-to-delete gesture on a real Android device (scroll-vs-swipe direction locking, no stuck "open" rows) — this is the one piece of UI in the app that couldn't be hands-on tested while building
- App icon is a simple placeholder SVG — fine to commission something more polished later
- True push notifications for recurring-expense reminders need a backend; v1/v2 will show an in-app banner instead

