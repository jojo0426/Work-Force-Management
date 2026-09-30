# FiberBlaze WFM API — Full Phase 1 Spec

Base: /api/v1

## Auth
POST /auth/login { email, password } → { token, user }
POST /auth/refresh

## Work Orders (Job Controller)
POST /work-orders/upload (multipart, field: file) — Excel parse with XLSX
  - Columns: WO Number, Type (REPAIR/INSTALLATION/TRANSFER), Subscriber, Address, NAP, Port, Remarks
  - Returns: { total, valid, invalid, preview: 50 rows, all }
POST /work-orders/confirm { workOrders: filtered valid, createdBy } — bulk create
GET /work-orders?status=ASSIGNED&Type=REPAIR
POST /work-orders/:id/assign { teamId }
POST /work-orders/:id/cancel (admin only)
GET /work-orders/nearby?lat=14.2995&lng=120.9580&radius=3000 → Team A 650m etc — suggestion only

## Field (Technician)
GET /my-assignments
POST /executions/:id/start { technicianId }
POST /executions/:id/measurements { rxPower, downloadMbps, uploadMbps, pingMs, napCodeReported, portReported, findings }
POST /executions/:id/photos (multipart, field: photo, isCamera=true, type, lat, lng) — camera-only
POST /executions/:id/complete { status: COMPLETED|FB_ISSUE|CUST_ISSUE, findings }
POST /mismatches/report { workOrderId, type: NAP|GPS|PORT, dbValue, reportedValue, reportedBy } → PENDING, no overwrite

## GPS
POST /gps/location/update { userId, lat, lng, status }
GET /gps/technicians/locations → with isStale flag (>5min)
WebSocket: location:update → technician:location broadcast

## Reports
GET /reports/summary?range=daily|weekly|monthly|custom&from=&to=
GET /reports/export?format=excel|pdf

## Evidence Matrix
- REPAIR: modem/ONT, NAP, fiber repair, signal, after-repair, speedtest result for slow browsing
- INSTALLATION: modem/ONT, cable routing, NAP connection, signal level, premises, completed
- TRANSFER: old (removal evidence) + new (installation evidence) — history preserved
- FB-ISSUE/CUST-ISSUE: photos supporting why not completed
- Beta: signed hard-copy WO photo allowed

## Status Flow
ASSIGNED → WORKING → COMPLETED | FB-ISSUE | CUST-ISSUE (CANCEL admin only)

## Offline
Mobile SQLite offline_queue → sync on reconnect
