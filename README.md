# FiberBlaze WFM — Phase 1 Full (Runnable)

**Status:** MVP 6-week build — RUNNABLE with npm install
**Repo:** jojo0426/Work-Force-Management

## What's Real in This Build (not skeleton)
- **Backend:** NestJS + Prisma + PostGIS + XLSX parser + S3 presigned upload + JWT auth + Socket.IO GPS + Audit
- **Mobile:** Expo SDK 50 + expo-camera (camera-only enforcement), expo-location (foreground + background tracking), SQLite offline queue, MMKV
- **Web:** Next.js 14 + Mapbox GL + Tailwind + Excel drag-drop + Validate → Preview → Assign → Dispatch flow + Nearby Tech

## Architecture
WEB PORTAL (Job Controller/Supervisor) + TECHNICIAN APP → CENTRAL WFM API → DATABASE/PHOTO/GPS/AUDIT/REPORTS → INTEGRATION LAYER

## Quick Start

### 1. Database (Postgres + PostGIS)
```bash
docker-compose up -d postgres
# or use Supabase/Neon with PostGIS extension
```

### 2. Backend API
```bash
cd backend
npm install
cp .env.example .env
# Edit DATABASE_URL, JWT_SECRET
npx prisma migrate dev --name phase1_init
npx prisma generate
npm run start:dev
# API at http://localhost:4000/api/v1
# Swagger at http://localhost:4000/docs (if enabled)
```

### 3. Web Portal
```bash
cd web
npm install
cp .env.local.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
# Set NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token
npm run dev # http://localhost:3000
```

### 4. Mobile (Technician App)
```bash
cd mobile
npm install
cp .env.example .env
# Set EXPO_PUBLIC_API_URL=http://YOUR_IP:4000/api/v1
npx expo start
# Scan QR with Expo Go
```

## Key Flows Implemented

### Dispatch (Excel → Technician)
1. Job Controller drags Excel file in web portal
2. Backend parses with XLSX: columns WO Number, Type, Subscriber, Address, NAP, Port, Remarks
3. Validate: NAP exists?, duplicate WO?, GPS missing?
4. Preview table shows 20 rows + errors
5. Assign Team → status ASSIGNED, audit 09:03 assigned, push notification (Socket.IO)
6. Technician sees in My Jobs

### Field Execution
- ASSIGNED → Start Job → WORKING (audit 09:27 started, 09:29 GPS recorded)
- Enter measurements: RX -19.4 dBm, Download 287 Mbps, Upload 294, Ping 4, NAP DIC01-10-N04 Port 7
- UPLOAD PHOTO: Camera-only — OPEN CAMERA → CAPTURE → PREVIEW → RETAKE/USE PHOTO — EXIF check, no gallery
- Evidence matrix per WO type (repair/install/transfer/FB-ISSUE/CUST-ISSUE)
- COMPLETED / FB-ISSUE / CUST-ISSUE → Smart Next suggestion: WO-1001 450m

### GPS & Nearby
- Mobile sends location every 15s when logged in + permission granted
- Web map shows: Online 🟢, Working 🟡, Available 🔵, Offline ⚫, Stale (last known + timestamp)
- Nearby Tech: Find technicians within radius, Team A 650m, B 1.4km, C 3.2km — suggestion only, no auto-reassign
- If stale >5min, is_stale=true, don't pretend exact location

### Mismatch Protection
- Tech reports NAP mismatch: DB DIC01-10-N04 vs found DIC01-10-N05
- Creates mismatch PENDING, Supervisor reviews → Approve/Reject, never overwrites verified directly

### Offline
- Mobile SQLite: assigned WOs, findings, measurements, photos, status updates
- Queue + sync on reconnect — technician never loses field report

## Env Vars
See .env.example in each package.

## Phase 1 Complete Checklist
- [x] Auth + Roles
- [x] Excel upload/validate/preview
- [x] Assign/Dispatch
- [x] Technician: My Jobs, Job Detail, Start, Measurements, Camera-only photos, Complete/Issue
- [x] GPS tracking + stale logic + Nearby
- [x] Offline cache + sync
- [x] Audit trail + Basic reports (Excel/PDF)
- [x] Transfer Old/New split

## Next (Phase 2)
Nearby Tech UI improvements, Smart Next algorithm, GPS DB verification, Mismatch queue, Transfer flow polish.

---
Built for FiberBlaze — Dasmariñas, PH
