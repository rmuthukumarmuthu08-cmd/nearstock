-- ============================================================
--  NearStock — Smart Nearby Inventory Discovery System
--  MySQL 8.0+ schema
--  Run:  mysql -u root -p < db/schema.sql
-- ============================================================

DROP DATABASE IF EXISTS nearstock;
CREATE DATABASE nearstock CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE nearstock;

-- ------------------------------------------------------------
-- 1. USERS  (customers + shop owners)
-- ------------------------------------------------------------
CREATE TABLE users (
  user_id      INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(120)  NOT NULL,
  email        VARCHAR(160)  NOT NULL UNIQUE,
  phone        VARCHAR(20),
  role         ENUM('customer','shop') NOT NULL DEFAULT 'customer',
  latitude     DECIMAL(10, 7),
  longitude    DECIMAL(10, 7),
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 2. STORES  (shops registered on NearStock)
-- ------------------------------------------------------------
CREATE TABLE stores (
  store_id     INT AUTO_INCREMENT PRIMARY KEY,
  owner_id     INT,
  name         VARCHAR(160) NOT NULL,
  category     VARCHAR(80),
  address      VARCHAR(255),
  city         VARCHAR(80),
  phone        VARCHAR(20),
  latitude     DECIMAL(10, 7) NOT NULL,
  longitude    DECIMAL(10, 7) NOT NULL,
  opens_at     TIME DEFAULT '09:00:00',
  closes_at    TIME DEFAULT '21:00:00',
  rating       DECIMAL(2, 1) DEFAULT 4.0,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_store_owner FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_store_geo (latitude, longitude)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 3. PRODUCTS  (global product catalogue)
-- ------------------------------------------------------------
CREATE TABLE products (
  product_id   INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(160) NOT NULL,
  brand        VARCHAR(120),
  category     VARCHAR(80),
  unit         VARCHAR(40)  DEFAULT 'piece',
  base_price   DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  barcode      VARCHAR(64) UNIQUE,
  image_emoji  VARCHAR(8) DEFAULT '📦',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_product_name (name),
  FULLTEXT KEY ft_product (name, brand, category)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 4. INVENTORY  (per-store stock — updated by the billing system)
-- ------------------------------------------------------------
CREATE TABLE inventory (
  inventory_id INT AUTO_INCREMENT PRIMARY KEY,
  store_id     INT NOT NULL,
  product_id   INT NOT NULL,
  quantity     INT NOT NULL DEFAULT 0,
  price        DECIMAL(10, 2) NOT NULL,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inv_store   FOREIGN KEY (store_id)   REFERENCES stores(store_id)     ON DELETE CASCADE,
  CONSTRAINT fk_inv_product FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
  UNIQUE KEY uq_store_product (store_id, product_id),
  INDEX idx_inv_product (product_id, quantity)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 5. REQUEST_QUEUE  (FIFO customer requests — the Queue DSA)
--    position = monotonically increasing ticket number.
--    Dequeue = lowest position with status 'waiting'.
-- ------------------------------------------------------------
CREATE TABLE request_queue (
  request_id     INT AUTO_INCREMENT PRIMARY KEY,
  store_id       INT NOT NULL,
  product_id     INT NOT NULL,
  customer_name  VARCHAR(120) NOT NULL,
  customer_phone VARCHAR(20),
  quantity       INT NOT NULL DEFAULT 1,
  note           VARCHAR(255),
  position       INT NOT NULL,
  status         ENUM('waiting','processing','fulfilled','cancelled') NOT NULL DEFAULT 'waiting',
  enqueued_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at   TIMESTAMP NULL,
  CONSTRAINT fk_q_store   FOREIGN KEY (store_id)   REFERENCES stores(store_id)     ON DELETE CASCADE,
  CONSTRAINT fk_q_product FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
  INDEX idx_queue_fifo (store_id, status, position)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 6. BILLING_SYNC  (audit log of stock pushes from POS/billing)
-- ------------------------------------------------------------
CREATE TABLE billing_sync (
  sync_id     INT AUTO_INCREMENT PRIMARY KEY,
  store_id    INT NOT NULL,
  product_id  INT NOT NULL,
  delta       INT NOT NULL,           -- negative = sold, positive = restocked
  source      VARCHAR(60) DEFAULT 'pos',
  synced_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bs_store   FOREIGN KEY (store_id)   REFERENCES stores(store_id)     ON DELETE CASCADE,
  CONSTRAINT fk_bs_product FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
--  VIEW: product availability joined with store location
-- ============================================================
CREATE OR REPLACE VIEW v_availability AS
SELECT
  p.product_id, p.name AS product_name, p.brand, p.category, p.unit, p.image_emoji,
  s.store_id, s.name AS store_name, s.address, s.city, s.phone,
  s.latitude, s.longitude, s.rating, s.opens_at, s.closes_at,
  i.quantity, i.price, i.updated_at
FROM inventory i
JOIN products p ON p.product_id = i.product_id
JOIN stores   s ON s.store_id   = i.store_id
WHERE s.is_active = TRUE;

-- ============================================================
--  STORED FUNCTION: Haversine great-circle distance in km
--  (Used when distance ranking is pushed down into SQL.)
-- ============================================================
DELIMITER //
CREATE FUNCTION haversine_km(
  lat1 DECIMAL(10,7), lon1 DECIMAL(10,7),
  lat2 DECIMAL(10,7), lon2 DECIMAL(10,7)
) RETURNS DECIMAL(10,3)
DETERMINISTIC
BEGIN
  DECLARE r DECIMAL(10,3) DEFAULT 6371.0;
  RETURN r * 2 * ASIN(SQRT(
      POW(SIN(RADIANS(lat2 - lat1) / 2), 2) +
      COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
      POW(SIN(RADIANS(lon2 - lon1) / 2), 2)
  ));
END //
DELIMITER ;

-- Seed data lives in db/seed.sql — run it after this file:
--   mysql -u root -p nearstock < db/seed.sql
