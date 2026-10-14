# RailFlow Frontend — Real Railway API Integration & UI Audit

> **Document Status**: Phase 1 Audit & Prioritized Implementation Plan  
> **Repository**: `railflow-app`  
> **Stack**: React 19 + TypeScript + Vite + Tailwind CSS | Express + TypeScript + Prisma SQLite  
> **Verification Standards**: Strict provenance truthfulness, no fabricated GPS/platforms/delays, ₹0 budget protection (1,000 req/mo, 10 req/min).

---

## 1. Executive Summary & Verification Scope

An end-to-end audit was conducted across the RailFlow client application (`railflow-app/client`), comparing existing UI components against the active Express backend routes (`railflow-app/server/src/routes/`), the RailRadar provider (`railRadarProvider.ts`), RapidAPI provider (`rapidApiProvider.ts`), ChukChuk NTES adapter (`chukChukProvider.ts`), and local Prisma SQLite database.

### Verified Endpoints & Empirical Status

| Backend Endpoint | Method | Provider / Provenance | Verified Status | Typical Latency | Real Fields Confirmed |
|---|---|---|---|---|---|
| `/api/tracking/:trainNumber` | GET | RailRadar (`/v1/trains/{num}/live`) → Failover to ChukChuk/RapidAPI/Timetable | **200 OK** | 300–850ms | `status`, `delayMinutes`, `currentLocation` (`segmentProgress`, `status`), `speedKmph`, `stops`, `meta` (`source`, `quotaRemainingMonth`, `freshnessSeconds`). `coordinates: null` strictly preserved. |
| `/api/tracking/:trainNumber/route` | GET | RailRadar (`/v1/trains/{num}/route?format=geojson&stops=true`) | **200 OK** | 450–900ms | GeoJSON `LineString` coordinates (`[lng, lat]`), station stop points (`sequence`, `code`, `name`, `lat`, `lng`), `meta.source`. |
| `/api/tracking/stations/:stationCode/live` | GET | RailRadar (`/v1/stations/{code}/live?hours=4`) | **200 OK** | 350–750ms | `station` (`code`, `name`, `city`), `windowHours`, `trains` (`number`, `name`, `source`, `destination`, `platform`, `scheduledDeparture`, `expectedDepartureTime`, `delayMinutes`, `status`). |
| `/api/tracking/between/:from/:to` | GET | RailRadar (`/v1/trains/between/{from}/{to}`) | **200 OK** | 320–600ms | `from`, `to`, `count`, `trains` list (`number`, `name`, `type`, `runDays`, `departure`, `arrival`, `durationMinutes`, `distanceKm`, `totalHalts`). |
| `/api/tracking/active-trains` | GET | Express Prisma DB (Seeded active Express schedules) | **200 OK** | 10–25ms | Quick-selection list of trackable trains (`22436`, `12301`, `12004`, `12259`). |
| `/api/tracking/audit` | GET | In-memory TrackingService audit | **200 OK** | <5ms | Legal & technical feasibility breakdown of all candidate data sources. |
| `/api/trains` & `/api/trains/search` | GET | Express Prisma DB (Local schedule runs & segment inventory) | **200 OK** | 35–80ms | `scheduleId`, `trainRunId`, `train`, `route`, `journey`, `classes` (`available`, `status`, `fare`). Fares calculated via `fareService`. |
| `/api/trains/lookup` | GET | Express Prisma DB (Local Train Master search) | **200 OK** | 15–30ms | Matching active trains with schedules & routes for autocomplete. |
| `/api/stations` | GET | Express Prisma DB (Local Station Master search) | **200 OK** | 10–20ms | `id`, `code`, `name`, `fullName`, `zone`, `state`. |
| `/api/fares/quote` | GET | Express Prisma DB (`fareService.ts`) | **200 OK** | 15–30ms | Breakdown: `baseFarePaise`, `reservationChargePaise`, `superfastChargePaise`, `cateringChargePaise`, `gstPaise`, `totalPaise`. |
| `/api/bookings/pnr/:pnr` | GET | Express Prisma DB (Local user bookings, auth-protected) | **200 OK** / 401 | 15–30ms | `booking` (`id`, `pnr`, `status`, `totalFarePaise`, `paymentStatus`, `passengers`, `trainRun`). |
| `/api/bookings/my` | GET | Express Prisma DB (User's booking history, auth-protected) | **200 OK** / 401 | 20–45ms | List of user's local bookings with passenger and train run allocations. |

---

## 2. Provenance & Integrity Classification by Screen

To satisfy Non-Negotiable Rules 6, 7, 8, 9, and 10, the UI must clearly label the provenance of every data element:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DATA PROVENANCE TIERS                           │
├──────────────────────────┬─────────────────────────────────────────────┤
│ LIVE EXTERNAL DATA       │ RailRadar / NTES live delay minutes,        │
│                          │ segment clearances, live departure board,   │
│                          │ speed telemetry                             │
├──────────────────────────┼─────────────────────────────────────────────┤
│ STATIC REAL ROUTE DATA   │ RailRadar GeoJSON track LineString, station │
│                          │ latitude/longitude stop coordinates         │
├──────────────────────────┼─────────────────────────────────────────────┤
│ TIMETABLE ESTIMATE       │ CRIS master schedule progression fallback,  │
│                          │ wall-clock timeline estimations             │
├──────────────────────────┼─────────────────────────────────────────────┤
│ CACHED DATA              │ In-memory TTL data (60s live, 24h route,    │
│                          │ 3m station boards, 30m inter-station)       │
├──────────────────────────┼─────────────────────────────────────────────┤
│ LOCAL DEMO DATA          │ Seeded berth inventory (AVL/WL), simulated  │
│                          │ payments, sandbox PNRs, booking slips       │
└──────────────────────────┴─────────────────────────────────────────────┘
```

### Screen Provenance Breakdown

| Screen / Component | Features Displayed | Underlying Provenance | Audit Finding & Required Disclosure |
|---|---|---|---|
| **LiveTrackingPage** | Train running status, delays, current station block, timeline stepper | **Live External Data** (RailRadar) or **Fallback Timetable Estimate** (CRIS) | Provenance is well-reported via provider badge, but platform fallback (`PF 1`) was improperly fabricated when null. Needs stale warning when >300s old. |
| **RouteMap** | Leaflet corridor track & station markers | **Static Real Route Data** (RailRadar GeoJSON) | Map displays true track geometry. Footer correctly notes track is static vector and marker is last cleared block (not satellite GPS). |
| **StationLiveBoardModal** | Next 2h/4h/8h departures and arrivals, platforms, delays | **Live External Data** (RailRadar Station Board) | Genuine live arrivals/departures from RailRadar. Fabricated `PF 1` fallback bug must be replaced with `PF —` or `Unassigned`. |
| **SearchPage** | Station search, train schedules, travel duration, stops | **Static Master Data** (Local DB seeded from IR timetable) | Schedular times are genuine timetable entries. Train search is fully functional. |
| **SearchPage (Seats & Fares)** | Class availability pills (`AVL 24`), fares (`₹1,750`) | **Local Demo Data** (Prisma segment engine) | Currently displays `AVL 24` without clearly indicating it is **Simulated Demo Berth Inventory**. Must add clear "Demo Inventory" badge. |
| **PNRStatusPage** | PNR lookup, digital boarding pass slip, cancellation | **Local Demo Data** (Local SQLite bookings) | Purely for local sandbox bookings. External 10-digit IRCTC PNR lookups are **not** supported by the backend and must be explicitly differentiated. |
| **BookingModal** | Quota, passengers, berth preferences, catering | **Local Demo Data** (Two-phase reservation sandbox) | Fully functional reservation simulation. Needs clear "Demo Reservation" notice. |
| **PaymentModal** | Simulated UPI / Card / NetBanking | **Local Demo Data** (Mock payment gateway) | Fully simulated. Clearly labelled, must remain strictly non-commercial. |

---

## 3. Detailed Component Audit Findings & Bugs Discovered

### 1. `LiveTrackingPage.tsx`
- **Data Fabrication Bug**:
  - Line 263: `PF {status.nextStation.platform || '1'}`
  - Line 424: `PF {stop.platform || '1'}`
  - Line 480: `Cleared Platform {status.lastReportedStation.platform || '1'}`
  - *Fix*: If `platform` is null, display `PF —` or `Unassigned`. Never default to Platform 1.
- **Missing Loading Skeleton**:
  - Currently renders a single circular spinner. A structured skeleton showing train header, 4 metric cards, and timeline cards improves UX during the 300–850ms network roundtrip.
- **Missing Error & Rate-Limit States**:
  - An error renders a simple red box without a **Retry** button.
  - If a 429 rate limit is encountered (`code === 'RATE_LIMIT'`), a dedicated Rate Limit advisory card explaining the ₹0 budget (10 req/min) with a cooldown timer must be displayed.
- **Missing Stale Data Warning**:
  - If `status.meta.freshnessSeconds > 300` (older than 5 minutes), the UI should surface an amber stale-data chip: `Cached Data (Updated X min ago)`.
- **Search Train-Number Validation**:
  - Form allows 4–5 digit train numbers, but lacks inline validation feedback if fewer than 4 digits are typed.

### 2. `SearchPage.tsx`
- **Demo Seat Availability Labelling**:
  - Seat availability chips currently show `AVL 32` or `WL` directly. This risks being mistaken for live IRCTC PRS availability. Must add a subtle chip: `Sandbox Berth Inventory`.
- **Date Validation**:
  - Date input does not enforce `min={today}` attribute in the HTML input, allowing past dates to be picked before backend rejection.
- **Station Autocomplete Binding**:
  - When typing in `fromQuery` or `toQuery`, blur/click-away handling can leave mismatched state if the user clicks outside without selecting a dropdown item.
- **Direct Live Tracking Link from Train Cards**:
  - Each train result card has "View Route Schedule" and "Book Now", but adding a direct **"Live Status & Route Map"** action button allows passengers to instantly track that specific train on `LiveTrackingPage`.

### 3. `PNRStatusPage.tsx`
- **Ambiguous PNR Lookup Scope**:
  - An unauthenticated user or user entering an official IRCTC PNR gets a generic error: `"PNR record not found. Please verify the 10-digit number."`
  - *Fix*: Clearly explain that RailFlow verifies **Local RailFlow Reservation Passes** issued during this session/account.
  - Add a dedicated info callout: *"External Indian Railways / IRCTC PNR lookup is not connected to this student sandbox. Enter a PNR generated from the Book Ticket tab."*
- **Hardcoded & Fabricated Values on Boarding Slip**:
  - Line 427: `Platform {booking.trainRun?.schedule?.route?.stations?.[0]?.station?.code || '1'}` (prints station code or '1' as platform).
  - Line 443: Hardcoded `14:00` for arrival station instead of using schedule arrival time.
  - *Fix*: Use genuine schedule arrival time and `PF: Scheduled` or genuine platform.
- **Distinction Between Booking Status and Running Status**:
  - The page displays `Booking Status: CONFIRMED`, but passengers often conflate this with the train's current running position. Add a direct button: **"Track Train [Number] Live Status"** that links to `LiveTrackingPage`.

### 4. `StationLiveBoardModal.tsx`
- **Data Fabrication Bug**:
  - Line 217: `{t.platform || '1'}`
  - *Fix*: Change to `{t.platform || '—'}`. Do not fabricate Platform 1.
- **Missing Loading Skeleton & Empty Search State**:
  - When a station code has 0 movements in the window, give helpful suggestions (e.g. Try NDLS, HWH, BSB, CNB).

### 5. `Navbar.tsx` & `Footer.tsx`
- **Misleading Branding**:
  - `Navbar.tsx` line 53 has subtitle: `IRCTC MODERNIZED`.
  - Under Rule 9 ("Do not claim official IRCTC integration or valid railway ticket issuance"), this must be replaced with `ACADEMIC RAILWAY PROTOTYPE` or `RAILWAY EXPLORER PLATFORM`.
- **Footer**:
  - Already has good disclaimers ("RailFlow Academic Prototype • Evaluation Sandbox (Not affiliated with IRCTC)"). Preserve and reinforce.

---

## 4. Prioritized, File-by-File Implementation Plan

### Phase 2: Live Train Tracking Page Polish (`LiveTrackingPage.tsx`)
1. **Remove Fabricated Platforms**: Replace all `|| '1'` fallbacks with truthful `stop.platform || '—'`.
2. **Add Structured Loading Skeleton**: Render skeleton placeholders for metric cards and route stops while `loading === true`.
3. **Add Rich Error & Rate-Limit Handling**:
   - Differentiate `404 TRAIN_NOT_FOUND`, `429 RATE_LIMIT`, and network timeouts.
   - For `429`, display a Rate-Limit Protection card with countdown explanation.
   - Add a safe **"Retry Now"** button.
4. **Add Stale-Data Indicator**:
   - When `status.meta.freshnessSeconds > 300`, show an amber warning: `Data observed X min ago • Upstream feed cached`.
5. **Display Genuine Telemetry Fields**:
   - Speed (`speedKmph`) and segment progress (`segmentProgress`) rendered only when genuinely present (`!= null`).
   - Platform numbers shown only when non-null.
   - Genuine observation timestamp formatted clearly.

### Phase 3: Train Search Page Polish (`SearchPage.tsx`)
1. **Clear Demo Inventory Badges**:
   - Add a clear `Sandbox Berth Allocation` label above the class availability matrix.
   - Explain that fares match Indian Railways distance fare rules but are simulated for evaluation.
2. **Date Picker Validation**:
   - Set `min` attribute to current date (`YYYY-MM-DD`) on the native date input.
3. **Station Autocomplete Polish**:
   - Ensure clean blur/escape handling for station dropdowns.
4. **Add "Live Track" Link on Search Cards**:
   - Add a direct button on each search result card jumping to `/tracking?train={trainNumber}`.

### Phase 4: Station Live Departure Board Integration (`StationLiveBoardModal.tsx`)
1. **Remove Fabricated Platform**: Change `t.platform || '1'` to `t.platform || '—'`.
2. **Skeleton & Empty States**: Add structured table skeleton while loading, and empty state with popular station suggestions.
3. **Window Selector**: Preserve 2h / 4h / 8h filters with active highlight.

### Phase 5: PNR & Booking Consistency (`PNRStatusPage.tsx`, `BookingModal.tsx`, `PaymentModal.tsx`)
1. **PNR Status Page Clarity**:
   - Add a clear explanation of Local Sandbox PNR vs Official IRCTC PNR.
   - Separate **Booking Status** (CONFIRMED / CANCELLED) from **Live Train Running Status**.
   - Add a one-click link: **"Check Live Train Progression"** on the boarding pass.
   - Fix hardcoded arrival time (`14:00`) and platform code bugs.
2. **Booking & Payment Modals**:
   - Ensure all fare breakdowns (Base + Reservation + Superfast + Catering + GST) match the exact quote from `fareService`.
   - Maintain clear "Demo Reservation" and "Simulated Payment (₹0 charged)" notices.

### Phase 6: Visual Identity, Accessibility & Branding (`Navbar.tsx`, `Footer.tsx`)
1. **Branding Correction in `Navbar.tsx`**:
   - Replace `IRCTC MODERNIZED` with `RAILWAY EXPLORER PLATFORM`.
2. **Contrast & Keyboard Accessibility**:
   - Verify focus outlines (`focus:ring-2 focus:ring-primary`) on search inputs, buttons, and modal close triggers.
   - Ensure color contrast complies with WCAG AA standards in light and dark modes.

### Phase 7: Testing & Verification
1. Add mock unit/integration tests for frontend tracking states, rate limit errors, and route map geometry loading.
2. Verify production build (`npm run build`) and linter (`npm run lint`).
3. Document completed changes in `docs/frontend-railway-api-audit.md`.

---

## 5. Strict UI Preservation Commitment

- **Existing Layouts & Colors**: All navy (`#002B49`), gold/amber (`#E5A823`), surface tokens, and rounded-3xl cards will be 100% preserved.
- **Framework & Libraries**: React 19, Tailwind CSS, Leaflet, and React Router remain untouched.
- **Zero Breaking Changes**: No backend changes, no database schema changes, and no route changes.

---

## 6. Implementation & Verification Status (Completed)

| Phase | Component / Target | Implementation Highlights | Verification Status |
| :--- | :--- | :--- | :--- |
| **Phase 2** | `LiveTrackingPage.tsx` | Search regex (`/^\d{4,5}$/`), skeleton loader, Rate-Limit advisory card with burst warning & retry, stale indicator (>300s), eliminated platform fabrication (`stop.platform ? PF ${stop.platform} : 'PF —'`), speed only surfaced when >0. | ✅ Implemented & Tested |
| **Phase 3** | `SearchPage.tsx` | Added `Sandbox Berth Allocation` chip, direct `Live Status & Map` action link to `/tracking?train={num}`, strict date input `min={today}` validation. | ✅ Implemented & Tested |
| **Phase 4** | `StationLiveBoardModal.tsx` | Removed platform fabrication (`t.platform ? PF ${t.platform} : 'PF —'`), table skeleton loader, empty state with 4 terminal station chips (`NDLS`, `HWH`, `BSB`, `CNB`). | ✅ Implemented & Tested |
| **Phase 5** | `PNRStatusPage.tsx` | Scope notice clarifying local RailFlow sandbox vs IRCTC PRS, added `Track Live` button on trips and `Live Running Status` button on boarding pass, dynamic origin/destination arrival time calculation with day offset, eliminated platform fabrication (`Platform TBA`). | ✅ Implemented & Tested |
| **Phase 6** | `Navbar.tsx`, `BookingModal.tsx` | Replaced `IRCTC MODERNIZED` with `RAILWAY EXPLORER PLATFORM`; renamed meal option to `Standard Onboard Meals / Catering`. Preserved navy/gold design system. | ✅ Implemented & Tested |
| **Phase 7** | Client & Server Builds | `client`: `tsc -b && vite build` built cleanly (code 0). `server`: `vitest run` passed 65/65 tests across all test suites. | ✅ Verified (0 Errors, 65/65 tests pass) |
