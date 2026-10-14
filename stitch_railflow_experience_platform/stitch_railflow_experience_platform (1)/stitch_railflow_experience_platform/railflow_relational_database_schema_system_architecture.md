# RailFlow — Enterprise Database-Driven Railway Reservation System
## Academic & Architectural Specification

### 1. Relational Database Schema Architecture (3NF Normalization)

```sql
-- 1. USERS & ROLES
CREATE TABLE users (
    user_id VARCHAR(36) PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN', 'TTE')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. STATIONS
CREATE TABLE stations (
    station_id VARCHAR(36) PRIMARY KEY,
    station_code VARCHAR(10) UNIQUE NOT NULL,
    station_name VARCHAR(100) NOT NULL,
    city VARCHAR(80) NOT NULL,
    state VARCHAR(80) NOT NULL,
    division VARCHAR(50),
    zone VARCHAR(10),
    is_active BOOLEAN DEFAULT TRUE
);

-- 3. TRAINS
CREATE TABLE trains (
    train_id VARCHAR(36) PRIMARY KEY,
    train_number VARCHAR(10) UNIQUE NOT NULL,
    train_name VARCHAR(120) NOT NULL,
    train_type VARCHAR(40) NOT NULL CHECK (train_type IN ('VANDE_BHARAT', 'RAJDHANI', 'SHATABDI', 'SUPERFAST', 'MAIL_EXPRESS')),
    source_station_id VARCHAR(36) REFERENCES stations(station_id),
    destination_station_id VARCHAR(36) REFERENCES stations(station_id),
    running_days VARCHAR(50) NOT NULL DEFAULT 'DAILY', -- e.g., 'MON,TUE,WED,THU,FRI,SAT,SUN'
    total_coaches INT NOT NULL DEFAULT 16,
    is_active BOOLEAN DEFAULT TRUE
);

-- 4. ROUTES & ROUTE STATIONS (Preserved Sequence)
CREATE TABLE routes (
    route_id VARCHAR(36) PRIMARY KEY,
    route_name VARCHAR(120) NOT NULL,
    origin_station_id VARCHAR(36) REFERENCES stations(station_id),
    destination_station_id VARCHAR(36) REFERENCES stations(station_id),
    total_distance_km DECIMAL(8,2) NOT NULL
);

CREATE TABLE route_stations (
    route_station_id VARCHAR(36) PRIMARY KEY,
    route_id VARCHAR(36) REFERENCES routes(route_id) ON DELETE CASCADE,
    station_id VARCHAR(36) REFERENCES stations(station_id),
    stop_sequence INT NOT NULL,
    arrival_time TIME,
    departure_time TIME,
    distance_from_origin_km DECIMAL(8,2) NOT NULL,
    day_offset INT DEFAULT 0,
    platform_number INT,
    CONSTRAINT uq_route_sequence UNIQUE (route_id, stop_sequence),
    CONSTRAINT uq_route_station UNIQUE (route_id, station_id)
);

-- 5. COACHES & SEATS
CREATE TABLE coaches (
    coach_id VARCHAR(36) PRIMARY KEY,
    train_id VARCHAR(36) REFERENCES trains(train_id) ON DELETE CASCADE,
    coach_number VARCHAR(10) NOT NULL, -- e.g. 'B1', 'B2', 'A1', 'C1', 'S1'
    coach_class VARCHAR(10) NOT NULL CHECK (coach_class IN ('1A', '2A', '3A', '3E', 'CC', 'EC', 'SL')),
    total_berths INT NOT NULL,
    CONSTRAINT uq_train_coach UNIQUE (train_id, coach_number)
);

CREATE TABLE seats (
    seat_id VARCHAR(36) PRIMARY KEY,
    coach_id VARCHAR(36) REFERENCES coaches(coach_id) ON DELETE CASCADE,
    seat_number INT NOT NULL,
    berth_type VARCHAR(20) NOT NULL CHECK (berth_type IN ('LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER', 'WINDOW', 'AISLE')),
    cabin_number INT,
    CONSTRAINT uq_coach_seat UNIQUE (coach_id, seat_number)
);

-- 6. FARE RULES & PRICING
CREATE TABLE fares (
    fare_id VARCHAR(36) PRIMARY KEY,
    train_type VARCHAR(40) NOT NULL,
    coach_class VARCHAR(10) NOT NULL,
    base_rate_per_km DECIMAL(6,3) NOT NULL,
    min_distance_km INT NOT NULL DEFAULT 50,
    reservation_charge DECIMAL(6,2) NOT NULL DEFAULT 40.00,
    superfast_surcharge DECIMAL(6,2) NOT NULL DEFAULT 45.00,
    tatkal_multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.30,
    gst_percentage DECIMAL(4,2) NOT NULL DEFAULT 5.00,
    is_active BOOLEAN DEFAULT TRUE,
    CONSTRAINT uq_fare_rule UNIQUE (train_type, coach_class)
);

-- 7. SCHEDULES & OPERATING RUNS
CREATE TABLE schedules (
    schedule_id VARCHAR(36) PRIMARY KEY,
    train_id VARCHAR(36) REFERENCES trains(train_id),
    route_id VARCHAR(36) REFERENCES routes(route_id),
    operating_date DATE NOT NULL,
    departure_datetime TIMESTAMP NOT NULL,
    arrival_datetime TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'ON_SCHEDULE' CHECK (status IN ('ON_SCHEDULE', 'RESCHEDULED', 'CANCELLED', 'DIVERTED')),
    CONSTRAINT uq_train_date UNIQUE (train_id, operating_date)
);

-- 8. SEAT INVENTORY & CONCURRENCY LOCK ENGINE (DUPLICATE SEAT PREVENTION)
CREATE TABLE seat_inventory (
    inventory_id VARCHAR(36) PRIMARY KEY,
    schedule_id VARCHAR(36) REFERENCES schedules(schedule_id),
    seat_id VARCHAR(36) REFERENCES seats(seat_id),
    from_route_sequence INT NOT NULL,
    to_route_sequence INT NOT NULL,
    current_status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' 
        CHECK (current_status IN ('AVAILABLE', 'LOCKED', 'BOOKED', 'BLOCKED')),
    locked_by_user_id VARCHAR(36) REFERENCES users(user_id),
    locked_until TIMESTAMP NULL,
    active_booking_id VARCHAR(36),
    version INT NOT NULL DEFAULT 1, -- Optimistic locking counter
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_schedule_seat_segment UNIQUE (schedule_id, seat_id, from_route_sequence, to_route_sequence)
);

-- 9. BOOKINGS & PNR REGISTRY
CREATE TABLE bookings (
    booking_id VARCHAR(36) PRIMARY KEY,
    pnr_number VARCHAR(10) UNIQUE NOT NULL, -- 10-digit cryptographic PNR
    user_id VARCHAR(36) REFERENCES users(user_id),
    schedule_id VARCHAR(36) REFERENCES schedules(schedule_id),
    journey_date DATE NOT NULL,
    source_station_id VARCHAR(36) REFERENCES stations(station_id),
    destination_station_id VARCHAR(36) REFERENCES stations(station_id),
    coach_class VARCHAR(10) NOT NULL,
    passenger_count INT NOT NULL,
    base_fare DECIMAL(10,2) NOT NULL,
    reservation_charge DECIMAL(8,2) NOT NULL,
    superfast_charge DECIMAL(8,2) NOT NULL,
    tax_amount DECIMAL(8,2) NOT NULL,
    total_fare DECIMAL(10,2) NOT NULL,
    booking_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' 
        CHECK (booking_status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'PARTIALLY_CANCELLED', 'FAILED')),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' 
        CHECK (payment_status IN ('PENDING', 'PAID', 'REFUNDED', 'FAILED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. PASSENGERS
CREATE TABLE passengers (
    passenger_id VARCHAR(36) PRIMARY KEY,
    booking_id VARCHAR(36) REFERENCES bookings(booking_id) ON DELETE CASCADE,
    full_name VARCHAR(100) NOT NULL,
    age INT NOT NULL,
    gender VARCHAR(15) NOT NULL CHECK (gender IN ('MALE', 'FEMALE', 'TRANSGENDER')),
    berth_preference VARCHAR(20),
    allocated_seat_id VARCHAR(36) REFERENCES seats(seat_id),
    allocated_coach_number VARCHAR(10),
    allocated_berth_number INT,
    allocated_berth_type VARCHAR(20),
    current_status VARCHAR(20) NOT NULL DEFAULT 'CNF' CHECK (current_status IN ('CNF', 'RAC', 'WL', 'CAN')),
    id_card_type VARCHAR(30),
    id_card_number VARCHAR(50)
);

-- 11. TRANSACTIONS & PAYMENTS
CREATE TABLE transactions (
    transaction_id VARCHAR(36) PRIMARY KEY,
    booking_id VARCHAR(36) REFERENCES bookings(booking_id),
    pnr_number VARCHAR(10) NOT NULL,
    user_id VARCHAR(36) REFERENCES users(user_id),
    amount DECIMAL(10,2) NOT NULL,
    payment_gateway VARCHAR(30) NOT NULL DEFAULT 'UPI_AUTOPAY', -- 'UPI', 'NET_BANKING', 'CREDIT_CARD', 'IRCTC_WALLET'
    gateway_reference_no VARCHAR(100) UNIQUE NOT NULL,
    transaction_status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS' CHECK (transaction_status IN ('PENDING', 'SUCCESS', 'FAILED', 'REVERSED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. CANCELLATIONS & REFUNDS (Soft Cancellation Audit Trail)
CREATE TABLE cancellations (
    cancellation_id VARCHAR(36) PRIMARY KEY,
    booking_id VARCHAR(36) REFERENCES bookings(booking_id),
    pnr_number VARCHAR(10) NOT NULL,
    passenger_id VARCHAR(36) REFERENCES passengers(passenger_id),
    original_fare DECIMAL(10,2) NOT NULL,
    cancellation_charge DECIMAL(8,2) NOT NULL,
    refundable_amount DECIMAL(10,2) NOT NULL,
    cancellation_status VARCHAR(20) NOT NULL DEFAULT 'REFUND_PENDING' 
        CHECK (cancellation_status IN ('ELIGIBLE', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED')),
    refund_transaction_id VARCHAR(36) REFERENCES transactions(transaction_id),
    cancelled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Concurrency & Duplicate Seat Prevention Protocol

1. **Atomic Lock Acquisition via Distributed Row Lock**:
   ```sql
   BEGIN TRANSACTION;
   -- 1. Check availability & acquire row lock for the journey segment
   SELECT inventory_id, current_status, locked_until 
   FROM seat_inventory 
   WHERE schedule_id = :schedId 
     AND seat_id = :seatId 
     AND ((from_route_sequence < :toSeq AND to_route_sequence > :fromSeq))
     AND (current_status = 'AVAILABLE' OR (current_status = 'LOCKED' AND locked_until < CURRENT_TIMESTAMP))
   FOR UPDATE;

   -- 2. If valid row locked, mark as TEMPORARILY LOCKED for 10 minutes (TTL)
   UPDATE seat_inventory 
   SET current_status = 'LOCKED', 
       locked_by_user_id = :userId, 
       locked_until = CURRENT_TIMESTAMP + INTERVAL '10 MINUTE',
       version = version + 1
   WHERE inventory_id = :invId;
   COMMIT;
   ```
2. **Atomic Booking Confirmation**:
   - On successful transaction confirmation, `seat_inventory.current_status` updates to `'BOOKED'`.
   - On timeout or payment failure, worker/trigger releases lock back to `'AVAILABLE'`.
