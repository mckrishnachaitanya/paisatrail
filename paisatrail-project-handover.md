# PaisaTrail — Project Handover

Personal expense tracker PWA. Re-paste this into Project knowledge at the start of each new session — it's written to let a fresh Claude conversation pick up without re-deriving prior decisions or re-discovering already-fixed bugs.

## 1. Project facts
- Android-installable PWA, hosted on GitHub Pages. Vanilla HTML/CSS/JS only — no framework, no bundler, no build step, no external libraries. INR only.
- **Status: V2 fully shipped and device-confirmed.** Split Expenses (V3's first feature) just built this session — not yet device-tested. Real-device testing happens in separate conversations as Krishna uses the app day-to-day; treat it as an ongoing parallel process, not a gate before building more.

## 2. What's built
- **PIN:** setup/unlock (6-digit), 5-fail lockout (30s), 2-min idle auto-lock, screen-restore on unlock, in-app Change PIN (reuses the unlock state machine — see §4). Biometric unlock (opt-in, WebAuthn) layers a faster front door on top — PIN remains the underlying credential and automatic fallback.
- **Home:** Overview tab (3-stat cashflow card — Income/Expenses/Net, category donut, recent list, swipe-to-delete, warranty-expiring-soon banner) + Warranties tab + Forecast tab + Budgets tab.
- **Add/Edit:** Expense/Income toggle, category grid, payment chips, date, category-aware note placeholder, attachments (camera/gallery/file, unlimited, tap-to-view), warranty toggle, group toggle (existing or new, created inline), split toggle (see below). Expense-only fields auto-hide in income mode.
- **Transactions:** date-grouped, live search, Filters sheet (type, category, payment, date range, amount range, split — all live-apply, persist across nav), tap-to-edit, delete.
- **Insights:** Week/Month/Year/Custom period switch; Categories/Compare/Payment/Groups views (Groups is the one non-calendar-bound view — shows total + full expense list for a selected group).
- **Settings:** Categories manager (71 icons across themed groups), Payment Methods manager, Groups manager (rename/delete/merge), Tag Past Expenses, Export/Import (JSON, full replace), Change PIN, bulk-delete-old-expenses, Recurring Expenses manager, Manual lock button (🔒, top-right of all 4 main screens).
- **Recurring expenses:** "Make this recurring" toggle (Weekly/Monthly/Yearly, locked after creation) + Settings manager. Catch-up pass runs on every unlock, backfilling overdue occurrences with a batched toast.
- **Cash-Flow Forecasting:** Home tab, "Rest of this month" / "Next 30 days" toggle. Projects from actual spend so far + known recurring due + trailing-average estimate for everything else (configurable 30/90/180-day lookback). Deferred: income integration (see §8).
- **Budgets:** Home tab, per-category + optional Overall, progress-bar cards (mint → sunshine → coral as spend approaches/exceeds limit). Category locked after creation.
- **Income tracking:** Expense/Income toggle on Add screen. Stored in the same `expenses` store with `type:'income'` and `incomeCategoryId` (7 hardcoded categories). Pre-existing records with no `type` field are treated as expenses via `isExpenseEntry()`/`isIncomeEntry()` helpers, used in every DB query so income never pollutes budgets/forecast/warranty/insights/groups/split.
- **Split expenses (new this session):** "Split" toggle on Add/Edit, same card pattern as Warranty/Group. Total bill (separate field) + optional "Split between N people" chips (2–5) that auto-fill the Amount field as an equal share — editable any time for a custom share, which simply stops the equal-split auto-sync. "Split with" is freeform names. The Amount field stays "your share" throughout — that's what hits budgets/insights/forecast, identical to how every other expense is counted. A live "Your share / Others owe" readout sits in the card. A "Mark as settled" toggle appears only when *editing* an existing split (nothing to settle on a brand-new entry). Transactions Filter sheet has a "Split expenses only" toggle with an Unsettled/All sub-toggle (defaults to Unsettled) and a summary line ("N unsettled · ₹X pending from others"); row subtitles swap to show total + names + settled status while this filter is active. Home, Transactions, and Insights→Groups rows all prefix a ✂️ icon on split expense titles.
- Soft-delete-with-undo everywhere; all expense-derived views refresh together after any delete/undo.

**Krishna's call: dark mode dropped entirely** (not getting built).

## 3. Data model
- **Expenses:** id, type ('expense'|'income', absent on legacy rows = expense), amount, categoryId, paymentMethod (stores the *id*), date, note, attachmentIds[], recurringId (nullable), groupId (nullable), warrantyExpiry (nullable), warrantyDurationMonths (nullable), incomeCategoryId (income only), splitTotal (nullable — presence = split is on; full bill amount), splitWith (string, freeform names), splitSettled (bool), createdAt.
- **Categories:** id, name, icon, color, isDefault. **Payment methods:** id, name, icon. **Groups:** id, name only.
- **Recurring:** id, name, amount, categoryId, paymentMethod, frequency ('weekly'|'monthly'|'yearly'), startDate, endDate (nullable), nextDueISO, active, createdAt.
- **Budgets:** id, categoryId (nullable = Overall), monthlyLimit, createdAt. At most one per categoryId, at most one with categoryId=null.
- **Attachments:** id, expenseId, type, fileName, mimeType, data (ArrayBuffer).

## 4. Architecture & gotchas to know before touching code
- IndexedDB, no Dexie. `DB_VERSION=4`. Stores: expenses (indexed on date/categoryId/paymentMethod), categories, paymentMethods, groups, recurring, budgets, attachments.
- **No index on `expenses.groupId`, `expenses.recurringId`, or split fields** — any "every expense matching X" query pulls the full date-range cursor and filters in JS.
- Split expenses store `amount` as the user's own share — exactly like every other expense — so budgets/forecast/insights/warranty need **zero changes** to stay correct; they were never told splits exist. `splitTotal`/`splitWith`/`splitSettled` are purely additive metadata read only by the Add/Edit split card and the Transactions split filter.
- The split card's equal-split sync (`state.splitShareManual`) only writes to the Amount field while `false`; the moment the user types directly into Amount (or hand-edits a different people-count), it flips `true` and the card stops overwriting their number. Re-opening an *existing* split expense for edit always starts with this flag `true` — the saved share is treated as already-final, not subject to silent recalculation from a freshly-clicked people chip.
- "Mark as settled" is intentionally edit-only (`!!state.editingExpenseId` gate in `renderSplitArea`) — there's nothing meaningful to settle on an expense that hasn't been saved yet.
- Recurring date math always re-derives the target day fresh from the rule's `startDate` (`advanceRecurringDate`/`clampToValidDate`) — frequency and start date are locked read-only once a rule exists.
- Catch-up (`runRecurringCatchUpAll`) runs on every unlock, capped at `RECURRING_CATCHUP_CAP=24` per rule per pass.
- No data encryption — PIN + idle-lock only; biometric is a faster front door, not encryption at rest.
- Forecasting (`projectRecurringTotal`) is a pure read-only simulation, never writes to IndexedDB. `estimateDailyOtherSpend` excludes recurring-linked expenses (avoids double-counting) and requires `FORECAST_MIN_EXPENSE_COUNT=5` + `FORECAST_MIN_DISTINCT_DAYS=7` before trusting the average.
- Budgets' spent-so-far *includes* recurring-generated expenses (different from Forecast's exclusion — no double-count risk here, it's genuinely real spend).
- Export/Import: single JSON, attachments base64-encoded (chunked at 0x8000 bytes). PIN excluded from exports. Import is a full **replace**. `schemaVersion` is 4 now (bumped this session for the new split fields) — older backups still import fine, just restoring nothing for fields/stores that predate them.
- Deleting a category/payment-method/group **unlinks**, never cascades (except the last remaining category/payment method, blocked outright).
- Groups, and split's "new group" equivalent (there isn't one — split has no separate entity, just fields on the expense), are created lazily — groups specifically are never written to IndexedDB until the action using them is confirmed, to avoid orphans.
- **`esc()` is for `innerHTML` only** — never before a `.textContent` assignment, it double-escapes.
- Several confirm-and-close functions close their overlay **before** their awaited DB write finishes — don't treat "overlay closed" as proof the DB/state actually updated.
- View-state (search, filters, Insights period/view, `state.homeTab`) persists across navigation by convention.
- Two near-identical segmented-control implementations exist (`.home-tabs`, `.segmented-tabs`) — reuse one, don't add a third.
- `renderTransactions()` is the single source for both the visible list and the filter sheet's "Show N" button, guarded by `txnRenderSeq` against stale async overwrites.
- `enterUnlockScreen()` is the single entry point for showing the PIN screen in unlock mode — route through this, not `initPINScreen('unlock')` + `showScreen('pin-screen')` directly, or biometric auto-fire breaks.

## 5. Testing
- Playwright + Chromium is available in the build sandbox — use for real headless-browser smoke tests on every feature, not just static syntax/ID checks.
- **PIN is 6 digits**, not 4 — a test that enters 4 digits will hang on the confirm step waiting for more input.
- **Scope every nav/FAB selector**: `.screen:not(.is-hidden) [data-nav="x"]`, never a bare `[data-nav="x"]` (duplicated once per main screen).
- Close any open overlay/sheet before clicking elements underneath it — an open filter sheet intercepts pointer events on the list behind it.
- Poll the actual resulting DOM/state directly after an action, not an intermediate signal.
- When testing the catch-up engine in isolation, deactivate rules created earlier in the same test run first.
- When testing forecasts: a same-day-created rule's `nextDueISO` is already next period — don't assert it appears in "Rest of this month" the same day.
- When testing Budgets: the budget-picker grid prepends "Overall" as chip #1, so categories sit one slot later there than in Add/Edit's grid.

## 6. Design system
Palette: paper `#FFFCF7` · ink `#241F3D` · sunshine `#FFC23C` · coral `#FF6B5B` · mint `#2EC4B6` · grape `#8657E0` · canvas `#2A1F4D`. Fonts: Fredoka (display) · Plus Jakarta Sans (body) · Space Mono (amounts). Motif: perforated/stamp edge under amount displays.

## 7. File structure
Single repo root, no wrapper folder: `index.html` (entire app), `manifest.json`, `sw.js`, `icons/icon.svg`.

## 8. Next up
1. **Device-test Split Expenses** (this session's build, not yet on-device): add a split expense, verify equal-split chips fill Amount correctly, verify manual override sticks, mark settled, check the Transactions split filter (summary line, Unsettled/All toggle, row subtitle swap), check ✂️ icon shows on Home/Transactions/Insights→Groups.
2. **V3 backlog (rough priority order):**
   - **Forecast + income integration** — forecast tab currently projects expense spending only; add projected savings (income minus projected spend) once income logging is a consistent habit. Deliberately deferred.
   - **Multiple accounts/wallets** — cash, savings, credit card as separate tracked balances with a net worth view.
   - **Multi-device cloud sync** — needs a backend; pushed furthest out.
3. Consolidate the two segmented-control implementations if either ever needs a style change.
