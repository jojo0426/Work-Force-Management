-- Phase 2: NAP GPS DB, Transfer, Mismatch, Smart Next indexes
ALTER TABLE naps ADD COLUMN IF NOT EXISTS verified_location GEOGRAPHY(Point, 4326);
ALTER TABLE naps ADD COLUMN IF NOT EXISTS verification_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS verified_location GEOGRAPHY(Point, 4326);
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS old_location GEOGRAPHY(Point, 4326);
CREATE TABLE IF NOT EXISTS transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID REFERENCES work_orders(id) NOT NULL,
  old_nap_id UUID, old_port INT, old_lat FLOAT, old_lng FLOAT,
  removal_evidence TEXT[] DEFAULT '{}',
  new_nap_id UUID, new_port INT, new_lat FLOAT, new_lng FLOAT,
  install_evidence TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_work_orders_status_type ON work_orders(status, type);
ALTER TABLE mismatches ADD COLUMN IF NOT EXISTS reviewed_notes TEXT;
ALTER TABLE mismatches ADD COLUMN IF NOT EXISTS evidence_photo_url TEXT;
