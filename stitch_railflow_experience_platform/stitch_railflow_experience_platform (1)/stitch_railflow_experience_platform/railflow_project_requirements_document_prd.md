# Product Requirements Document (PRD) & Engineering Specification
## RailFlow — Enterprise Database-Driven Railway Reservation System & Intelligent Transit Experience

---

### 1. Executive Summary & Product Vision
**RailFlow** is a next-generation, database-driven Indian Railway Reservation System built to modernize passenger rail ticketing and administrative fleet operations. It fuses the visual ergonomics of **Material 3 Expressive**, subtle **Liquid Glass** frosted aesthetics, and high-trust **fintech clarity** with a robust **ACID-compliant relational database architecture**.

Unlike legacy government portals, RailFlow eliminates common points of user friction (cryptic error codes, unpredictable waitlist drops, and clumsy seat selection) while providing uncompromising academic and enterprise rigor: **zero duplicate seat allocation**, **multi-segment concurrency locking**, **modular distance-based fare calculation**, and **soft-cancellation audit trails with automated refunds**.

---

### 2. Target Audience & Personas

| Persona | Role | Key Goals & Needs | Primary Surfaces |
| :--- | :--- | :--- | :--- |
| **Pooja (Daily Commuter / Business Traveler)** | Passenger / User | Fast 3-click booking, transparent confirmation chances, clear boarding passes on mobile/desktop, rapid Tatkal refunds. | Search, Berth Selection, Checkout, PNR Status, Live GPS Tracking |
| **Rajesh & Sunita (Family Travelers)** | Passenger / User | Coordinated cabin berth allocation (Lower Berths together for seniors), clear fare breakdowns, meal/amenity selection. | Coach Berth Matrix, Passenger Details, Boarding Pass |
| **Chief Controller / PRS Node Admin** | Railway Operations / Admin | Live inventory visibility, route sequencing, dynamic fare rules, conflict resolution, rake composition and dispatch. | Admin Central Operations Console, Fleet Analytics, Database Monitor |
| **Train Ticket Examiner (TTE)** | Field Officer | Fast-scan digital verification, real-time unbooked berth re-allocation, offline-ready cryptographic QR scanning. | Digital Boarding Pass Scanner, Berth Matrix Sync |

---

### 3. Core Functional Requirements

#### 3.1 User & Passenger Experience Flow
1. **Authentication & Profile Management**:
   - Secure multi-factor session management, role-based authorization (`USER`, `ADMIN`, `TTE`).
   - Profile vault storing co-passengers (age, gender, ID details, berth preferences) and past travel history.
2. **Intelligent Train Search & Route Discovery**:
   - Multi-parameter search: Source station (`FROM`), Destination station (`TO`), Journey Date, Travel Class (`1A`, `2A`, `3A`, `3E`, `CC`, `EC`, `SL`), and Quota (`General`, `Tatkal`, `Senior Citizen`, `Ladies`).
   - Instant filtering by departure window, train tier (Vande Bharat, Rajdhani, Shatabdi, Superfast), available-seats-only toggle, and amenities.
3. **Interactive Berth Matrix & Concurrency Locking**:
   - True-to-life coach layout visualization (e.g., LHB 72-berth 3A coaches with Lower, Middle, Upper, Side Lower, Side Upper).
   - Real-time seat statuses: `AVAILABLE`, `SELECTED`, `TEMPORARILY_LOCKED` (10-min TTL), `BOOKED`, and `CANCELLED/RE-POOLED`.
   - Visual conflict indicators when another concurrent user holds a contested berth.
4. **Checkout, Fare Engine & Payment Processing**:
   - Itemized fare computation: Base Distance Fare + Reservation Charge + Superfast Surcharge + Tatkal Multiplier + GST (5%).
   - Integrated payment options with prominent UPI AutoPay, NetBanking, and credit/debit gateways.
5. **PNR Generation & Digital Boarding Pass**:
   - Generation of unique 10-digit cryptographic PNR references.
   - Airline-grade boarding pass featuring high-contrast gate QR/barcodes, coach position diagrams, and meal/amenity receipts.
   - Live AI confirmation probability scores for waitlisted tickets.
6. **Cancellation & Soft-Refund Management**:
   - Self-service cancellation workflow per passenger or entire booking.
   - Transparent calculation of cancellation charges and net refundable amounts.
   - Instant soft cancellation: updates passenger/booking status, releases the segment berth back to the pool, and triggers automated UPI refunds.

#### 3.2 Operations & Administrative Suite
1. **Train, Rake & Coach Management**:
   - Full CRUD over trains, coach composition types, berth numbering, and active service schedules.
2. **Station & Preserved Route Sequencing**:
   - Ordered route definition with stop sequence numbering, intermediate distances, arrival/departure timetables, and platform assignments.
3. **Dynamic Tariff & Fare Rules Engine**:
   - Granular base rate per km adjustments, surcharge toggles, and Tatkal surge multipliers with instantaneous network broadcast.
4. **Real-Time Data Integrity & Concurrency Telemetry**:
   - Live monitoring of active database sessions, Redis distributed locks, WAL replication lag (< 14ms), and double-booking collision counts (guaranteed 0).
5. **Soft-Delete & Refund Audit Log**:
   - Immutable audit trail recording ticket cancellations, TDR filings, and automated payment gateway reconciliations.

---

### 4. Technical & Database Architecture

#### 4.1 Relational Data Model (3NF Normalization)
RailFlow operates on 12 core relational entities enforcing strict referential integrity and foreign keys:
- `users`: Authentication, personal data, and role assignments (`USER`, `ADMIN`, `TTE`).
- `stations`: Unique station codes (`NDLS`, `HWH`, `NJP`), zones, divisions, coordinates.
- `trains`: Train numbers, types, origin/destination terminals, running days, rake configuration.
- `routes` & `route_stations`: Preserved ordered stop sequence (`stop_sequence`), distances, and platform designations.
- `coaches` & `seats`: Physical coach hierarchy and berth classifications (`LOWER`, `MIDDLE`, `UPPER`, `SIDE_LOWER`, etc.).
- `fares`: Distance-based pricing matrices per train type and coach class.
- `schedules`: Specific operating runs tied to dates and route configurations.
- `seat_inventory`: The atomic inventory unit tracking segmental availability (`from_route_sequence` to `to_route_sequence`), lock states, TTL timestamps, and optimistic locking versions.
- `bookings`: Master reservation ledger holding PNRs, aggregate fares, booking statuses (`PENDING`, `CONFIRMED`, `CANCELLED`, `FAILED`), and timestamps.
- `passengers`: Granular passenger manifests linked to bookings with specific berth allocations and current statuses (`CNF`, `RAC`, `WL`, `CAN`).
- `transactions`: Payment ledger recording gateway references, amounts, and statuses (`SUCCESS`, `PENDING`, `REVERSED`).
- `cancellations`: Soft-cancellation records tracking refund amounts, cancellation fees, and refund transaction references.

#### 4.2 Duplicate Seat Prevention & Concurrency Protocol
To solve the concurrent booking collision challenge (e.g., during high-traffic 10:00 AM Tatkal windows), RailFlow employs a **two-phase segment locking mechanism**:
1. **Distributed Row Mutex (`SELECT ... FOR UPDATE NOWAIT`)**:
   - Queries `seat_inventory` for the train schedule and the exact overlapping journey stations (`from_route_sequence < :toSeq AND to_route_sequence > :fromSeq`).
   - If available, acquires an immediate lock and stamps the row with `current_status = 'LOCKED'`, `locked_by_user_id`, and a 10-minute expiration timestamp (`CURRENT_TIMESTAMP + INTERVAL '10 MINUTE'`).
2. **Atomic Confirmation or Timeout Release**:
   - Upon successful payment verification, the inventory status commits to `'BOOKED'`.
   - In case of payment dropoff or TTL expiry, an automated background reaper or trigger restores the berth state to `'AVAILABLE'`.
   - Fractional segment booking logic ensures that a passenger booking A ➔ B leaves the seat open for reservation between B ➔ C on the identical train run.

---

### 5. UI/UX & Design Language Principles

- **Visual Theme**: "RailFlow — Intelligent Indian Railway Experience"
- **Design Tokens & Palette**:
  - *Light Mode*: Sovereign Blue (`#1E3A8A`), Royal Blue (`#2563EB`), Saffron Amber (`#F59E0B`), Crisp Emerald (`#10B981`), Canvas Slate (`#F6F8FC`).
  - *Dark Mode*: Deep Obsidian Navy (`#080D1D` to `#0B1020`), Electric Cyan (`#38BDF8`), Emerald Glow (`#10B981`), Translucent Glass (`rgba(17, 24, 39, 0.75)`).
- **Glassmorphism Guardrails**:
  - Layered frosted glass with `backdrop-filter: blur(20px)` and subtle `1px` translucent borders.
  - Glass is restricted to floating navigation bars, search consoles, modal cards, and tickets to safeguard WCAG AAA readability.
- **Micro-Interactions & Motion**:
  - Material 3 Expressive spring physics on station swap buttons (180° rotation), berth selection elevation, and smooth progress transitions.
  - Interactive status chips with pulse effects on live tracking nodes.

---

### 6. Non-Functional Requirements & Security
1. **Punctuality & Latency**: PRS booking queries respond in under 50ms; ticket generation occurs in < 500ms.
2. **High Concurrency & Scalability**: Designed to sustain 500,000+ simultaneous booking attempts during peak Tatkal release cycles with zero double allocations.
3. **Security & Cryptography**:
   - SHA-256 password hashing and role-based JWT bearer sessions.
   - Cryptographically signed PNR barcodes and encrypted payment gateway webhooks.
   - PII masking on passenger manifest printouts.
4. **Resilience & Fault Tolerance**:
   - Soft-delete paradigms for cancellations; no physical row deletion of historical transaction ledgers.
   - Replicated PostgreSQL write-ahead logging (WAL) with sub-second failover.

---

### 7. Release Milestones & Implementation Roadmap

- **Phase 1: Core Relational Database & Inventory Engine (Completed)**
  - 3NF Normalized schema deployment, distributed row locking functions, segment availability calculators.
- **Phase 2: Booking Portal & Live Visual Berth Matrix (Completed)**
  - Flagship booking search, interactive coach seat allocation, digital boarding pass generation, Light and Dark mode systems.
- **Phase 3: Central Operations Console & Refund Automations (Completed)**
  - Admin train/route sequencing CRUD, dynamic fare tariff management, cancellation and soft-refund audit telemetry.
- **Phase 4: Field Mobility & TTE Native Scanner (Next Milestone)**
  - Offline-first Android tablet app for on-train ticket validation and automated vacant berth reallocation.
