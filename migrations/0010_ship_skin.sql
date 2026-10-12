ALTER TABLE users ADD COLUMN ship_skin TEXT NOT NULL DEFAULT 'classic'
  CHECK (ship_skin IN ('classic', 'submarine', 'carrier', 'viking', 'stealth'));
