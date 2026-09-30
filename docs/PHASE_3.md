# Phase 3 — Reporting System, Audit Trail, Photo Optimization, Integration Layer

Implements blueprint sections 12-18.

## 12. Photo Evidence
- Wording changed from Add Evidence to UPLOAD PHOTO
- Field evidence camera-only: UPLOAD PHOTO -> OPEN CAMERA -> CAPTURE -> PREVIEW -> RETAKE / USE PHOTO
- No gallery upload for required field evidence
- Phase 3 optimization: thumbnail generation via Sharp, compression, S3 lifecycle (30d standard, 90d IA, 1y Glacier), file_size tracking

## 13. Required Evidence per Type
- Repair: modem/ONT, NAP work, fiber repair, signal measurement, after-repair, speed-test result for slow browsing
- Installation: installed modem/ONT, cable routing, NAP connection, signal level, subscriber premises, completed installation
- Transfer: both old and new locations
- FB-ISSUE/CUST-ISSUE: photos supporting why not completed
- During beta: signed hard-copy WO can be photographed as part of evidence
- API: getRequiredEvidence(type) returns matrix + cameraOnly=true

## 14. Structured Technical Measurements
- Where possible, technical values shouldn't exist only inside photographs
- RX Power -19.4 dBm, Download 287 Mbps, Upload 294 Mbps, Ping 4 ms, NAP DIC01-10-N04, Port 7
- Searchable for analytics later
- Implemented in job_executions table + measurements endpoint

## 15. Offline Operation
- Important for technicians
- TECHNICIAN APP -> Local Cache (Assigned WO, Findings, Measurements, Photos, Status Updates) -> INTERNET RETURNS -> SYNC API
- Technician shouldn't lose field report because mobile data disappears
- Phase 3 enhanced: queue with retry + conflict resolution, SQLite offline_queue

## 16. Reporting System
- Job Controller and Supervisor web portal provides Daily -> Weekly -> Monthly -> Custom Date Range
- Includes WO received, assigned, completed, pending, FB-Issue, CUST-Issue, performance, counts, locations, completion times
- Output: On-screen Dashboard, Excel, PDF, Print
- Implemented: summary by range, Excel export with 3 sheets (Summary, WorkOrders, AuditTrail), PDF data endpoint
- Materialized view mv_daily_stats for fast queries

## 17. Audit Trail
- Important activities should have history
- 09:03 WO assigned by Controller, 09:27 started, 09:29 GPS recorded, 09:42 photo captured, 09:51 measurement entered, 10:05 completed
- Changes to verified info should identify who changed it, when, why
- API: GET /audit/:workOrderId returns timeline
- Phase 3: enriched with duration_seconds, location, actor identification

## 18. Future API Architecture
- Requested to prepare WFM for multiple API integrations
- Should not tightly connect technician app directly to every external system
- Architecture: Technician App + Web Portal -> WFM API -> Integration Layer -> API1, API2, API3, API4, Future API
- Gives flexibility to connect other FiberBlaze/Meridian systems later without rebuilding technician app
- Implemented: integration_jobs table, IntegrationService with queue, architecture endpoint
- Prepared APIs: Billing/Subscriber, Network Inventory/NAP Management, CRM, Notification/SMS, Future (digital signatures, analytics, route optimization)

## Database Phase 3
- 003_phase3_reporting_audit.sql: mv_daily_stats, audit enhanced, photo thumbnails, integration_jobs, indexes

## Backend Phase 3
- ReportsPhase3Service: getSummary(range), exportExcel, exportPdfData
- AuditController: getAuditTrail, techAudit
- PhotoOptimizationService: optimizePhoto, getRequiredEvidence
- IntegrationService: queueIntegrationJob, processPendingJobs, getIntegrationArchitecture

## Web Portal Phase 3
- Main tab now REPORTS with daily/weekly/monthly/custom selector
- Dashboard cards: Total, Completed, FB-Issue, CUST-Issue, Assigned, Working, Repair, Installation
- Export Excel/PDF buttons
- Click WO -> Audit Trail timeline
- Tabs: REPORTS, AUDIT TRAIL, DISPATCH, NEARBY TECH, MISMATCH, TRANSFER, INTEGRATION LAYER
- Integration Layer architecture diagram

## Mobile Phase 3
- Offline queue enhanced with retry
- Photo evidence with required matrix per WO type
- Audit trail local logging

## Next Phase 4
- Digital customer signatures
- Deeper API integrations (Billing, NAP Management, CRM, SMS)
- Advanced route optimization
- Richer analytics
- Automated cross-system workflows
- Network-facility intelligence
- Additional management dashboards

## Final WFM Structure (from blueprint)
FIBERBLAZE WFM
- TECHNICIAN MOBILE APP
- MANAGEMENT WEB (JOB CONTROLLER, SUPERVISOR)
- CENTRAL WFM API
- DATABASE, PHOTO/MEDIA, GPS/MAP
- AUDIT ENGINE
- REPORTING ENGINE
- INTEGRATION LAYER -> FUTURE MULTIPLE APIs
