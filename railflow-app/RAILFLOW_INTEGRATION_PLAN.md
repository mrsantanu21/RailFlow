# RailFlow UI Integration Plan (Updated & Verified)

## 1. Overview & Objectives
Integrate the uploaded RailFlow Enterprise Design System (`stitch_railflow_experience_platform`) into the existing React 19 / Vite / Tailwind web application (`railflow-app`) without modifying backend APIs, database schemas, authentication, or payment contracts.

### Core Principles
1. **Existing Application as Source of Truth:**
   - Routing and URL query synchronization (`from`, `to`, `date`, `quota`, `passengers`)
   - API endpoints (`/api/trains`, `/api/stations`, `/api/fares`, `/api/bookings`)
   - Session authentication (`useAuth`) and booking lifecycle
   - Concurrency safeguards and segment-aware berth allocation logic
2. **Stitch Reference Package as Source of Truth for Visual Design:**
   - Design tokens: Navy (`#00236F` / `#1E3A8A`), Amber (`#F59E0B`), Green (`#10B981`), Cyan (`#06B6D4`), Canvas (`#F6F8FC`), Surface (`#FFFFFF`)
   - Typography: Plus Jakarta Sans for headings, labels, station codes, train badges; Inter for schedules, fares, body text
   - Clean cards with subtle borders (`#CBD5E1`) and soft shadows, minimum 44px touch targets
3. **Truth in Telemetry & Berth Selection:**
   - Never claim an unverified production service (e.g., live Redis or live CRIS core database connection) is active.
   - Treat any visual berth selection as a berth preference until confirmed atomically by the server.

---

## 2. Backend Verification Findings
An audit of `server/src` and `server/prisma/schema.prisma` revealed:
- **Database & Architecture:** The backend operates on SQLite (`prisma/dev.db`) using Prisma ORM with `Serializable` transaction isolation. There is **no Redis instance** or real **CRIS PRS gateway**. Any distributed lock or Redis UI is strictly an educational / architectural prototype visualization.
- **Seat Allocation Mechanics (`server/src/routes/bookings.ts`):**
  - The API contract for `POST /api/bookings` accepts passenger objects with `berthPreference` (`LOWER`, `MIDDLE`, `UPPER`, `SIDE_LOWER`, `SIDE_UPPER`, `WINDOW`, `AISLE`).
  - The server automatically queries available unallocated seats for the journey segment, assigns `allocatedCoach` and `allocatedSeatNumber`, sets status to `LOCKED` (10-minute TTL), and confirms upon successful payment.
  - The backend does **not** accept client-specified seat IDs or seat numbers to prevent race conditions and inventory corruption.
- **Seat Map Endpoint Availability:**
  - The backend provides inventory counts per class via `GET /api/trains`, but does not expose an endpoint returning a live interactive 72-seat matrix per coach.
  - Therefore, the Coach Seat Map must function as an interactive layout demonstration where selected berths populate passenger berth preferences (`berthPreference`) and clearly indicate that final seat numbers are assigned by the server upon booking confirmation.

---

## 3. Existing Components to Reuse
| Existing Component | Purpose & Integration Role |
|---|---|
| `Navbar.tsx` | Top application header with session status, theme switching, and navigation links. |
| `DatePickerPopup.tsx` | Functional calendar popover with past-date protection. |
| `TrainResultSkeleton.tsx` | Loading skeleton matching the train card dimensions. |
| `QuickSandboxModal.tsx` | Isolated sandbox reservation for DataMeet static catalogue trains. |
| `BookingModal.tsx` | Validated booking form with passenger inputs, fare quoting, and submission to `/api/bookings`. |
| `PaymentModal.tsx` | Simulated two-phase payment gateway completing booking confirmation. |
| `ProvenanceBadge.tsx` | Data source origin indicators (Live, Cached, Timetable, Static Catalog). |
| `useClickOutside.ts` | Accessible dropdown and modal dismissal hook. |

---

## 4. Proposed Files to Modify or Create

### Files to Modify
1. **`client/src/index.css`**
   - Add centralized `--rail-*` CSS variables (`--rail-navy`, `--rail-amber`, `--rail-green`, etc.) as defined in Step 2.
   - Configure typography tokens for Plus Jakarta Sans and Inter.
2. **`client/src/pages/SearchPage.tsx`**
   - Integrate `JourneyContextBar`, `TrainResultCard`, and `CoachSeatMapModal`.
   - Preserve existing search parameters, validation, URL synchronization (`from`, `to`, `date`, `quota`, `passengers`), autocomplete, and swap animation.

### Files to Create
1. **`client/src/components/search/JourneyContextBar.tsx`**
   - Context strip displaying active corridor, date, quota, passenger count, available trains count, and "Modify Search" action.
2. **`client/src/components/search/TrainResultCard.tsx`**
   - Modular train result card with RailFlow tokens, semantic status badges, class selection, expandable route timeline, and direct seat matrix trigger.
3. **`client/src/components/booking/CoachSeatMapModal.tsx`**
   - Interactive LHB Coach Berth Allocation view supporting coach navigation (B1-B5, A1, H1, SL1), real berth types (LB, MB, UB, SLB, SUB), interactive berth selection, passenger allocation, live fare breakdown, and simulated CRIS concurrency verification log.

---

## 5. Real vs. Simulated Features

### Real Backend Features
- Live train search and corridor routing (`/api/trains`)
- Station autocomplete (`/api/stations`)
- Real-time segment overlap seat availability checking
- Server-calculated fare quotes (`/api/fares/quote`)
- Concurrency-safe atomic booking and PNR generation (`/api/bookings`)
- Two-phase payment simulation and ticket cancellation

### Simulated / Educational Features
- **CRIS Distributed Lock Feed:** Visual telemetry showing atomic row-level mutex transactions (`SELECT FOR UPDATE NOWAIT` / `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE`), clearly labeled as an educational concurrency simulation.
- **Coach Berth Selection:** Interactive coach layout where selecting a berth sets passenger berth preferences for the booking flow without bypassing server atomic allocation.
- **Static Catalog Sandbox Booking:** DataMeet trains marked with fallback pricing and simulated sandbox passes, isolated from production booking endpoints.

---

## 6. Verification & Testing Steps
1. **Static Analysis & Compilation:**
   - Run `npm run typecheck` (`tsc -b`) in `client`.
   - Run `npm run lint` (`oxlint`) in `client`.
   - Run full server test suite `npm run test` (`vitest`).
2. **Functional UI Verification:**
   - Direct URL load: `http://localhost:5173/?from=NDLS&to=BSB&date=2026-10-14&quota=GENERAL&passengers=1`.
   - Same-station validation rejection ("Origin and destination stations cannot be the same.").
   - Swap button animation and state swap without duplicate searches.
   - Custom accessible Quota and Passenger dropdowns (outside click & Escape dismissal).
   - Dynamic fallback pricing and sandbox booking for static catalog trains.
   - "View Seat Matrix" opening `CoachSeatMapModal`, interacting with berths, and passing preferences to `BookingModal`.
   - Real booking flow completion (Booking -> Payment -> PNR navigation).
