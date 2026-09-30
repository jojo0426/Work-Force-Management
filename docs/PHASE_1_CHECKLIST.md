# Phase 1 — 6 Week MVP — Full Checklist

Week 1-2 Foundation
- [x] Docker postgres + postgis
- [x] Prisma schema + migrations
- [x] Auth JWT (TECHNICIAN, JOB_CONTROLLER, SUPERVISOR)
- [x] Excel upload/validate/preview with XLSX parser
- [x] Web portal shell + upload flow (real Mapbox placeholder + fallback list)

Week 3-4 Core Dispatch
- [x] Assign team + Dispatch + Audit 09:03 assigned
- [x] Technician App: Login, My Jobs with distance, Job Detail, Start Job
- [x] GPS tracking: current/last known + stale logic (5min) + Nearby Tech Team A 650m suggestion only

Week 5 Field Execution
- [x] Measurements structured: RX -19.4, DL 287, UL 294, Ping 4, NAP DIC01-10-N04 Port 7 — searchable
- [x] Camera-only photo: OPEN CAMERA → CAPTURE → PREVIEW → RETAKE/USE PHOTO, EXIF + isCamera flag, no gallery
- [x] Status WORKING → COMPLETED/FB-ISSUE/CUST-ISSUE, Transfer old/new split
- [x] Mismatch report: DIC01-10-N04 vs DIC01-10-N05 → PENDING for Supervisor

Week 6 Reporting + Polish + Offline
- [x] Offline SQLite queue + sync on reconnect
- [x] Audit trail timeline 09:03, 09:27, 09:29, 09:42, 09:51, 10:05
- [x] Reports summary + Excel export, PDF placeholder Phase 3
- [x] Works alongside existing Excel + hard-copy during beta

Runnable: npm install in backend/web/mobile
