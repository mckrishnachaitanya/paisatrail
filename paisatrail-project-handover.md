# PaisaTrail — Project Handover

Android-installable PWA. Single `index.html`, vanilla JS/CSS, IndexedDB, no framework/bundler. INR only. Hosted on GitHub Pages. Two users: Krishna (owner) and his brother.

---

## 1. What's built (all device-confirmed)

**Security:** 6-digit PIN, 5-fail lockout (30s), 2-min idle auto-lock, biometric (WebAuthn, opt-in) as a faster front door — PIN is always the underlying credential and fallback. `enterUnlockScreen()` is the single entry point for unlock mode; never call `initPINScreen` + `showScreen` directly or biometric auto-fire breaks.

**Income masking (2026-06-26):** Income amounts show `₹••••••` by default on Home and List tab. 👁️ eye icon next to 🔒 on both screens toggles reveal/mask globally. `state.incomeRevealed` resets to `false` on every lock and unlock. `maskIncome(n)` is the helper — used in `renderHomeOverviewPanel()` and `renderTransactions()`; never use `formatINR()` directly for income amounts in those views.

**Home:** Overview (cashflow card — Income/Expenses/Net, donut, recent list), Warranties, Forecast, Budgets tabs.

**Add/Edit:** Expense/Income toggle. Category grid (frequency-sorted, collapses to top 6 + "+N more" chip when >6 categories; `state.catUsageCounts` fetched once per screen open, never inside `renderCategoryGrid()`). MORE OPTIONS row: 5 chips (Warranty/Group/Split/Recurring/Attach), one open at a time (`state.activeOptKey`), mint dot when section has data. Expense-only fields auto-hide in income mode.

**Transactions:** Date-grouped, live search, filter sheet (type/category/payment/group/date/amount/split — live-apply, persist). Income-only filter hides Payment/Group/Split sections and clears their state.

**Insights:** Week/Month/Year/Custom; Categories/Compare/Payment/Groups views.

**Settings:** Category manager (71 icons), Payment methods, Groups (rename/delete/merge), Tag Past Expenses, Export/Import (JSON, full replace), Change PIN, Bulk delete, Recurring manager, Notifications toggle, manual 🔒 on all 4 main screens.

**Recurring:** Weekly/Monthly/Yearly, locked after creation. Catch-up runs on every unlock (`RECURRING_CATCHUP_CAP=24`). Rules carry `groupId`; catch-up copies it onto generated expenses. `openRecurringEdit` is synchronous — usage counts fetched via `.then()` in background.

**Forecast:** "Rest of month" / "Next 30 days". Spend-so-far + known recurring + trailing average (30/90/180-day lookback). `excludeFromForecast` flag on individual expenses excludes from trailing average only. Requires `FORECAST_MIN_EXPENSE_COUNT=5` + `FORECAST_MIN_DISTINCT_DAYS=7`. Income integration deferred.

**Budgets:** Per-category + Overall. Progress bars (mint→sunshine→coral). Pace line from day 3 (linear extrapolation). Suggested amount (3-month avg, new-budget only). Last-month recap (add + edit). All share one cached fetch per target (`getBudgetHistoryData`).

**App Guide:** `app-guide.json` (not inline) — fetched once, cached in memory, precached by SW. 9 expandable sections. Auto-shown once after first PIN setup. `guideReturnScreen` tracks back destination.

**What's New:** `releaseNotes` array in `app-guide.json` (newest first, `{version, date, highlights}`) — single source of truth for versioning, no `APP_VERSION` const in `index.html`. Mint banner on Home when version changes. Optional one-time browser notification. `pt_last_seen_version` written only when user opens What's New — not when notification fires.

**Other:** Backup nudge banner (grape, 15-day threshold, `pt_last_export` written inside `exportData()`). Soft-delete with undo everywhere. Split expenses (amount = user's share; `splitTotal`/`splitWith`/`splitSettled` are metadata only). Attachments (base64, chunked at 0x8000). Export excludes PIN; import is full replace; `schemaVersion=4`.

**Dropped:** Dark mode — not getting built.

---

## 2. Data model

- **Expenses:** id, type (`'expense'|'income'`, absent = expense), amount, categoryId, paymentMethod (id), date, note, attachmentIds[], recurringId, groupId, warrantyExpiry, warrantyDurationMonths, incomeCategoryId (income only), splitTotal, splitWith, splitSettled, excludeFromForecast, createdAt.
- **Categories:** id, name, icon, color, isDefault. **Payment methods:** id, name, icon. **Groups:** id, name.
- **Recurring:** id, name, amount, categoryId, paymentMethod, frequency, startDate, endDate, nextDueISO, active, createdAt.
- **Budgets:** id, categoryId (null = Overall), monthlyLimit, createdAt.
- **Attachments:** id, expenseId, type, fileName, mimeType, data (ArrayBuffer).

`isExpenseEntry()` / `isIncomeEntry()` guards every DB query — income must never reach budgets/forecast/warranty/insights/groups/split.

---

## 3. Architecture gotchas

**Android WebKit overlay trap:** Never hide an overlay with `opacity:0; pointer-events:none` — it creates a GPU compositing layer that intercepts all touch events across the entire screen even with `pointer-events:none`. Always use `display:none`. For masking values, prefer a conditional string (like `maskIncome()`) over any overlay element.

**`async` microtask breaks:** Making a function `async` introduces microtask breaks after `await` that can silently halt execution before later render calls. Prefer synchronous functions with `.then()` for non-blocking fetches (pattern used in `openRecurringEdit`).

**`flex-shrink:0` on `.pay-row`:** Load-bearing. `.pay-row` uses `overflow-x:auto` and collapses to zero height inside a flex-column parent without this. Never remove.

**`.scroll{isolation:isolate}` + `.bottom-nav{z-index:5}`:** Keeps `.recent-row`'s `z-index:1` contained so it can't compete with the FAB at screen level during scroll. Both rules are load-bearing.

**`esc()` for `innerHTML` only** — never before `.textContent`, it double-escapes.

**`pt_last_seen_version`** written only when user opens What's New, not when notification fires — otherwise the Home banner never shows.

**Biometric prompt** must fire after `visibilitychange` with page visible — firing while hidden causes Android's WebAuthn API to silently reject.

**No index** on `expenses.groupId`, `recurringId`, or split fields — queries pull full cursor and filter in JS.

**`renderTransactions()`** is the single source for the list and filter sheet's "Show N" button; guarded by `txnRenderSeq` against stale async overwrites.

**`ADD_OPT_DEFS`** is the single source of truth for MORE OPTIONS chips. Adding a 6th section = one new entry here + a new `add-*-wrap` div. Every state flip must call `renderOptRow()` or the dot goes stale.

**`sw.js`:** `index.html` is stale-while-revalidate (no `CACHE_NAME` bump needed when only `index.html` changes). Other assets are cache-first; bump `CACHE_NAME` (`'paisatrail-v3'`) if `manifest.json` or icons change. `{cache:'no-store'}` on fetch calls is load-bearing — without it the browser's HTTP cache defeats the mechanism.

**Screen transitions:** Opacity-only (no transform). Each screen has its own `.bottom-nav`/`.fab-add` copy.

**Groups** are written to IndexedDB only on Save — never on intermediate UI steps, to avoid orphans.

**Budget history** is intentionally not a dedicated view — edit sheet context + Insights already cover it.

---

## 4. Testing

Playwright + Chromium available in sandbox. Key patterns:
- Pre-seed PIN via `context.addInitScript` — SHA-256 hash of PIN stored as `pt_pin` in localStorage. PIN buttons are `.num-btn[data-n="N"]` (6-digit).
- Scope nav/FAB selectors: `.screen:not(.is-hidden) [data-nav="x"]` — duplicated once per main screen.
- Income categories render into `#add-category-grid` (same element as expense categories) only after switching to income mode — wait for `[data-incomecat]` chips.
- Close any open sheet before clicking elements behind it.
- `Notification.permission` getter is broken in headless Chromium — stub it for notification tests.
- Catch-up engine tests: deactivate earlier rules before asserting new ones.
- Forecast/budget tests: seed data with real `Date` objects, not hardcoded ISO strings — logic is date-relative.

---

## 5. Design system

Palette: paper `#FFFCF7` · ink `#241F3D` · sunshine `#FFC23C` · coral `#FF6B5B` · mint `#2EC4B6` · grape `#8657E0` · canvas `#2A1F4D`. Fonts: Fredoka (display) · Plus Jakarta Sans (body) · Space Mono (amounts).

---

## 6. File structure

`index.html` (entire app) · `manifest.json` · `sw.js` · `icons/icon.svg` · `app-guide.json` (guide content + release notes — edit this, never `index.html`, for help text or version announcements).

---

## 7. Standing rules

- **Discuss before build** — share honest assessment and wait for explicit confirmation before writing code. Answering questions is not a green light.
- **Every shipping session** must add a `releaseNotes` entry to `app-guide.json` (newest first) and update relevant guide section text.
- **Validation after every edit:** extract `<script>` block → `node --check`; Python div-balance check. Playwright smoke tests, then delete test file before handoff.
- **Deliver** `index.html` + `paisatrail-project-handover.md` together via `present_files`.
- **Grammar:** correct Krishna's grammatical/vocabulary errors in conversation; ignore typos.

---

## 8. Backlog

1. Forecast + income integration (deferred — wait for consistent income logging habit)
2. Multiple accounts/wallets
3. Multi-device cloud sync (needs backend — furthest out)
4. Excel/CSV export (deferred ~4 months — let real usage clarify format/scope)
5. Consolidate two segmented-control implementations (`.home-tabs` / `.segmented-tabs`)
