# PaisaTrail — Project Handover

Android-installable PWA. Single `index.html`, vanilla JS/CSS, IndexedDB, no framework/bundler. INR only. Hosted on GitHub Pages. Two users: Krishna (owner) and his brother.

---

## 1. What's built (all device-confirmed unless noted)

**Security:** 6-digit PIN, 5-fail lockout (30s), 2-min idle auto-lock, biometric (WebAuthn, opt-in). `enterUnlockScreen()` is the single entry point — never call `initPINScreen` + `showScreen` directly or biometric auto-fire breaks.

**Income masking:** Income amounts show `₹••••••` by default on Home, List, Insights accounts sheet, and Forecast savings card. 👁️ eye icon on Home, List, Insights, and inside the accounts sheet toggles reveal/mask globally. `state.incomeRevealed` resets to `false` on every lock/unlock. Always use `maskIncome(n)` — never `formatINR()` — for income amounts in those views. Any derived value that includes income (Net, savings projection, net worth) must also be masked.

**Financial cycle start day (2026-06-27):** User sets day 1–28 in Settings → Finance → "My month starts on". Stored as `pt_cycle_day` in localStorage. Default: 1 (zero change for existing users). `getCycleDay()` reads it; `cycleBounds(refISO)` replaces `monthBounds()` for all cycle-aware calculations; `cyclesAgoBounds(n)` replaces `monthsAgoBounds(n)`. Affects: `getMonthToDateExpenses`, `computeBudgetPace`, `monthsAgoBounds`, Forecast month window, Insights period init + step/prev. When cycle day ≠ 1, Insights month label shows "26 May – 25 Jun" style instead of "June 2026".

**Home:** Overview (cashflow card — Income/Expenses/Net, donut + tappable legend, recent list), Warranties, Forecast, Budgets tabs.

**Home sticky layout:** `#home-sticky-top` contains header + tabs + `#home-overview-sticky` (banners, onboarding card, cashflow card, perforation, donut row). `#home-scroll-body` (flex:1, overflow-y:auto) holds only the Recent list for Overview, or the full panel for other tabs. `applyHomeTabUI` hides `#home-overview-sticky` when non-overview tab is active and removes top padding from scroll body. This keeps the cashflow card and donut fixed while transactions scroll beneath.

**Home overview cycle-aware:** `renderHomeOverviewPanel` uses `cycleBounds()` for date range. Label shows "26 Jun – 25 Jul 2026" when cycle day ≠ 1, "June 2026" when 1. Count says "X expenses this cycle". Recent list shows all cycle transactions (no cap), transfers excluded.

**Home donut legend toggle:** Tap legend to flip between % and ₹ amounts. `state.homeLegendShowAmounts` boolean. Toggle re-renders only the right-side values in place — no full panel re-render needed.

**Home banners — priority hierarchy (2026-06-27):** Only one banner shows at a time. `renderHomeOverviewPanel` evaluates in order: warranty expiry (time-sensitive) → What's New (one-time) → backup nudge (low urgency). The first condition that is true wins; the others are hidden. Never call `renderWhatsNewBanner`, `renderBackupNudgeBanner`, or `renderWarrantyBanner` directly from outside `renderHomeOverviewPanel`.

**Onboarding checklist (2026-06-27):** "Get started" card on Home Overview. Shows when `pt_onboard_dismissed` is absent. Three items: set cycle day, add recurring income, set up accounts. Each taps to the relevant screen. Auto-dismisses permanently when all three are complete. Manual dismiss sets `pt_onboard_dismissed='1'`. Rendered by `renderOnboardingChecklist()`, called from `renderHomeOverviewPanel`.

**Google Drive backup (2026-06-30):** `CloudBackup` module — Google Identity Services implicit token flow, no backend, no refresh tokens (deliberate, to preserve the zero-backend architecture). Scope: `drive.appdata` (hidden `appDataFolder`, never visible in user's normal Drive UI — protects against the original motivating problem of browser storage getting wiped while cleaning up other PWAs). OAuth Client ID is hardcoded as `DRIVE_CLIENT_ID` constant. App stays in Google's "Testing" publish status — only allowlisted test users (added manually in Cloud Console → Audience) can sign in; this is a deliberate scope decision since PaisaTrail's userbase is Krishna + his brother, and pursuing Google's verification process was judged not worth it.

Auto-backup runs once per day on unlock (`checkDriveOnOpen`, called non-blocking from `unlockSuccess`) if `pt_drive_last_backup` is >24h old. Auto-backup payload = full transaction data + attachments **only** for expenses with `warrantyExpiry` set (deliberate: receipts are usually recoverable, warranty documents often aren't, and daily silent uploads of every receipt photo would be wasteful on mobile data). Manual "Back up now" in Settings includes all attachments and shows a confirm dialog first (`drive-backup-confirm-overlay`) plus a "don't close the app" state on the button while uploading — implicit-flow uploads have no background-sync guarantee and can be aborted if the PWA is closed mid-upload (a known, accepted limitation, not solved).

Versioning: each backup is a new timestamped file (`paisatrail-backup-YYYY-MM-DDTHH-MM-SS.json`) in `appDataFolder`. After every successful upload, `pruneOldBackups()` keeps only the 3 most recent **calendar days** (not the 3 most recent files) — a same-day manual backup explicitly deletes that day's earlier auto-backup file rather than keeping both. `dayKeyFromFilename()` parses the date out of the filename for grouping.

Restore (`CloudBackup.restoreLatest()`) always takes the single newest file overall and is a full replace via the shared `applyBackupPayload()` helper (extracted from the local-import code path — both local JSON import and Drive restore now funnel through the same apply logic, see `confirmImport()` vs the Drive restore handlers). Restore is auto-offered (`drive-autorestore-overlay`) only when local IndexedDB is empty on unlock and a Drive backup exists — never auto-triggered over existing local data. A manual "Restore from Drive" button also exists in Settings for when local data exists, gated behind an explicit destructive-action confirm (`drive-restore-confirm-overlay`) warning that local data not yet backed up may be lost — restore is never a merge, always a full replace, by design (merge logic was explicitly scoped out as a much riskier feature).

Settings UI: "CLOUD BACKUP" section, `renderDriveSettingsRow()` toggles between a "Connect" row and a connected block (Back up now / Restore from Drive / Disconnect) based on `Store.get('pt_drive_connected')`. `pt_drive_last_backup` timestamp shown in the Back up now subtitle.

**Known limitation, not yet solved:** if the PWA is closed/backgrounded mid-upload, the backup can fail silently (no Background Sync API reliance, since support is inconsistent on Android Chrome). The "don't close the app" button state surfaces this risk but doesn't eliminate it.

**Cloud status icon (2026-06-30):** Small ☁️ button in `.topbar-icons` on Home, List, and Insights (not Settings — the full Cloud Backup section already lives there). `renderCloudStatusIcons()` is the single source of truth for all three buttons' state and is called from `renderDriveSettingsRow()` so it never drifts out of sync with the Settings row. Hidden entirely (`.hidden`) when Drive isn't connected. `.syncing` class (CSS `cloudPulse` animation) applied while `CloudBackup.syncing` is true — this flag is now set/cleared centrally inside `CloudBackup.runBackup()` itself rather than at each call site, so every backup trigger (first-connect, daily auto, manual) gets the pulsing icon automatically. `.has-error` class shows a small coral dot (`pt_drive_last_error` in localStorage, set on any `runBackup` failure, cleared on the next success) — restore failures deliberately don't set this flag, since the icon's job is backup status specifically. Tapping any of the three icons calls `showScreen('settings-screen')` + scrolls to `#settings-drive-connect-btn`, following the same `setTimeout` + `scrollIntoView` pattern already used for the accounts-onboarding nudge. **Note (2026-07-01): topbar icon glyph is ⛅, not ☁️** — plain cloud rendered as a near-invisible pale outline on Krishna's device font; ⛅ (sun-behind-cloud) has enough contrast. Emoji rendering for this glyph is device/font-dependent; if it ever looks wrong again the robust fix is an inline SVG (would be the only SVG icon in the app).

**Cloud restore/backup second-device fixes (2026-07-01):** Three bugs fixed after real second-device testing. (1) Auto-restore never fired on a fresh device because `checkDriveOnOpen` bailed on `!isConnected()` before offering restore — now `handleDriveConnectClick`, on connecting with an empty DB, calls the shared `offerDriveRestoreIfBackupExists()` helper instead of blindly backing up (both it and `checkDriveOnOpen` now funnel through that helper). (2) Connecting on an empty device used to run `runBackup(false)` immediately, uploading an empty snapshot that — via same-day-replace pruning — could clobber a good same-day backup; `runBackup` now throws `NOTHING_TO_BACK_UP` (deliberately NOT flagged via `pt_drive_last_error`, and swallowed by the silent auto callers; the manual "Back up now" surfaces it as "Nothing to back up yet") rather than ever uploading an empty snapshot. (3) `restoreLatest` now walks backups newest-first and restores the newest NON-empty one, so a stray empty backup at the top can't defeat restore (falls back to newest if all empty). Also `applyBackupPayload` now always ends with `showScreen('home-screen')` + `renderHome()` so restored data is actually visible (previously the fresh-device first-launch guide screen, or staying on Settings, could bury it). All three verified via isolated Node logic sims + a device-confirmed successful round-trip.

**Account balance edit — current-balance semantics (2026-07-01):** The account edit sheet edits the CURRENT balance for existing accounts, not the stored `openingBalance`. `computeAccountBalance` = `openingBalance + signed activity`. When editing existing, the balance field shows the computed current balance (filled synchronously with `openingBalance` as a placeholder to keep `openAccountEdit` synchronous per the edit-sheet microtask gotcha, then patched to the real current balance via `computeAccountBalance().then()`, guarded so it only applies if still editing that same account). On save, `openingBalance` is back-computed as `enteredCurrent - activity` where `activity = currentBalance - oldOpeningBalance`, so the recomputed current lands exactly on what the user typed without re-adding transaction activity. Rationale: users read their real balance off their bank and correct to it; the app must not re-apply transactions on top. New accounts still treat the field as opening balance (no activity yet). Labels: "OPENING BALANCE"/"OPENING OUTSTANDING" when adding vs "CURRENT BALANCE"/"CURRENT OUTSTANDING" when editing, driven by `state.acctEditingId` in `applyAccountTypeLabels`. Works for savings + CC (sign via `computeAccountBalance`). Math verified against the exact reported scenario + CC/no-activity/re-edit edge cases.

 Category grid (frequency-sorted, collapses to top 6; `state.catUsageCounts` fetched once per open). MORE OPTIONS row: 5 chips (Warranty/Group/Split/Recurring/Attach), one open at a time. Transfer mode hides category, payment method, and all expense-only fields; shows From/To account pill rows instead. Transfer tab only active when ≥2 accounts exist.

**Transactions (List tab):** Date-grouped, live search, filter sheet (type/category/payment/group/date/amount/split — live-apply, persist). Filter types: All / Expenses / Income / Transfers. "All" hides transfers — they only appear under Transfers filter. Income and Transfer filters hide Payment/Group/Split sections. **Sticky layout:** `#txn-sticky-top` holds topbar + search bar; transaction list scrolls beneath in `.scroll`.

**Insights:** Week/Month/Year/Custom; Categories/Compare/Payment/Groups views. 🏦 icon in topbar opens accounts sheet (hidden when accounts disabled). **Sticky layout:** `#stats-sticky-top` holds topbar + period type tabs + date stepper + custom range + view tabs; all content panels scroll beneath in `.scroll`. **Groups view:** group chips live in `#ins-groups-chip-bar` inside the sticky top (not inside the scrollable panel) — shown only when Groups view is active, hidden by `applyInsightsViewUI` when switching views. Always use `recent-pm` class for subtitle spans in group rows — `recent-meta` is undefined and renders at full browser font size.

**Settings — Finance section:** "My month starts on" (cycle day), Accounts & Wallets toggle, Manage accounts button (visible only when accounts enabled).

**Settings — other:** Category manager (71 icons), Payment methods, Groups (rename/delete/merge), Tag Past Expenses, Export/Import (JSON, full replace), Change PIN, Bulk delete, Recurring manager (renamed "Recurring transactions"), Notifications toggle, manual 🔒 on all 4 main screens.

**Recurring transactions (2026-06-27):** Supports both expense and income rules. Type toggle (Expense/Income) in add sheet — locked read-only on edit. Income rules carry `incomeCategoryId`, generate entries with `type:'income'`. Show INCOME badge in manager list. Catch-up (`catchUpSingleRule`) generates correctly typed entries for both. Rules carry optional `accountId` (shown only when accounts enabled). `RECURRING_CATCHUP_CAP=24`.

**Forecast (2026-06-27):** Savings projection card at top — appears when ≥1 active recurring income rule exists. Shows projected income (recurring income due in window + actual income logged so far this cycle), projected spend, projected savings (mint = positive, coral = negative). All income amounts masked unless revealed. Nudge button when no income rules — taps to Recurring transactions screen. Forecast month window uses `cycleBounds()`. **Important:** `incomeLoggedSoFar` filters out entries with `recurringId` — recurring-generated income is already projected forward via `projectedRecurringIncome`; counting both would double-count the same salary rule.

**Budgets:** Per-category + Overall. Pace line from day 3 (uses `cycleBounds` for elapsed/total days). Suggested amount (3-month avg). Last-month recap.

**Accounts & Wallets (2026-06-27):** Opt-in via Settings → Finance toggle. DB version 5 adds `accounts` store. Account model: `{id, name, type ('savings'|'cc'), openingBalance, paymentMethodIds[], createdAt}`. On first enable: onboarding sheet. On re-enable: out-of-sync warning. On disable: data preserved, feature hidden. `pt_accounts_enabled='1'` / `pt_accounts_had_data='1'` in localStorage.

Account edit sheet: name, type (locked after creation), balance/outstanding (label changes by type), payment methods multi-select. `state.acctEditPaymentIds` (Set). `account-edit-overlay` has `z-index:901` so it paints above the manage/view sheets that open it.

**Account balance computation (2026-06-27):** `computeAccountBalance(account)` queries all transactions and computes running balance from opening balance. Savings: opening + income credited − expenses debited + transfers in − transfers out. CC: opening (outstanding) + expenses debited − income credited − transfers in (payments) + transfers out. `renderAccountsViewSheet`, `renderManageAccountsList`, and `renderAccountsOnboardingList` are all async and use `computeAccountBalance()` — never read `a.openingBalance` directly for display. All three show a brief "Calculating balances…" loading state. Net worth is computed from live balances. During onboarding, `computeAccountBalance` correctly returns the opening balance since no transactions exist yet.

Add screen: account pill strip above category grid (`#add-account-section`, hidden when accounts disabled or in transfer/income mode). Selecting account filters payment methods to that account's `paymentMethodIds`. Unknown payment method after save → confirm prompt to add to account. `pt_last_account` persists last used account.

Insights 🏦 sheet: lists all accounts with computed live balances (masked by default), net worth. Eye toggle inside sheet synced to global `state.incomeRevealed`.

Bulk assign: Settings → Manage accounts → "Bulk assign past transactions" → opens `bulkaccount-screen`. Shows only transactions without `accountId`. Tick + assign.

**Transfers (2026-06-27):** `type:'transfer'`, `fromAccountId`, `toAccountId`. No category, no payment method, no group, no warranty, no split. Excluded from budgets/forecast/insights via `isExpenseEntry()` returning false. Appear in List only under Transfers filter (⇄ icon, "From → To" subtitle, grape amount). Same-account validation on save. Transfer mode requires ≥2 accounts.

**App Guide:** `app-guide.json` — 9 sections, auto-shown once after first PIN setup.

**What's New:** `releaseNotes` in `app-guide.json` (newest first). Mint Home banner (priority-gated). One-time SW-based notification (`reg.showNotification()` required for Android; falls back to `new Notification()` for desktop). `pt_last_seen_version` written only when user opens What's New.

**Other:** Backup nudge (15-day, `pt_last_export`, priority-gated). Soft-delete + undo. Split expenses. Attachments (base64, chunked). Export/import `schemaVersion:5` — includes accounts and a `preferences` object (`cycleDay`, `accountsEnabled`, `accountsHadData`). On import, preferences are restored automatically so cycle day and accounts toggle survive a device restore. Older backups without `preferences` import cleanly with no regression.

**Dropped:** Dark mode.

---

## 2. Data model

**Expenses/income/transfers** (all in `expenses` store):
- Expense: `{id, type:'expense'|absent, amount, categoryId, paymentMethod, accountId, date, note, attachmentIds[], recurringId, groupId, warrantyExpiry, warrantyDurationMonths, splitTotal, splitWith, splitSettled, excludeFromForecast, createdAt}`
- Income: `{id, type:'income', amount, incomeCategoryId, accountId, date, note, attachmentIds[], recurringId, createdAt}`
- Transfer: `{id, type:'transfer', amount, fromAccountId, toAccountId, date, note, attachmentIds[], createdAt}`

**Recurring rules:** `{id, name, amount, type ('expense'|'income'), categoryId, incomeCategoryId, paymentMethod, frequency, startDate, endDate, nextDueISO, active, createdAt, groupId, accountId}`

**Accounts:** `{id, name, type ('savings'|'cc'), openingBalance, paymentMethodIds[], createdAt}`

**Categories:** id, name, icon, color, isDefault. **Payment methods:** id, name, icon. **Groups:** id, name. **Budgets:** id, categoryId (null=Overall), monthlyLimit, createdAt. **Attachments:** id, expenseId, type, fileName, mimeType, data (ArrayBuffer).

**DB version: 5** (accounts store added at v5; budgets at v4).

Type guards — apply consistently, income and transfers must never reach budgets/forecast/warranty/insights/split:
- `isExpenseEntry(e)` → `(!e.type || e.type==='expense') && e.type!=='transfer'`
- `isIncomeEntry(e)` → `e.type==='income'`
- `isTransferEntry(e)` → `e.type==='transfer'`

---

## 3. localStorage keys

| Key | Value |
|-----|-------|
| `pt_pin` | SHA-256 hash of PIN |
| `pt_bio` / `pt_bio_cred` | biometric state |
| `pt_fails` / `pt_lockout` | login failure tracking |
| `pt_guide_shown` | app guide auto-show flag |
| `pt_last_export` | timestamp of last export |
| `pt_last_seen_version` | last What's New version seen |
| `pt_notif_enabled` | notifications toggle |
| `pt_cycle_day` | financial cycle start day (1–28, default 1) |
| `pt_accounts_enabled` | '1' when accounts feature active |
| `pt_accounts_had_data` | '1' once any account has been created |
| `pt_last_account` | id of last used account on Add screen |
| `pt_onboard_dismissed` | '1' when onboarding checklist permanently dismissed |
| `pt_drive_connected` | '1' once Google Drive backup connected on this device |
| `pt_drive_last_backup` | timestamp (ms) of last successful Drive backup |
| `pt_drive_email` | reserved for displaying connected account email (not currently populated — GIS implicit flow doesn't return profile info without an extra `userinfo` scope call) |
| `pt_drive_last_error` | '1' when the last backup attempt failed (drives the cloud icon's error dot); cleared on next successful backup |

---

## 4. Architecture gotchas

**Android WebKit overlay trap:** Never hide overlays with `opacity:0; pointer-events:none` — creates a GPU compositing layer that intercepts all touch events. Always use `display:none` (via `.hidden` class). `account-edit-overlay` has `z-index:901` (one above standard 900) so it paints above whichever sheet opened it.

**`async` microtask breaks:** Making a function `async` introduces microtask breaks that can silently halt execution. Prefer synchronous functions with `.then()` for non-blocking fetches (pattern used in `openRecurringEdit`). Exception: `renderAccountsViewSheet` is intentionally async — it shows a loading state then updates, which is the correct UX for a DB-query-heavy render.

**`flex-shrink:0` on `.pay-row`:** Load-bearing. Collapses to zero height inside flex-column parent without it.

**`.recent-row{isolation:isolate}` + `.bottom-nav{z-index:5}`:** Keeps `.recent-row`'s own `z-index:1` contained so it can't climb up and land above `.bottom-nav` at the FAB seam. **Moved here from `.scroll`/`#home-scroll-body` on 2026-07-01** — those containers used to carry the `isolation:isolate` instead, but a full-viewport-height scroll container holding a constant stacking-context isolation was the suspected cause of a tablet-specific GPU rendering bug (large background fills going blank/flickering on one Android tablet, confirmed via diff against a known-working earlier build — see "Tablet rendering investigation" below). Narrowing the isolation boundary to the ~50px `.recent-row` element itself should give identical z-index containment with far smaller compositing surface area. Both rules — the `isolation:isolate` here and the `z-index:5` backstop — remain load-bearing; don't remove either without re-testing the FAB/swipe-row z-index seam (recolor `.recent-row` neon green temporarily to check, per the original fix's method).

**`esc()` for `innerHTML` only** — never before `.textContent` (double-escapes).

**`pt_last_seen_version`** written only when user opens What's New, not when notification fires.

**Biometric prompt** must fire after `visibilitychange` with page visible — firing while hidden causes Android's WebAuthn API to silently reject.

**`renderTransactions()`** guarded by `txnRenderSeq` against stale async overwrites.

**`ADD_OPT_DEFS`** single source for MORE OPTIONS chips. Every state flip must call `renderOptRow()` or dot goes stale.

**`forceRefreshApp`** must be top-level, not nested inside `init()`.

**SW notifications:** `reg.showNotification()` required on Android — `new Notification()` silently ignored on mobile. Always try SW registration first, fall back for desktop.

**Cycle bounds:** `cycleBounds(refISO)` is the canonical month-boundary function — use it everywhere, not `monthBounds()`. When cycle day is 1, `cycleBounds` delegates to `monthBounds` preserving existing behaviour. `cyclesAgoBounds(n)` replaces `monthsAgoBounds(n)`.

**Sticky screen layouts:** Home, List, and Insights all use a split structure — fixed top div + `.scroll` (or `#home-scroll-body` on Home specifically) body div — rather than a single `.scroll` wrapping everything. Neither the top div nor the scroll body carries `isolation:isolate` as of 2026-07-01 (see `.recent-row` gotcha above for where that moved). If adding a new sticky element, make sure it's outside `.scroll` and has `flex-shrink:0` so it doesn't collapse. For Home specifically, `#home-overview-sticky` must be hidden (`.hidden`) when non-overview tabs are active, or it blocks the full scroll area for Forecast/Budgets/Warranties.

**`sw.js`:** Cache name `paisatrail-v3`. `index.html` stale-while-revalidate. Bump cache name only if `manifest.json` or icons change. `{cache:'no-store'}` on fetch calls is load-bearing.

---

## 5. Testing

Playwright + Chromium available in sandbox. Key patterns:
- Pre-seed PIN via `context.addInitScript` — SHA-256 hash of PIN as `pt_pin` in localStorage.
- Scope nav selectors: `.screen:not(.is-hidden) [data-nav="x"]`.
- Close any open sheet before clicking elements behind it — sheets at z-index 900 block everything below. Dismiss confirm overlays (`acct-addpm-overlay` etc.) explicitly after saves that trigger them.
- Re-query DOM elements after any render call — stale handles cause silent failures.
- `Notification.permission` getter broken in headless Chromium — stub for notification tests.
- `loadGuideContent()` fetches `app-guide.json` over network — fails in sandboxed environment. Mock `shouldShowWhatsNewBanner` for banner hierarchy tests.
- Transfer mode requires ≥2 accounts in state before the tab becomes active.
- Account balance tests: associate a payment method with the account during onboarding to avoid `acct-addpm-overlay` blocking navigation after save.

---

## 6. Design system

Palette: paper `#FFFCF7` · ink `#241F3D` · sunshine `#FFC23C` · coral `#FF6B5B` · mint `#2EC4B6` · grape `#8657E0` · canvas `#2A1F4D`. Fonts: Fredoka (display) · Plus Jakarta Sans (body) · Space Mono (amounts).

---

## 7. File structure

`index.html` · `manifest.json` · `sw.js` · `icons/icon.svg` · `app-guide.json` (guide content + `releaseNotes` — edit this, never `index.html`, for help text or version announcements).

---

## 8. Standing rules

- **Discuss before build** — share honest assessment, wait for explicit confirmation before writing code.
- **Every shipping session** must add a `releaseNotes` entry to `app-guide.json` (newest first) and update relevant guide section text.
- **Validation after every edit:** extract `<script>` → `node --check`; Python tag-balance check. Playwright smoke tests, then delete test file before handoff.
- **Deliver** `index.html` + `app-guide.json` + `paisatrail-project-handover.md` via `present_files`.
- **Grammar:** correct Krishna's grammatical/vocabulary errors in conversation; ignore typos.

---

## 9. Tablet rendering investigation (2026-07-01)

A specific Android tablet (Samsung-style, Chrome browser, confirmed via screenshots showing the `mckrishnachaitanya.github.io/paisatrail/` URL) exhibited large background-color fills (the purple Home overview card, panel backgrounds across screens) rendering blank/white, intermittently — described by Krishna as "flickering," worsening across the most recent few sessions of feature work, not present at all in a much older build, and present-but-milder in the immediately prior session's build. Not reproduced on Krishna's phone. A different, comparably complex PWA (`/mnt/user-data/uploads/index.html`, ~5400 lines, similar overlay-heavy architecture) was tested on the same tablet and did NOT show the issue — ruling out a simple "this tablet's GPU can't handle any complex PWA" explanation and several initial theories (overlay count, `backdrop-filter` usage, infinite CSS animations — all checked via direct comparison and found NOT to differentiate the two apps).

**Root cause (probable, not yet device-confirmed):** diffing the confirmed-working older build against current `index.html` showed only ~17 lines of CSS difference, of which the standout structural change was `isolation:isolate` being added to `#home-scroll-body` (new in the broken builds) on top of its pre-existing presence on `.scroll` (an older, already-documented fix for a `.recent-row` z-index escaping into `.bottom-nav`'s stacking context at the FAB seam). Suspicion: `isolation:isolate` on a full-viewport-height, constantly-repainted scroll container is a known category of GPU-compositing risk on certain Android browser/driver combinations, and having it on *two* such large containers (`.scroll` generically + `#home-scroll-body` specifically) may have tipped this particular tablet over some threshold.

**Fix applied (2026-07-01, NOT YET DEVICE-CONFIRMED):** Removed `isolation:isolate` from both `.scroll` and `#home-scroll-body`. Re-applied it directly to `.recent-row` instead (the actual element whose z-index needed containing, ~50px tall, present in all 7 places `.recent-row` is rendered, not just the 2 wrapped in `.swipe-wrap`). Same z-index containment logic, far smaller stacking-context surface area. `.bottom-nav`'s `z-index:5` backstop left untouched as defense in depth either way.

**Still needs, before this can be considered closed:**
1. Device confirmation that the tablet flicker is actually gone with this change — Krishna needs to test on the same tablet.
2. Regression check that the original z-index bug this fix was for (FAB dome showing a sliver of `.recent-row`'s color at the swipe-row seam) has NOT returned — re-test with the neon-green recolor trick described in the original fix comment if any doubt.
3. If the flicker persists even after this change, the `isolation:isolate` theory is wrong and the investigation needs to restart — likely next step would be using the new Debug Log panel (Settings → Debug log, added this session) to capture viewport/DOM-layer-count snapshots at the moment of failure, since file-diffing alone wasn't conclusive enough to fully confirm causation, only correlation.

**Debug Log panel (Settings → Debug log):** Built specifically to support this investigation if the CSS fix above doesn't resolve it. Captures `console.error`/`console.warn`/uncaught exceptions/unhandled promise rejections into a capped localStorage ring buffer (`pt_debug_log`, max 150 entries), plus an on-demand "Log render state" snapshot (viewport size, DPR, user agent, visible screen/overlays, count of fixed-position elements in the DOM). One snapshot fires automatically per unlock. Deliberately built using `display:none`/`display:flex` toggling rather than this app's usual `opacity:0;pointer-events:none` overlay pattern, both as a live test of that exact hypothesis and so the panel itself isn't a confound. Not a permanent feature — safe to leave (near-zero overhead) or strip out once the tablet issue is fully resolved and confirmed not to recur.

## 10. Backlog

1. **Device-test Google Drive backup** (2026-06-30, not yet verified on real device): connect flow on real Android Chrome, auto-backup firing correctly 24h apart, manual backup with attachments completing without the app being closed, restore-on-empty-DB prompt, manual restore with the destructive warning, pruning behavior over several real days of use, and the rare-but-expected re-auth prompt when the implicit token silently fails to refresh. Drive API calls cannot be exercised in the sandbox (no network access) — this entire feature is unverified beyond UI wiring and isolated logic tests until Krishna runs it live.
2. **Transfers Phase 2** — transfer editing (currently add/delete only), transfer history per account
3. **Multi-device cloud sync** — needs backend, furthest out (note: distinct from Drive backup above — this would be live Firestore sync across simultaneously-active devices, not a backup snapshot)
4. **Excel/CSV export** — deferred ~4 months pending real usage data
5. **Consolidate segmented-control implementations** (`.home-tabs` / `.segmented-tabs`) — minor cleanup
