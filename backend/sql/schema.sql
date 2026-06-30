-- ============================================================
--  Zesto Food Ordering Platform - Complete MariaDB Schema
--  Database: zesto_db_2
--  Engine: InnoDB | Charset: utf8mb4
--  Includes marketplace tables directly. No migration required.
-- ============================================================

CREATE DATABASE IF NOT EXISTS zesto_db_2
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE zesto_db_2;

SET FOREIGN_KEY_CHECKS = 0;

-- 1. categories
CREATE TABLE IF NOT EXISTS categories (
  category_id   INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  name          VARCHAR(80)      NOT NULL,
  slug          VARCHAR(80)      NOT NULL,
  icon          VARCHAR(10)      NULL COMMENT 'short display icon',
  display_order TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_active     TINYINT(1)       NOT NULL DEFAULT 1,
  created_at    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (category_id),
  UNIQUE KEY uq_category_slug (slug),
  INDEX idx_cat_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. users
CREATE TABLE IF NOT EXISTS users (
  user_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(120) NOT NULL,
  email       VARCHAR(180) NOT NULL,
  phone       VARCHAR(20)  NULL,
  password    VARCHAR(255) NOT NULL,
  role        ENUM('customer','staff','admin','restaurant_admin','rider','super_admin')
              NOT NULL DEFAULT 'customer',
  avatar_url  VARCHAR(500) NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  last_login  TIMESTAMP    NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_email (email),
  INDEX idx_users_role (role),
  INDEX idx_users_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. admin_users
CREATE TABLE IF NOT EXISTS admin_users (
  admin_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  permissions JSON         NULL COMMENT 'granular permission overrides',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (admin_id),
  UNIQUE KEY uq_admin_user (user_id),

  CONSTRAINT fk_admin_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. restaurants
CREATE TABLE IF NOT EXISTS restaurants (
  restaurant_id  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  owner_user_id  INT UNSIGNED  NOT NULL,
  name           VARCHAR(200)  NOT NULL,
  slug           VARCHAR(200)  NOT NULL,
  logo_url       VARCHAR(500)  NULL,
  phone          VARCHAR(30)   NULL,
  email          VARCHAR(180)  NULL,
  address        TEXT          NULL,
  latitude       DECIMAL(10,7) NULL,
  longitude      DECIMAL(10,7) NULL,
  description    TEXT          NULL,
  status         ENUM('pending','approved','suspended') NOT NULL DEFAULT 'pending',
  commission_pct DECIMAL(5,2)  NOT NULL DEFAULT 15.00,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (restaurant_id),
  UNIQUE KEY uq_restaurant_slug (slug),
  INDEX idx_restaurant_owner (owner_user_id),
  INDEX idx_restaurant_status (status),

  CONSTRAINT fk_restaurant_owner FOREIGN KEY (owner_user_id)
    REFERENCES users (user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. riders
CREATE TABLE IF NOT EXISTS riders (
  rider_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED NOT NULL,
  vehicle_type   ENUM('bicycle','boda_boda','car') NOT NULL DEFAULT 'boda_boda',
  vehicle_number VARCHAR(30)  NULL,
  national_id    VARCHAR(50)  NULL,
  is_available   TINYINT(1)   NOT NULL DEFAULT 0,
  status         ENUM('pending','approved','suspended') NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (rider_id),
  UNIQUE KEY uq_rider_user (user_id),
  INDEX idx_rider_status (status),
  INDEX idx_rider_available (is_available),

  CONSTRAINT fk_rider_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. products
CREATE TABLE IF NOT EXISTS products (
  product_id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  category_id         INT UNSIGNED    NOT NULL DEFAULT 1,
  restaurant_id       INT UNSIGNED    NULL,
  name                VARCHAR(200)    NOT NULL,
  slug                VARCHAR(200)    NOT NULL,
  type                VARCHAR(80)     NULL COMMENT 'e.g. burger, pizza, juice',
  description         TEXT            NULL,
  image_url           VARCHAR(500)    NULL,
  price               DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  compare_price       DECIMAL(10,2)   NULL COMMENT 'original price for strike-through display',
  stock               INT UNSIGNED    NOT NULL DEFAULT 0,
  low_stock_threshold INT UNSIGNED    NOT NULL DEFAULT 5,
  is_active           TINYINT(1)      NOT NULL DEFAULT 1,
  is_featured         TINYINT(1)      NOT NULL DEFAULT 0,
  created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (product_id),
  UNIQUE KEY uq_product_slug (slug),
  INDEX idx_products_category (category_id),
  INDEX idx_products_restaurant (restaurant_id),
  INDEX idx_products_active (is_active),
  INDEX idx_products_featured (is_featured),
  INDEX idx_products_stock (stock),

  CONSTRAINT fk_product_category FOREIGN KEY (category_id)
    REFERENCES categories (category_id) ON DELETE RESTRICT,
  CONSTRAINT fk_product_restaurant FOREIGN KEY (restaurant_id)
    REFERENCES restaurants (restaurant_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. cart_items
CREATE TABLE IF NOT EXISTS cart_items (
  cart_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  qty        INT UNSIGNED NOT NULL DEFAULT 1,
  added_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (cart_id),
  UNIQUE KEY uq_cart_user_product (user_id, product_id),
  INDEX idx_cart_user (user_id),

  CONSTRAINT fk_cart_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_cart_product FOREIGN KEY (product_id)
    REFERENCES products (product_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. orders
CREATE TABLE IF NOT EXISTS orders (
  order_id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           INT UNSIGNED NOT NULL,
  restaurant_id     INT UNSIGNED NULL,
  order_number      VARCHAR(20)  NOT NULL COMMENT 'human-readable e.g. ZST-00142',
  status            ENUM('pending','processing','preparing','ready_for_pickup','out_for_delivery','delivered','cancelled')
                    NOT NULL DEFAULT 'pending',
  subtotal          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  discount_amount   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  delivery_fee      DECIMAL(10,2) NOT NULL DEFAULT 5000.00,
  total             DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  delivery_address  TEXT          NULL,
  delivery_lat      DECIMAL(10,7) NULL,
  delivery_lng      DECIMAL(10,7) NULL,
  notes             TEXT          NULL,
  assigned_staff_id          INT UNSIGNED  NULL,
  delivery_confirmation_code CHAR(6)       NULL COMMENT '6-digit code generated on payment; rider enters to confirm delivery',
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (order_id),
  UNIQUE KEY uq_order_number (order_number),
  INDEX idx_orders_user (user_id),
  INDEX idx_orders_restaurant (restaurant_id),
  INDEX idx_orders_status (status),
  INDEX idx_orders_created (created_at),
  INDEX idx_orders_staff (assigned_staff_id),

  CONSTRAINT fk_orders_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_restaurant FOREIGN KEY (restaurant_id)
    REFERENCES restaurants (restaurant_id) ON DELETE SET NULL,
  CONSTRAINT fk_orders_staff FOREIGN KEY (assigned_staff_id)
    REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. order_items
CREATE TABLE IF NOT EXISTS order_items (
  item_id    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  order_id   INT UNSIGNED  NOT NULL,
  product_id INT UNSIGNED  NOT NULL,
  name       VARCHAR(200)  NOT NULL COMMENT 'snapshot at order time',
  image_url  VARCHAR(500)  NULL COMMENT 'snapshot at order time',
  price      DECIMAL(10,2) NOT NULL COMMENT 'snapshot at order time',
  qty        INT UNSIGNED  NOT NULL DEFAULT 1,
  subtotal   DECIMAL(10,2) NOT NULL DEFAULT 0.00,

  PRIMARY KEY (item_id),
  INDEX idx_oi_order (order_id),
  INDEX idx_oi_product (product_id),

  CONSTRAINT fk_oi_order FOREIGN KEY (order_id)
    REFERENCES orders (order_id) ON DELETE CASCADE,
  CONSTRAINT fk_oi_product FOREIGN KEY (product_id)
    REFERENCES products (product_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. payments
CREATE TABLE IF NOT EXISTS payments (
  payment_id       INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  order_id         INT UNSIGNED  NOT NULL,
  user_id          INT UNSIGNED  NOT NULL,
  method           ENUM('mobile_money','card','cash') NOT NULL DEFAULT 'mobile_money',
  status           ENUM('pending','verified','failed','expired','refunded') NOT NULL DEFAULT 'pending',
  amount           DECIMAL(10,2) NOT NULL,
  currency         VARCHAR(5)    NOT NULL DEFAULT 'UGX',
  flw_tx_ref       VARCHAR(120)  NULL UNIQUE COMMENT 'generated tx_ref sent to Flutterwave',
  flw_tx_id        VARCHAR(120)  NULL COMMENT 'Flutterwave transaction_id on callback',
  flw_raw_response JSON          NULL COMMENT 'raw Flutterwave verify API response for audit',
  verified_at      TIMESTAMP     NULL,
  failure_reason   TEXT          NULL,
  idempotency_key  VARCHAR(120)  NULL UNIQUE COMMENT 'prevents replay attacks',
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (payment_id),
  UNIQUE KEY uq_pay_order (order_id),
  INDEX idx_pay_user (user_id),
  INDEX idx_pay_status (status),
  INDEX idx_pay_flw_ref (flw_tx_ref),
  INDEX idx_pay_created (created_at),

  CONSTRAINT fk_pay_order FOREIGN KEY (order_id)
    REFERENCES orders (order_id) ON DELETE RESTRICT,
  CONSTRAINT fk_pay_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. deliveries
CREATE TABLE IF NOT EXISTS deliveries (
  delivery_id      INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  order_id         INT UNSIGNED  NOT NULL,
  rider_id         INT UNSIGNED  NULL,
  pickup_address   TEXT          NULL,
  delivery_address TEXT          NULL,
  delivery_fee     DECIMAL(10,2) NOT NULL DEFAULT 5000.00,
  status           ENUM('pending','assigned','picked_up','on_the_way','delivered','failed')
                   NOT NULL DEFAULT 'pending',
  assigned_at      TIMESTAMP     NULL,
  picked_up_at     TIMESTAMP     NULL,
  delivered_at     TIMESTAMP     NULL,
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (delivery_id),
  INDEX idx_del_order (order_id),
  INDEX idx_del_rider (rider_id),
  INDEX idx_del_status (status),

  CONSTRAINT fk_del_order FOREIGN KEY (order_id)
    REFERENCES orders (order_id) ON DELETE RESTRICT,
  CONSTRAINT fk_del_rider FOREIGN KEY (rider_id)
    REFERENCES riders (rider_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. platform_settings
CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key   VARCHAR(100) NOT NULL,
  setting_value TEXT         NULL,
  setting_group VARCHAR(80)  NOT NULL DEFAULT 'general',
  label         VARCHAR(200) NULL,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (setting_key),
  INDEX idx_settings_group (setting_group)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  log_id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id    INT UNSIGNED NULL COMMENT 'user who performed action (NULL = system)',
  actor_role  ENUM('customer','staff','admin','restaurant_admin','rider','super_admin','system')
              NOT NULL DEFAULT 'system',
  action      VARCHAR(80)  NOT NULL COMMENT 'e.g. ORDER_STATUS_UPDATE, PAYMENT_FAILED',
  entity_type VARCHAR(40)  NOT NULL COMMENT 'e.g. order, payment, product, user',
  entity_id   INT UNSIGNED NULL,
  old_value   JSON         NULL,
  new_value   JSON         NULL,
  ip_address  VARCHAR(45)  NULL,
  user_agent  TEXT         NULL,
  notes       TEXT         NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (log_id),
  INDEX idx_audit_actor (actor_id),
  INDEX idx_audit_action (action),
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_time (created_at),

  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id)
    REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
--  Seed data
-- ============================================================

INSERT IGNORE INTO categories (category_id, name, slug, icon, display_order) VALUES
(1, 'Food', 'food', 'F', 1),
(2, 'Drinks', 'drinks', 'D', 2),
(3, 'Desserts', 'desserts', 'S', 3),
(4, 'Combos', 'combos', 'C', 4);

-- Default platform admin password: Admin@123
INSERT IGNORE INTO users (user_id, name, email, password, role) VALUES
(1, 'Zesto Admin', 'admin@zesto.ug',
 '$2a$12$BFul7quywglSAzuEVzuHHOi.1BlFA4bAAzMelZJwS.XsrNQQeWS0W', 'super_admin'),
(2, 'Zesto Kitchen', 'kitchen@zesto.ug',
 '$2a$12$BFul7quywglSAzuEVzuHHOi.1BlFA4bAAzMelZJwS.XsrNQQeWS0W', 'restaurant_admin');

INSERT IGNORE INTO admin_users (user_id) VALUES (1);

INSERT IGNORE INTO restaurants
  (restaurant_id, owner_user_id, name, slug, description, status)
VALUES
  (1, 2, 'Zesto Kitchen', 'zesto-kitchen',
   'The original Zesto flagship restaurant', 'approved');

INSERT IGNORE INTO products
  (product_id, category_id, restaurant_id, name, slug, type, description, image_url, price, compare_price, stock, is_featured)
VALUES
(1,  1, 1, 'Zesto Classic Burger',  'zesto-classic-burger',  'burger',   'Juicy beef patty, cheddar, lettuce, tomato, special sauce',        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400', 18000, 22000, 50, 1),
(2,  1, 1, 'Double Smash Burger',   'double-smash-burger',   'burger',   'Double smashed beef patties, American cheese, caramelised onions', 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=400', 24000, 29000, 40, 1),
(3,  1, 1, 'Crispy Chicken Burger', 'crispy-chicken-burger', 'burger',   'Crispy fried chicken, coleslaw, jalapenos, honey mustard',         'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=400', 20000, NULL, 45, 0),
(4,  1, 1, 'Margherita Pizza',      'margherita-pizza',      'pizza',    'San Marzano tomato, fresh mozzarella, basil, olive oil',           'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400', 28000, NULL, 30, 1),
(5,  1, 1, 'BBQ Chicken Pizza',     'bbq-chicken-pizza',     'pizza',    'Smoky BBQ sauce, grilled chicken, red onions, mozzarella',         'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400', 32000, NULL, 25, 0),
(6,  1, 1, 'Chicken Shawarma Wrap', 'chicken-shawarma-wrap', 'wrap',     'Marinated chicken, garlic sauce, pickles, tomatoes in soft wrap',  'https://images.unsplash.com/photo-1561651823-34feb02250e4?w=400', 16000, NULL, 60, 0),
(7,  1, 1, 'Beef Shawarma',         'beef-shawarma',         'wrap',     'Spiced beef, tahini, fresh vegetables, toasted bread',             'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=400', 17000, NULL, 55, 0),
(8,  1, 1, 'Loaded Fries',          'loaded-fries',          'sides',    'Crispy fries, cheese sauce, jalapenos, bacon bits',                'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400', 12000, NULL, 80, 0),
(9,  1, 1, 'Chicken Wings (6 pcs)', 'chicken-wings-6pcs',    'sides',    'Buffalo or BBQ glazed crispy wings with blue cheese dip',          'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=400', 22000, NULL, 35, 0),
(10, 1, 1, 'Beef Pasta Arrabbiata', 'beef-pasta-arrabbiata', 'pasta',    'Penne, spicy tomato sauce, ground beef, parmesan, fresh basil',    'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400', 20000, NULL, 28, 0),
(11, 2, 1, 'Fresh Mango Juice',     'fresh-mango-juice',     'juice',    'Cold-pressed ripe Ugandan mangoes, no sugar added',                'https://images.unsplash.com/photo-1546173159-315724a31696?w=400',  8000, NULL, 100, 1),
(12, 2, 1, 'Passion Fruit Smoothie','passion-fruit-smoothie','smoothie', 'Passion fruit, banana, yoghurt, honey',                           'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=400',  9000, NULL, 90, 0),
(13, 2, 1, 'Strawberry Milkshake',  'strawberry-milkshake',  'milkshake','Thick creamy milkshake with fresh strawberries and cream',         'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400', 11000, NULL, 60, 0),
(14, 2, 1, 'Coca-Cola 500ml',       'coca-cola-500ml',       'soda',     'Ice-cold Coca-Cola, served with ice',                              'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400',  4000, NULL, 200, 0),
(15, 2, 1, 'Mineral Water 750ml',   'mineral-water-750ml',   'water',    'Chilled mineral water',                                            'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400',  3000, NULL, 300, 0),
(16, 2, 1, 'Dawa Special Cocktail', 'dawa-special-cocktail', 'cocktail', 'Vodka, lime, honey, ice - the East African classic',               'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400', 18000, NULL, 40, 0),
(17, 3, 1, 'Chocolate Lava Cake',   'chocolate-lava-cake',   'cake',     'Warm chocolate cake with molten centre, vanilla ice cream',         'https://images.unsplash.com/photo-1624353365286-3f8d62daad51?w=400', 14000, NULL, 30, 1),
(18, 3, 1, 'Cheesecake Slice',      'cheesecake-slice',      'cake',     'New York-style cheesecake with berry compote',                     'https://images.unsplash.com/photo-1578775887804-699de7086ff9?w=400', 12000, NULL, 35, 0),
(19, 3, 1, 'Churros & Dipping Sauce','churros-dipping-sauce','pastry',   'Crispy cinnamon churros with chocolate dipping sauce',             'https://images.unsplash.com/photo-1624353365286-3f8d62daad51?w=400', 10000, NULL, 50, 0),
(20, 4, 1, 'Family Combo Deal',     'family-combo-deal',     'combo',    '2 Classic Burgers + 1 Pizza + 4 Drinks - best value!',             'https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=400', 65000, 80000, 20, 1),
(21, 4, 1, 'Kids Meal Box',         'kids-meal-box',         'combo',    'Mini burger, small fries, juice box, toy surprise',                'https://images.unsplash.com/photo-1485963631004-f2f00b1d6606?w=400', 18000, NULL, 30, 0);

INSERT IGNORE INTO platform_settings (setting_key, setting_value, setting_group, label) VALUES
('platform_name',         'Zesto',            'general',    'Platform Name'),
('platform_logo',         '',                 'general',    'Platform Logo URL'),
('support_email',         'support@zesto.ug', 'general',    'Support Email'),
('support_phone',         '+256700000000',    'general',    'Support Phone'),
('currency',              'UGX',              'general',    'Currency'),
('restaurant_commission', '15',               'commission', 'Restaurant Commission %'),
('delivery_commission',   '10',               'commission', 'Delivery Commission %'),
('base_delivery_fee',     '5000',             'delivery',   'Base Delivery Fee'),
('per_km_fee',            '500',              'delivery',   'Per KM Fee'),
('max_delivery_distance', '20',               'delivery',   'Max Delivery Distance (km)'),
('jwt_expiration',        '7d',               'security',   'JWT Expiration'),
('session_timeout',       '30',               'security',   'Session Timeout (minutes)'),
('audit_logs_enabled',    '1',                'audit',      'Enable Audit Logs'),
('audit_retention_days',  '90',               'audit',      'Log Retention (days)');

-- ============================================================
-- MIGRATION: Add delivery_confirmation_code to orders
-- Run this on existing databases that already have the orders table.
-- ============================================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_confirmation_code CHAR(6) NULL
    COMMENT '6-digit code generated on payment; rider enters to confirm delivery'
  AFTER assigned_staff_id;
