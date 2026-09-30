# Phase 2 — Nearby Tech, Smart Next, GPS DB, Mismatch, Transfer

Implements 5 key features from blueprint sections 7-11.

## Features
1. Nearby Technician: Additional Repair -> Subscriber Location -> Find Nearby -> Team A 650m etc -> Assign (manual, no auto-rearrange)
2. Smart Next: CURRENT -> COMPLETED -> check remaining -> nearest subscriber -> suggestion only
3. Subscriber & NAP GPS DB: reuse verified coords, capture if missing
4. Mismatch Protection: DB DIC01-10-N04 vs Reported DIC01-10-N05 -> REPORT -> Supervisor Review -> Approve/Reject (never overwrite verified directly)
5. Transfer: Old (GPS, NAP, Port, Removal Evidence) -> TRANSFER -> New (GPS, NAP, Port, Install Data, Completion Evidence) — history preserved

## API New Endpoints
GET /work-orders/nearby?lat=&lng=&radius=
GET /work-orders/smart-next?technicianId=&lat=&lng=
GET /work-orders/nap/:code/location
POST /work-orders/transfer
GET /work-orders/mismatches/pending
POST /work-orders/mismatches/:id/review

## DB
002_phase2_features.sql — transfers table, verified_location, indexes GIST for PostGIS, mismatch enhanced

## Web Portal
Tabs: DISPATCH, NEARBY TECH, SMART NEXT, MISMATCH REVIEW, TRANSFER — all functional

## Mobile
Added SMART NEXT and MISMATCH report buttons, transfer photo handling

## Next Phase 3
Reporting Engine, Audit Engine, Photo Storage optimization, Integration Layer prep
