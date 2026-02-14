-- Cloudflare D1 database schema for Dibba Radar community pins

-- Main pins table
CREATE TABLE pins (
  id TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  speed_limit INTEGER,
  route TEXT NOT NULL,
  device_id TEXT NOT NULL,
  confirmed_count INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Pin confirmations table (tracks which devices confirmed which pins)
CREATE TABLE pin_confirmations (
  id TEXT PRIMARY KEY,
  pin_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (pin_id) REFERENCES pins (id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_pins_route ON pins(route);
CREATE INDEX idx_pins_created_at ON pins(created_at);
CREATE INDEX idx_pins_confirmed_count ON pins(confirmed_count);
CREATE INDEX idx_pins_location ON pins(lat, lon);
CREATE INDEX idx_pin_confirmations_pin_id ON pin_confirmations(pin_id);
CREATE INDEX idx_pin_confirmations_device_id ON pin_confirmations(device_id);

-- Composite index for efficient queries
CREATE INDEX idx_pins_route_confirmed_date ON pins(route, confirmed_count, created_at);

-- Sample data (optional - remove in production)
INSERT INTO pins (id, lat, lon, speed_limit, route, device_id, confirmed_count, created_at) VALUES
('sample-1', 25.2086, 55.5549, 120, 'dubai-dibba', 'device-sample-1', 5, datetime('now', '-5 days')),
('sample-2', 25.4203, 55.6479, 100, 'dubai-dibba', 'device-sample-2', 3, datetime('now', '-2 days'));

INSERT INTO pin_confirmations (id, pin_id, device_id, created_at) VALUES
('conf-1', 'sample-1', 'device-sample-1', datetime('now', '-5 days')),
('conf-2', 'sample-1', 'device-sample-3', datetime('now', '-4 days')),
('conf-3', 'sample-1', 'device-sample-4', datetime('now', '-3 days')),
('conf-4', 'sample-2', 'device-sample-2', datetime('now', '-2 days')),
('conf-5', 'sample-2', 'device-sample-5', datetime('now', '-1 day'));