# RailFlow — Feature Implementation & Integration Guide

> **Project**: RailFlow Railway Reservation & Tracking Platform  
> **Architecture**: React 19 + Express TypeScript + Prisma SQLite + FastAPI NTES + RapidAPI  
> **Target Ports**: Client (`5173`), Express Server (`3001`), ChukChuk Gateway (`8000`)  

---

## 1. System Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │          RailFlow React Client         │
                      │         (Vite / Tailwind / CSS)        │
                      └───────────────────┬────────────────────┘
                                          │
                         REST API via Axios (Port 3001)
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │         RailFlow Express Server        │
                      │       (TypeScript / Zod / Prisma)      │
                      └─────┬─────────────┬──────────────┬─────┘
                            │             │              │
        ┌───────────────────┘             │              └──────────────────┐
        ▼                                 ▼                                 ▼
┌──────────────────┐            ┌──────────────────┐             ┌─────────────────────┐
│ ChukChuk NTES    │            │ RapidAPI Gateway │             │ Prisma SQLite DB    │
│ Gateway (8000)   │            │ (IRCTC Proxy)    │             │ (Local Sandbox)     │
├──────────────────┤            ├──────────────────┤             ├─────────────────────┤
│ Web session to   │            │ Host: indian-    │             │ Seeded Schedules,   │
│ IndianRail NTES  │            │ railway-irctc    │             │ Train Runs, Seats,  │
│ (Real delays/    │            │ (Official train  │             │ Segment Bookings,   │
│ station passes)  │            │ stops & routes)  │             │ Users & Fares       │
└──────────────────┘            └──────────────────┘             └─────────────────────┘
```

---

## 2. API Integration Details

### 2.1 RailRadar Live Railway API (Primary Live Tracking Gateway)

- **Provider**: `RailRadarTrackingProvider`
- **Base URL**: `https://api.railradar.in`
- **Authentication**: `x-api-key` header (configured via `RAILRADAR_API_KEY` in `server/.env`)
- **Budget & Tier**: ₹0 Free Tier (1,000 requests/month, 10 requests/minute burst limit)
- **Rate Limit Safeguards**:
  - In-memory in-flight request deduplication (`getOrFetch` promise memoization).
  - Multi-tier TTL cache (60s live status, 24h route geometry, 3m station boards, 30m train connectivity).
  - Dynamic quota telemetry tracking (`x-ratelimit-remaining-month`, `x-ratelimit-remaining-min`).
  - Automatic 60-second backoff cooldown on HTTP 429 (`TOO_MANY_REQUESTS`).
- **Endpoints Supported & Verified**:
  - `GET /v1/trains/{number}/live` — Live train running status, station block progression, segment clearance, delay minutes, and speed.
  - `GET /v1/trains/{number}/route?format=geojson&stops=true` — Official LineString track coordinates and stop locations rendered via Leaflet & OpenStreetMap.
  - `GET /v1/stations/{code}/live?hours=4` — Real-time station departure board with expected arrival/departure and platforms.
  - `GET /v1/trains/between/{from}/{to}` — Verified railway train connectivity between station pairs.
- **Data Provenance Invariants**:
  - RailRadar reports station-block clearances and segment progress (`segmentProgress: 0.52`, `status: 'departed'`).
  - Raw GPS coordinates are truthfully reported as `coordinates: null` in compliance with project data integrity standards.

### 2.2 RapidAPI Indian Railways Provider

- **Host**: `indian-railway-irctc.p.rapidapi.com`
- **Authentication**: `X-RapidAPI-Key` & `X-RapidAPI-Host` headers
- **Verified Working Endpoint**:
  ```http
  GET /api/trains-search/v1/train/{trainNumber}
  ```
- **Provenance & Behavior**:
  - Delivers genuine official Indian Railways master schedule data for 5-digit trains (e.g. `12301`, `22436`).
  - Contains all route stations, stop sequences, distances in km, arrival/departure schedules, and running days.
  - Returns `meta.source = 'RAPIDAPI_INDIAN_RAILWAY_IRCTC'` with truthful limitations note.
  - Dynamic live delays and GPS coordinates are **not** provided on this tier (`coordinates: null`).
- **Configuration** (in `server/.env`):
  ```env
  RAPIDAPI_KEY="8973b2c8f2msh789f81c488b8baap1afd78jsncaf5082286d4"
  RAPIDAPI_HOST="indian-railway-irctc.p.rapidapi.com"
  ```

### 2.2 ChukChuk Open-Source NTES Gateway

- **Repository**: Located in `railflow-app/chukchuk-api`
- **Technology**: Python 3.10+ / FastAPI / BeautifulSoup4 / Requests
- **Upstream Target**: `https://enquiry.indianrail.gov.in/mntes/`
- **Functionality**:
  - Dynamically fetches CSRF tokens and starts a valid session with the National Train Enquiry System.
  - Queries `GET /trainingStatus?trainNo={number}&startDate={date}` for live station departure timestamps and delay minutes.
  - Automatically prioritized by `TrackingService` whenever the service is running.
- **Running Locally**:
  ```bash
  cd railflow-app/chukchuk-api
  python -m venv venv
  .\venv\Scripts\activate
  pip install -r requirements.txt
  uvicorn app.main:app --host 127.0.0.1 --port 8000
  ```

### 2.3 Fallback Timetable Tracking Engine

- **Provider**: `TimetableTrackingProvider`
- **Behavior**:
  - Deterministically evaluates the train's scheduled station progression based on Prisma database route sequences and the current wall-clock time.
  - Guarantees high availability if third-party web scrapers or external API quotas are exhausted.
  - Honestly sets `delayMinutes: null` and `coordinates: null`.

---

## 3. High-Concurrency Seat Allocation Engine

### 3.1 Segment-Aware Overlap Mechanics

RailFlow implements genuine overlapping segment seat allocation:

- A train journey from **New Delhi (NDLS)** to **Varanasi (BSB)** via **Kanpur (CNB)**:
  - Passenger A books `NDLS -> CNB` (Sequences 1 -> 2).
  - Passenger B books `CNB -> BSB` (Sequences 2 -> 3).
  - Because their segment sequences do not overlap (`alloc.boardingSeq < toRS.sequence && alloc.alightingSeq > fromRS.sequence`), **both passengers share the exact same physical seat** on the same train run without conflicts.
  - Passenger C requesting `NDLS -> BSB` (Sequences 1 -> 3) will see that seat as occupied.

### 3.2 Two-Phase Atomic Booking Locks

1. **Lock Acquisition**: When user opens the booking modal or creates an intent, seats are locked with `status = 'LOCKED'` and `lockedUntil = now + 10 minutes`.
2. **Commit or Expiry**: When payment succeeds, status updates to `'BOOKED'`. If payment is abandoned, the 10-minute TTL expires, and subsequent searches immediately reclaim the seat.
3. **Concurrency Protection**: Simultaneous bookings on the final seat execute inside `prisma.$transaction()`, ensuring exactly 1 winner and 1 deterministic `409 INSUFFICIENT_SEATS` error.

---

## 4. Running and Verification Commands

### 4.1 Server Tests
Execute the 65-suite test harness covering authentication, search, pricing, segment concurrency, tracking invariants, and RailRadar adapter verification:
```bash
cd railflow-app/server
npm test
```
*Expected: 4 test files passed, 65 tests passed (100% green).*

### 4.2 Client Production Build
Verify TypeScript types and Vite bundle integrity:
```bash
cd railflow-app/client
npm run build
```
*Expected: 0 errors, 134 modules transformed, bundle emitted.*

### 4.3 Running the Full Stack Locally

1. **Start Express Server**:
   ```bash
   cd railflow-app/server
   npm run dev
   ```
   *Runs on `http://localhost:3001`.*

2. **Start Client Application**:
   ```bash
   cd railflow-app/client
   npm run dev
   ```
   *Runs on `http://localhost:5173`.*

3. **(Optional) Start ChukChuk NTES Gateway**:
   ```bash
   cd railflow-app/chukchuk-api
   uvicorn app.main:app --port 8000
   ```
   *Enables dynamic NTES delay scraping.*
