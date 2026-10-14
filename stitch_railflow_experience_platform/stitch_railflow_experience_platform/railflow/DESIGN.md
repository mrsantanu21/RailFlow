---
name: RailFlow
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#444651'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#757682'
  outline-variant: '#c5c5d3'
  surface-tint: '#4059aa'
  primary: '#00236f'
  on-primary: '#ffffff'
  primary-container: '#1e3a8a'
  on-primary-container: '#90a8ff'
  inverse-primary: '#b6c4ff'
  secondary: '#855300'
  on-secondary: '#ffffff'
  secondary-container: '#fea619'
  on-secondary-container: '#684000'
  tertiary: '#00311f'
  on-tertiary: '#ffffff'
  tertiary-container: '#004a31'
  on-tertiary-container: '#27c38a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b6c4ff'
  on-primary-fixed: '#00164e'
  on-primary-fixed-variant: '#264191'
  secondary-fixed: '#ffddb8'
  secondary-fixed-dim: '#ffb95f'
  on-secondary-fixed: '#2a1700'
  on-secondary-fixed-variant: '#653e00'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 3.5rem
    fontWeight: '800'
    lineHeight: 4rem
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 2.25rem
    fontWeight: '800'
    lineHeight: 2.75rem
    letterSpacing: -0.02em
  display-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 2.5rem
    fontWeight: '700'
    lineHeight: 3rem
    letterSpacing: -0.02em
  display-md-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.75rem
    fontWeight: '700'
    lineHeight: 2.25rem
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 2rem
    fontWeight: '700'
    lineHeight: 2.5rem
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: '400'
    lineHeight: 1.75rem
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.5rem
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.25rem
    letterSpacing: 0em
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 0.875rem
    fontWeight: '600'
    lineHeight: 1.25rem
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 0.75rem
    fontWeight: '600'
    lineHeight: 1rem
    letterSpacing: 0.03em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 0.6875rem
    fontWeight: '700'
    lineHeight: 0.875rem
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes an authoritative yet exceptionally modern transit experience for Indian railway travel. It unites the structural stability and mass-scale legibility of national transport utilities with the fluid speed, high fidelity, and tactile polish of contemporary fintech and international airline booking platforms.

### Personality & Demeanor
- **Sovereign Trust & Precision:** Grounded in deep railway navy to command immediate institutional credibility and dependability under high-frequency booking stress.
- **Dynamic Optimism:** Accented with vivid saffron-amber and clear emerald indicators that transform stressful availability states into unambiguous, decisive actions.
- **Atmospheric Clarity:** Employs light frosted surfaces, high-contrast typography, and spring-loaded micro-feedback to make complex itineraries, RAC/WL states, and multi-leg journeys feel lightweight.

### Visual Style
A hybrid of **Corporate / Modern (Material 3 Expressive)** and **Subtle Glassmorphism**. The interface relies on clean, high-contrast surfaces framed by subtle translucent borders and calm background gradients, elevating everyday train ticketing into an effortless, first-class journey interface.

## Colors

The palette balances institutional integrity with instant semantic feedback. Color serves strict operational and navigational roles across ticketing and transit tracking.

### Core Roles
- **Primary (`#1E3A8A`):** Deep Indian Railway Navy. Used for primary interactive triggers, active navigation markers, dominant header blocks, and authoritative identity accents.
- **Secondary (`#F59E0B`):** Warm Saffron / Amber. Reserved for Tatkal alerts, waitlist indicators (WL/RAC), urgent departure counts, attention callouts, and critical journey milestones.
- **Tertiary (`#10B981`):** Emerald Green. Signals confirmed reservations (CNF), open seat inventory, successful transaction confirmations, and on-time train statuses.
- **Info Accent (`#06B6D4`):** Electric Cyan. Dedicated to live GPS train running status, platform transfer instructions, coach layouts, and technical travel notes.
- **Neutral (`#64748B`):** Slate. Powers structural borders, muted secondary metadata, station transit codes, and subtle grid dividers.

### Canvas & Surface Architecture
- **Light Mode Canvas:** `#F6F8FC` provides a clean, atmospheric, low-strain backdrop.
- **Surface Containers:** Pristine white (`#FFFFFF`) with variable alpha layers for frosted surfaces (`rgba(255, 255, 255, 0.75)` to `rgba(255, 255, 255, 0.92)`).
- **Text & Contrast:** Primary text rests on `#0F172A`, secondary metadata on `#475569`, and disabled states on `#94A3B8`.

## Typography

The typographic hierarchy distinguishes brand impact and schedule structure from data-dense operational reading.

### Font Roles
- **Headlines & Display (`Plus Jakarta Sans`):** Delivers a welcoming, geometric, and modern visual character. Utilized for station codes (e.g., `NDLS`, `CSMT`), train names, fare totals, hero reservation hooks, and pill badges.
- **Body & Numerical Readouts (`Inter`):** Selected for uncompromised tabular clarity, dense timetable charts, PNR digits, seat coach numbers, and legal travel disclosures. Ensures clear distinction between `1`, `l`, `I`, `0`, and `O`.
- **Labels (`Plus Jakarta Sans`):** Ensures high-visibility legibility at micro scales across berth categories (`1A`, `2A`, `3A`, `SL`, `CC`) and operational status badges.

## Layout & Spacing

The layout model adapts across phone screens, tablets, and desktop workstations to preserve rapid itinerary scanning and booking throughput.

### Grid & Breakpoints
- **Mobile (< 640px):** 4-column fluid layout with `1rem` outer canvas margin and `1rem` gutters. Primary journey flow sticks to single-column card stacks with a persistent floating bottom booking dock.
- **Tablet (640px – 1024px):** 8-column layout with `1.5rem` margins and gutters. Search filters and live train schedules transition into responsive dual-column arrangements.
- **Desktop (> 1024px):** 12-column layout max-width constrained to `1280px` centered, utilizing `2rem` margins and `1.5rem` gutters. Left rail (4 columns) hosts route search filters, class preferences, and quota toggles; right area (8 columns) displays train availability cards, fare comparisons, and coach matrices.

### Spacing Rhythm
Built upon a strict 4px/8px incremental cadence. Gaps between related timeline nodes use `space-sm` (8px), card interior padding uses `space-md` (16px) or `space-lg` (24px), and major module groupings maintain `space-xl` (40px) separation.

## Elevation & Depth

Visual hierarchy combines stacked Material 3 tonal surfaces with subtle translucent glass layers, avoiding heavy opaque drop shadows.

### Elevation Levels
- **Level 0 (Flat Canvas):** `#F6F8FC` baseline ground. No shadows.
- **Level 1 (Resting Cards & Timetable Rows):** Pure `#FFFFFF` surface bordered by `1px solid rgba(226, 232, 240, 0.8)`. Soft ambient glow: `0px 2px 8px -2px rgba(15, 23, 42, 0.04), 0px 1px 3px -1px rgba(15, 23, 42, 0.03)`.
- **Level 2 (Hovered Cards & Interactive Filters):** Elevated `#FFFFFF` surface. Shadow expands: `0px 8px 24px -4px rgba(30, 58, 138, 0.08), 0px 2px 6px -2px rgba(15, 23, 42, 0.04)`.
- **Level 3 (Floating Docks & Sticky Action Bars):** Translucent white surface (`rgba(255, 255, 255, 0.85)`) backed by `backdrop-filter: blur(16px)` and framed by `1px solid rgba(255, 255, 255, 0.6)`. Shadow: `0px 12px 32px -6px rgba(15, 23, 42, 0.12)`.
- **Level 4 (Modals, Coach Selectors & PNR Drawers):** `#FFFFFF` modal container elevated over an ultra-subtle backdrop tint (`rgba(15, 23, 42, 0.4)` with `backdrop-filter: blur(8px)`). Shadow: `0px 24px 48px -12px rgba(15, 23, 42, 0.18)`.

## Shapes

The design system uses a roundedness level of `2`, creating balanced geometric structures with friendly, approachable corners that avoid sterile utility aesthetics.

### Corner Radius Mapping
- **Default Radius (`rounded-md` - 0.5rem / 8px):** Applied to form inputs, quota pickers, seat grid tiles, dropdown items, and secondary alert banners.
- **Large Radius (`rounded-lg` - 1rem / 16px):** Standard for train search result cards, ticket summaries, itinerary schedule modules, and dialog overlays.
- **Extra Large Radius (`rounded-xl` - 1.5rem / 24px):** Reserved for hero search input clusters, floating station swapping widgets, and primary booking sheets.
- **Full Radius (`rounded-full`):** Applied exclusively to status indicator badges (e.g., `WL 12`, `AVAILABLE - 42`, `TATKAL`), primary pill CTA buttons, station swap toggle buttons, and breadcrumb tags.

## Components

### Buttons
- **Primary Action (Book / Confirm / Pay):** Deep Indian Railway Navy background (`#1E3A8A`), text white, `rounded-full` or `rounded-lg` (depending on container context), `0.75rem 1.5rem` padding, font `Plus Jakarta Sans` 600 weight. Features a subtle inward top glow (`inset 0 1px 0 rgba(255,255,255,0.2)`). Spring transition on active press (`scale(0.98)`).
- **Secondary (Class Selection / Quota Picker):** Tonal surface with slate border (`1px solid #E2E8F0`), `#1E3A8A` text. On selection, fills with `#1E3A8A` and flips text to white.
- **Tertiary / Ghost:** Borderless, slate-tinted interactive states with soft background fades (`rgba(30, 58, 138, 0.06)`).

### Chips & Pill Badges
- **Status Badges:** Fully rounded (`rounded-full`) pill containers with uppercase `label-md` typography.
  - *Confirmed / Available:* Soft emerald background (`#ECFDF5`), emerald text (`#047857`), emerald border (`rgba(16, 185, 129, 0.2)`).
  - *Waitlist / RAC:* Soft amber background (`#FFFBEB`), amber text (`#B45309`), amber border (`rgba(245, 158, 11, 0.2)`).
  - *Tatkal / Live Updates:* Soft cyan background (`#ECFEFF`), cyan text (`#0E7490`), cyan border (`rgba(6, 182, 212, 0.2)`).

### Train Journey Cards
- **Structure:** Level 1 cards with a prominent top bar showing train name, 5-digit number, running days, and on-time reliability score.
- **Departure/Arrival Nodes:** Station code rendered in bold `headline-md` (`Plus Jakarta Sans`), time in `headline-lg`, and full station name in `body-sm`.
- **Connector Timeline:** Visual train line connecting origin and destination with intermediate stop pills, duration callout (`05h 45m`), and live delay alerts.
- **Berth Grid:** Horizontal strip of class cards (e.g., `1A`, `2A`, `3A`, `SL`) displaying live availability and pricing with instant selectability.

### Input Fields
- **Search & Station Selectors:** Floating labels with uppercase typography, left-aligned station search icon, and auto-suggested recent stations. Field background is pure white or subtle frost (`rgba(255, 255, 255, 0.8)`), border is `#CBD5E1`.
- **Focus State:** Border shifts directly to `#1E3A8A` with a clean `0 0 0 3px rgba(30, 58, 138, 0.15)` ring. Station swap button animates with a 180-degree spring spin.

### Checkboxes & Radio Selectors
- **Form Controls:** Custom square (rounded-md) for checkboxes and circles for radios with a minimum tap target of `44x44px`. Active selection fills `#1E3A8A` with a crisp white glyph check or radio center.

### Railway Timetable & Live Route Tracker
- **Vertical Station Stepper:** Vertical connecting path using `#E2E8F0`. Completed stations turn `#10B981`, current station pulses `#06B6D4`, and upcoming stations remain `#94A3B8`. Platform numbers, expected arrival times, and actual delay deltas appear inline in tabular font.