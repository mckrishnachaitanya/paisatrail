# PaisaTrail — Project Handover

Personal expense tracker PWA. Re-paste this into Project knowledge at the start of each new session — it's written to let a fresh Claude conversation pick up without re-deriving prior decisions or re-discovering already-fixed bugs.

## 1. Project facts
- Android-installable PWA, hosted on GitHub Pages. Vanilla HTML/CSS/JS only — no framework, no bundler, no build step, no external libraries. INR only.
- **Status: V1 fully shipped.** Every feature below is verified only via headless Playwright smoke tests in the build sandbox — none of it has been hands-on tested on a real Android device yet. Real-device testing happens in separate conversations as Krishna uses the app day-to-day; treat it as an ongoing parallel process, not a gate before building more.

## 2. What's built
- **PIN:** setup/unlock, 5-fail lockout (30s), 2-min idle auto-lock, screen-restore on unlock, in-app Change PIN (reuses the unlock state machine — see §4).
- **Home:** Overview tab (monthly total, category donut, recent list, swipe-to-delete) + Warranties tab (Active/Expired, soonest-expiring first).
- **Add/Edit:** category grid, payment chips, date, category-aware note placeholder, attachments (camera/gallery/file, unlimited, tap-to-view), warranty toggle (6/12/24mo or hand-edited), group toggle (existing or new, created inline).
- **Transactions:** date-grouped, live search, Filters sheet (category + payment multi-select + date range, live-apply, persists across nav), tap-to-edit, delete.
- **Insights:** Week/Month/Year/Custom period switch; Categories/Compare/Payment views (vs. previous period) + a 4th Groups view (not calendar-bound).
- **Settings:** Categories manager, Payment Methods manager, Groups manager (rename/delete/merge), Tag Past Expenses (retroactive bulk-tagging by date-range or manual pick), Export/Import (JSON, attachments as base64, import = full replace), Change PIN, bulk-delete-old-expenses.
- Soft-delete-with-undo everywhere; all expense-derived views refresh together after any delete/undo.

**Deferred to V2:** warranty-expiry banner, polished app icon, budgets, biometric step-up, recurring expenses, dark mode, amount-range filter.

## 3. Data model
- **Expenses:** id, amount, categoryId, paymentMethod (stores the *id*, despite the name), date, note, attachmentIds[], recurringId (nullable, unused), groupId (nullable), warrantyExpiry (nullable — presence = "under warranty"), warrantyDurationMonths (nullable), createdAt.
- **Categories:** id, name, icon, color, isDefault. **Payment methods:** id, name, icon (no color). **Groups:** id, name only.
- **Attachments:** id, expenseId, type, fileName, mimeType, data (ArrayBuffer).

## 4. Architecture & gotchas to know before touching code
- IndexedDB, no Dexie. `DB_VERSION=2`. Stores: expenses (indexed on date/categoryId/paymentMethod), categories, paymentMethods, groups, attachments.
- **No index on `expenses.groupId`** — "every expense in group X" always means pulling the full date-range cursor and filtering in JS (`getExpensesByGroupId`).
- No data encryption — PIN + idle-lock only. Biometric step-up is V2.
- Export/Import: single JSON, attachments base64-encoded (chunked at 0x8000 bytes — `String.fromCharCode.apply`'s argument limit). PIN is deliberately excluded from exports. Import is a full **replace** (one atomic multi-store transaction), rejecting files missing the PaisaTrail marker or with empty categories/paymentMethods arrays.
- Deleting a category/payment-method/group **unlinks**, never cascades — except the very last remaining category or payment method, which is blocked outright. Confirm dialogs show a usage count.
- Groups are created lazily (only on actual Save/confirm) from Add/Edit or Tag Past Expenses — never write a group to IndexedDB until the action that uses it is confirmed, to avoid orphans.
- **`esc()` is for `innerHTML` only.** Never apply it before a `.textContent` assignment — it double-escapes (e.g. shows `&amp;` literally). Caused a real bug once; fixed, but watch for it in new code.
- Several confirm-and-close functions close their overlay **before** their awaited DB write finishes. Don't treat "overlay closed," or even matching toast text (messages can repeat verbatim across consecutive actions), as proof the DB/state actually updated.
- Change PIN reuses the pin-screen state machine (`change-verify`/`change-new`/`change-confirm` modes) and shares `verifyAgainstStoredPIN` (hash-check + 5-strikes lockout) with normal unlock.
- View-state (search, filters, Insights period/view, `state.homeTab`) persists across navigation by convention — don't reset it on revisit unless explicitly asked.
- Two near-identical segmented-control implementations exist (`.home-tabs`, `.segmented-tabs`) — reuse one of these in new code, don't add a third.

## 5. Testing
- Playwright + Chromium is available in the build sandbox — use it for real headless-browser smoke tests on every feature built, not just static syntax/ID checks. It has caught real bugs static analysis missed.
- **Scope every nav/FAB selector**: bottom-nav and the FAB are duplicated once per main screen (only one copy is visible at a time). A bare `[data-nav="x"]` can silently click a hidden screen's copy — always use `.screen:not(.is-hidden) [data-nav="x"]`.
- Poll the actual resulting DOM/state directly after an action, not an intermediate signal (see overlay-close gotcha above).

## 6. Design system
Palette: paper `#FFFCF7` · ink `#241F3D` · sunshine `#FFC23C` · coral `#FF6B5B` · mint `#2EC4B6` · grape `#8657E0` · canvas `#2A1F4D`. Fonts: Fredoka (display) · Plus Jakarta Sans (body) · Space Mono (amounts). Motif: perforated/stamp edge under amount displays.

## 7. File structure
Single repo root, no wrapper folder: `index.html` (entire app), `manifest.json`, `sw.js`, `icons/icon.svg` (placeholder).

## 8. Next up
1. Real-device Android testing — standing checklist, not a blocker.
2. V2 features, when ready (see §2).
3. Consolidate the two segmented-control implementations if either ever needs a style change.
