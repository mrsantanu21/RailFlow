# RailFlow — Railway Feature-Gap Audit & Capability Benchmark

> **Audit Date**: October 2026  
> **Benchmark Reference**: Official IRCTC Rail Connect App & CRIS PRS/NTES Architecture  
> **Target System**: RailFlow Full-Stack Railway Reservation & Operations Platform  

---

## 1. Executive Summary

This audit assesses RailFlow against official Indian Railways systems—specifically the **IRCTC Rail Connect** mobile/web application and **CRIS (Centre for Railway Information Systems)** passenger reservation (PRS) and train enquiry (NTES) backends.

RailFlow is designed as a high-fidelity **academic engineering sandbox and operations evaluation platform**. The primary objective of this audit is to enforce strict **data provenance transparency**: clearly distinguishing genuine external railway feeds (ChukChuk NTES session gateway, RapidAPI IRCTC timetable feed) from local simulated prototypes (segment-locked seat inventory, demo payment gateway, sandbox PNR state machines), while actively eliminating deceptive claims (e.g. "live GPS satellite tracking" or "CRIS test node authorization").

---

## 2. Feature-Gap Benchmark Matrix

| Feature Area | IRCTC Rail Connect Benchmark | RailFlow Status | Implementation Reality & Evidence |
| :--- | :--- | :--- | :--- |
| **Train Search by Route** | Search between any 2 stations across IR network with class & quota filters | **PRESENT** | Source/destination autocomplete, date validation (prevents past dates), class availability calculation, and Tatkal/quota filters. |
| **Train Lookup by Number / Name** | Direct lookup of 5-digit train number (e.g., `12301`, `22436`) or train name | **PRESENT** | Implemented tabbed route vs. train-number search with autocomplete, schedule stops, and 1-click booking handoff. |
| **Live Running Status** | Real-time train tracking with current station, upcoming stations, and delay minutes | **PRESENT (NTES/Timetable)** | Dual live architecture: ChukChuk FastAPI NTES wrapper (`/trainingStatus`) for live delay/station progression; RapidAPI IRCTC timetable feed fallback; local timetable baseline. **GPS coordinates strictly null**. |
| **Seat Availability Calculation** | Real-time class availability per train with waiting list (GNWL, RLWL, PQWL) | **PRESENT (Sandbox)** | Segment-aware seat reservation engine (`ensureTrainRunInventory`) in SQLite/Prisma with coach layouts (`1A`, `2A`, `3A`, `SL`, `CC`, `EC`). Non-overlapping segments share physical seats. |
| **Fare Calculation & Breakdown** | Distance-based telescopic fare + superfast + reservation + GST + optional catering | **PRESENT** | Base distance-based fare, GST calculation, transparent optional catering toggle (+₹220), itemized breakdown synchronized between card and modal. |
| **Quota Support** | General (GN), Tatkal (TQ), Premium Tatkal (PT), Ladies (LD), Senior Citizen, Divyangjan | **PARTIAL** | Quotas are selectable in search and booking schema; Tatkal opening window warning banner (10:00 AM AC / 11:00 AM Non-AC) is surfaced; premium dynamic surge pricing is simulated. |
| **PNR Enquiry** | Official 10-digit PNR lookup on PRS returning coach, berth, quota, and chart status | **PRESENT (Sandbox)** | Real-time PNR lookup by 10-digit number. Enforces user data isolation (404 for unauthorized access) and displays honest sandbox verification badges. |
| **Passenger Master List** | Stored passenger profiles with age, gender, berth preference, senior citizen flag | **PRESENT** | Passenger profiles with berth preference, food choice, and concession indicators. |
| **Booking & Seat Allocation** | Official PRS booking with coach/berth assignment and chart preparation | **PRESENT (Sandbox)** | Atomic transactional booking (`prisma.$transaction`) with 10-minute lock TTL, coach-specific berth allocation (LB, MB, UB, SL, SU), and PNR generation. **Local sandbox only**. |
| **Cancellation & Refund Calculation** | Official cancellation with time-based deduction rules (flat charge, 25%, 50%, TDR) | **PRESENT (Sandbox)** | Tiered cancellation policy (₹240 flat >48h, 25% 48h–12h, 50% 12h–4h, non-refundable <4h). Idempotent cancellation endpoint with simulated refund accounting. |
| **Payment Gateway** | Multiple payment modes (UPI, Net Banking, Credit/Debit Cards, IRCTC iMudra) | **PRESENT (Sandbox)** | Multi-tab payment modal (UPI QR, Card, NetBanking) with honest sandbox disclosure ("Simulated Payment Node"). |
| **Reservation Charts** | Chart preparation 4 hours prior to departure, displaying vacant berths | **PARTIAL** | Admin dashboard displays real-time coach occupancy and seat allocation heatmaps; scheduled 4-hour automatic chart freeze worker is planned. |
| **Boarding Point Change** | Changing boarding station up to 24 hours prior to departure | **MISSING** | Station alighting/boarding is fixed at time of segment allocation; post-booking modification endpoint is currently missing. |
| **Direct IRCTC PRS Integration** | Direct transactional write to CRIS CONCERT mainframe | **BLOCKED** | Enterprise restricted by Indian Railways. CRIS requires Principal Service Provider (PSP) licensing, high bank guarantees (₹5L+), static IP, and DSC tokens. **Inaccessible for academic software**. |
| **Raw GPS Satellite Locomotive Tracking** | ISRO Real-Time Train Information System (RTIS) transponders | **BLOCKED / ABSENT** | RTIS transponder telemetry is restricted to the internal Control Office Application (COA). Public NTES feeds only report station clearance times. **RailFlow strictly returns `coordinates: null`**. |

---

## 3. Data Provenance & Source Taxonomy

| Data Source | Status in RailFlow | Provenance Classification | What It Provides | What It Does NOT Provide |
| :--- | :--- | :--- | :--- | :--- |
| **ChukChuk NTES Gateway** (`railflow-app/chukchuk-api`) | **ACTIVE** (when running) | Live Web Session NTES Scraper | Real-time station arrival/departure events, delay strings, platform numbers. | No raw GPS coordinates; sensitive to upstream NTES HTML changes. |
| **RapidAPI IRCTC Gateway** (`indian-railway-irctc.p.rapidapi.com`) | **ACTIVE & VERIFIED** | Commercial Proxy Gateway | Verified official train routes, schedule stops, stop sequence numbers, distances, running days. | Dynamic live delay feed is unsupported on basic tier; no raw GPS coordinates. |
| **Prisma Timetable Baseline** (`railflow-app/server/prisma`) | **ACTIVE FALLBACK** | Local Seeded Database | Deterministic clock-synchronized progression based on CRIS master schedules. | No dynamic delay sensor data; strictly schedule-based. |
| **Local Seat Inventory Engine** (`railflow-app/server/dev.db`) | **ACTIVE SANDBOX** | Academic Mock Inventory | High-concurrency seat locking, segment overlap detection, coach seat maps. | Does not communicate with IRCTC PRS mainframe. |
| **Simulated Payment Gateway** | **ACTIVE SANDBOX** | Academic Mock Gateway | Transaction validation, mock payment receipts, cancellation refunds. | Does not process real financial instruments. |

---

## 4. Trust & Ethics Remediation

During this audit and refactoring cycle, all misleading claims identified in previous iterations were eliminated:

1. **Removed Fake GPS/Radar Claims**: Eliminated references to "Live Radar Telemetry", "ISRO Satellite Pings", and "GPS Tracking". In accordance with architectural invariants, `coordinates: null` is enforced across all tracking feeds.
2. **Removed Deceptive CRIS Endorsements**: Replaced badges claiming "CRIS Test Node Authorized" or "Verified CRIS PNR Record" with transparent labels: `"Verified RailFlow Sandbox Record"` and `"Academic Sandbox Prototype"`.
3. **Transparent Catering Charges**: Replaced mandatory food surcharges with an opt-in toggle (+₹220) and itemized fare receipts.
4. **Transparent Data Notices**: Added sandbox disclaimer banners across search, payment, and dashboard views, ensuring full compliance with academic ethics guidelines.
