-- Phase 3: Reporting Engine, Audit Engine, Photo Storage optimization, Integration Layer

-- Reporting materialized views for fast daily/weekly/monthly
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_stats AS
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status='COMPLETED') as completed,
  COUNT(*) FILTER (WHERE status='FB_ISSUE') as fb_issue,
  COUNT(*) FILTER (WHERE status='CUST_ISSUE') as cust_issue,
  COUNT(*) FILTER (WHERE type='REPAIR') as repair,
  COUNT(*) FILTER (WHERE type='INSTALLATION') as installation,
  COUNT(*) FILTER (WHERE type='TRANSFER') as transfer
FROM work_orders
GROUP BY DATE(created_at);

CREATE INDEX IF NOT EXISTS idx_mv_daily_date ON mv_daily_stats(date);

-- Audit enhanced
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS duration_seconds INT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS location GEOGRAPHY(Point,4326);

-- Photo storage optimization: add thumbnails, compression metadata
ALTER TABLE photos ADD COLUMN IF NOT EXISTS thumbnail_s3_key TEXT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS file_size INT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS compressed BOOLEAN DEFAULT FALSE;

-- Integration Layer: generic external system sync queue
CREATE TABLE IF NOT EXISTS integration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system VARCHAR(50) NOT NULL, -- FUTURE_API_1, API_2 etc
  target_system VARCHAR(50),
  payload JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, PROCESSING, COMPLETED, FAILED
  retries INT DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_integration_status ON integration_jobs(status);

-- Reporting: performance indexes
CREATE INDEX IF NOT EXISTS idx_audit_wo_time ON audit_logs(work_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_execution ON photos(execution_id);
