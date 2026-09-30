-- Phase 4 Final: Digital Signatures, Route Optimization, Analytics, Workflows, Network Intelligence

-- Digital Signatures
CREATE TABLE IF NOT EXISTS customer_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID REFERENCES work_orders(id) NOT NULL,
  execution_id UUID REFERENCES job_executions(id),
  signature_data TEXT NOT NULL, -- base64
  signed_by_name VARCHAR(150),
  signed_by_contact VARCHAR(50),
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address VARCHAR(50),
  device_info JSONB,
  is_verified BOOLEAN DEFAULT FALSE
);

-- Route Optimization
CREATE TABLE IF NOT EXISTS optimized_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID REFERENCES users(id),
  team_id UUID REFERENCES teams(id),
  date DATE NOT NULL,
  route_order JSONB NOT NULL, -- [{woId, lat, lng, estimatedTime, distance}]
  total_distance_meters INT,
  total_duration_minutes INT,
  optimization_score FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS route_history (
  id BIGSERIAL PRIMARY KEY,
  technician_id UUID REFERENCES users(id),
  lat FLOAT NOT NULL,
  lng FLOAT NOT NULL,
  speed_kmh FLOAT,
  heading FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_route_history_tech_time ON route_history(technician_id, created_at DESC);

-- Advanced Analytics
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  metrics JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Automated Workflows
CREATE TABLE IF NOT EXISTS workflow_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  trigger_event VARCHAR(100) NOT NULL, -- WO_COMPLETED, FB_ISSUE, CUST_ISSUE, MISMATCH_REPORTED
  condition_json JSONB,
  action_type VARCHAR(50) NOT NULL, -- NOTIFY, ASSIGN, ESCALATE, INTEGRATE
  action_config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES workflow_rules(id),
  work_order_id UUID REFERENCES work_orders(id),
  status VARCHAR(20) DEFAULT 'PENDING',
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Network Facility Intelligence
CREATE TABLE IF NOT EXISTS nap_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nap_id UUID REFERENCES naps(id),
  nap_code VARCHAR(50) NOT NULL,
  health_score INT, -- 0-100
  port_utilization FLOAT, -- 0-1
  recent_issues_count INT DEFAULT 0,
  avg_rx_power FLOAT,
  last_checked TIMESTAMPTZ DEFAULT NOW(),
  alerts JSONB DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS network_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL, -- HIGH_UTILIZATION, LOW_SIGNAL, REPEATED_FB_ISSUE, NAP_OFFLINE
  nap_id UUID REFERENCES naps(id),
  severity VARCHAR(20) DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, CRITICAL
  message TEXT NOT NULL,
  is_resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Management Dashboards - KPI
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_management_kpi AS
SELECT 
  DATE_TRUNC('day', created_at) as day,
  COUNT(*) as total_wos,
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600) as avg_completion_hours,
  COUNT(*) FILTER (WHERE status='COMPLETED') * 100.0 / NULLIF(COUNT(*),0) as completion_rate,
  COUNT(*) FILTER (WHERE status='FB_ISSUE') as fb_issues,
  COUNT(DISTINCT technician_id) as active_technicians
FROM work_orders wo LEFT JOIN job_executions je ON je.work_order_id = wo.id
GROUP BY DATE_TRUNC('day', created_at);
