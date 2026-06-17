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
total, category donut, recent list — tap any row to edit) · Add/Edit
expense screen (category grid, payment-method chips, date, note,
camera/gallery/file attachments) · Transactions screen (full list grouped
by date, live search, tap-to-edit, delete with a 4-second Undo toast).

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
offline-installable PWA shell · 🔲 editable categories with icon + color
(seeded defaults exist; no add/edit/delete-category UI yet) · 🔲 editable
payment methods (same — seeded, no management UI yet) · ✅ search · 🔲
stackable filters (category, payment method, date range) · 🔲 export/import
(JSON).

**V2 — once v1 feels solid**
Budgets per category with alerts · Stats screen with payment-method
breakdown · biometric step-up for sensitive actions · recurring expenses ·
amount-range filter · dark mode · playful flourishes (streak counter, save
celebration).

**V3 — later, needs a backend**
Cash-flow forecasting (depends on recurring expenses existing first) ·
multi-device cloud sync · bank/card auto-sync, OCR receipt scanning, voice
logging.

---

## 4. Data model

- **Expenses** — id, amount, categoryId, paymentMethod (stores the payment method's *id*, despite the field name), date, note, attachmentId (nullable), recurringId (nullable), createdAt
- **Categories** — id, name, icon (emoji), color, isDefault — seeded with 6 defaults; editable in principle, but no management UI exists yet
- **Payment methods** — id, name, icon — same shape and same caveat as categories
- **Attachments** — id, expenseId, type (image/pdf/word/other), fileName, mimeType, data (raw ArrayBuffer)

---

## 5. Architecture decisions

- **Storage:** raw IndexedDB, no Dexie. One `expenses` object store indexed on `date`, `categoryId`, and `paymentMethod`. Stacked filters and search are handled by pulling a wide date-range cursor first, then filtering the rest in plain JS.
- **Security:** PIN lock + idle-timeout, **no encryption** of the underlying data. Biometric step-up (WebAuthn) is v2.
- **Attachments:** stored as raw `ArrayBuffer` in IndexedDB, unencrypted, linked to an expense by id. Editing an expense can replace or remove its attachment; the old one is deleted from IndexedDB when replaced.
- **Delete UX:** chose an explicit trash icon (Transactions rows, and the Edit screen's top bar) plus tap-to-edit, rather than swipe gestures, for reliability without device-testing access. Deletes are soft: the record is hidden immediately and only actually removed from IndexedDB after a 4-second "Undo" toast window expires.
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
- App icon is a simple placeholder SVG — fine to commission something more polished later
- True push notifications for recurring-expense reminders need a backend; v1/v2 will show an in-app banner instead

