ALTER TABLE users ADD COLUMN shop_access INTEGER NOT NULL DEFAULT 0 CHECK (shop_access IN (0, 1));

-- Grant only to the existing, Google-verified owner account, never by client input.
UPDATE users SET shop_access = 1
WHERE email = 'kkoallqq@gmail.com' AND email_verified = 1 AND google_sub IS NOT NULL;
