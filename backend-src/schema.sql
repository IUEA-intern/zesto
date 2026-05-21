-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
CREATE TABLE users (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100)        NOT NULL,
  email           VARCHAR(150)        NOT NULL UNIQUE,
  phone           VARCHAR(20)         NOT NULL UNIQUE,
  password_hash   VARCHAR(255)        NOT NULL,
  delivery_address TEXT               NULL,
  role            ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  is_active       BOOLEAN             NOT NULL DEFAULT TRUE,
  created_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- REFRESH TOKENS
-- ─────────────────────────────────────────────
CREATE TABLE refresh_tokens (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED    NOT NULL UNIQUE, -- one token per user (single device)
  token_hash  VARCHAR(255)    NOT NULL,
  expires_at  DATETIME        NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────
-- CATEGORIES
-- ─────────────────────────────────────────────
CREATE TABLE categories (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80)     NOT NULL UNIQUE,
  icon_url    VARCHAR(500)    NULL,
  sort_order  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_active   BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- RESTAURANTS
-- ─────────────────────────────────────────────
CREATE TABLE restaurants (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id       INT UNSIGNED    NOT NULL,
  name              VARCHAR(120)    NOT NULL,
  description       TEXT            NULL,
  logo_url          VARCHAR(500)    NULL,
  cover_url         VARCHAR(500)    NULL,
  address           VARCHAR(300)    NOT NULL,
  latitude          DECIMAL(9,6)    NULL,
  longitude         DECIMAL(9,6)    NULL,
  phone             VARCHAR(20)     NULL,
  delivery_time_min SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  -- Prices stored in smallest currency unit (UGX = no subunit, store as integer)
  delivery_fee      INT UNSIGNED    NOT NULL DEFAULT 0,
  min_order_amount  INT UNSIGNED    NOT NULL DEFAULT 0,
  rating            DECIMAL(3,2)    NOT NULL DEFAULT 0.00,
  rating_count      INT UNSIGNED    NOT NULL DEFAULT 0,
  is_open           BOOLEAN         NOT NULL DEFAULT TRUE,
  is_active         BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  INDEX idx_category (category_id),
  INDEX idx_active_open (is_active, is_open)
);

-- ─────────────────────────────────────────────
-- MENU ITEMS
-- ─────────────────────────────────────────────
CREATE TABLE menu_items (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT UNSIGNED    NOT NULL,
  name          VARCHAR(150)    NOT NULL,
  description   TEXT            NULL,
  price         INT UNSIGNED    NOT NULL,  -- stored in UGX integer
  imageUrl     VARCHAR(500)    NULL,
  is_available  BOOLEAN         NOT NULL DEFAULT TRUE,
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  INDEX idx_restaurant (restaurant_id)
);

-- ─────────────────────────────────────────────
-- CARTS
-- ─────────────────────────────────────────────
CREATE TABLE carts (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED    NOT NULL UNIQUE,
  restaurant_id INT UNSIGNED    NOT NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

CREATE TABLE cart_items (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cart_id      INT UNSIGNED     NOT NULL,
  menu_item_id INT UNSIGNED     NOT NULL,
  quantity     TINYINT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY uq_cart_item (cart_id, menu_item_id),
  FOREIGN KEY (cart_id)      REFERENCES carts(id)      ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────
-- ORDERS
-- ─────────────────────────────────────────────
CREATE TABLE orders (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED    NOT NULL,
  restaurant_id     INT UNSIGNED    NOT NULL,
  status            ENUM(
                      'pending',
                      'paid',
                      'confirmed',
                      'preparing',
                      'out_for_delivery',
                      'delivered',
                      'cancelled'
                    ) NOT NULL DEFAULT 'pending',
  delivery_address  TEXT            NOT NULL,
  subtotal          INT UNSIGNED    NOT NULL,  -- integer UGX
  delivery_fee      INT UNSIGNED    NOT NULL DEFAULT 0,
  total_amount      INT UNSIGNED    NOT NULL,
  notes             TEXT            NULL,
  payment_method    VARCHAR(50)     NULL,
  payment_status    ENUM('unpaid','paid','refunded') NOT NULL DEFAULT 'unpaid',
  payment_reference VARCHAR(200)    NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE RESTRICT,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE RESTRICT,
  INDEX idx_user   (user_id),
  INDEX idx_status (status)
);

CREATE TABLE order_items (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id     INT UNSIGNED     NOT NULL,
  menu_item_id INT UNSIGNED     NOT NULL,
  name         VARCHAR(150)     NOT NULL,  -- price snapshot
  unit_price   INT UNSIGNED     NOT NULL,  -- price snapshot
  quantity     TINYINT UNSIGNED NOT NULL,
  line_total   INT UNSIGNED     NOT NULL,
  FOREIGN KEY (order_id)     REFERENCES orders(id)     ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE RESTRICT
);

-- ─────────────────────────────────────────────
-- PAYMENTS
-- ─────────────────────────────────────────────
CREATE TABLE payments (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id       INT UNSIGNED    NOT NULL,
  provider       VARCHAR(50)     NOT NULL,
  provider_tx_id VARCHAR(200)    NULL,
  amount         INT UNSIGNED    NOT NULL,  -- integer UGX
  currency       VARCHAR(10)     NOT NULL DEFAULT 'UGX',
  status         ENUM('initiated','success','failed','pending') NOT NULL DEFAULT 'initiated',
  raw_response   JSON            NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_order (order_id),
  INDEX idx_provider_tx (provider_tx_id)
);

-- ─────────────────────────────────────────────
-- SEED DATA
-- ─────────────────────────────────────────────
INSERT INTO categories (name, icon_url, sort_order) VALUES
  ('Fast Food',  '/icons/fastfood.png',  1),
  ('Pizza',      '/icons/pizza.png',     2),
  ('Burgers',    '/icons/burger.png',    3),
  ('Chicken',    '/icons/chicken.png',   4),
  ('Drinks',     '/icons/drinks.png',    5);

INSERT INTO restaurants
  (category_id, name, description, address, delivery_time_min, delivery_fee, min_order_amount, rating, is_open)
VALUES
  (1, 'McDonald''s', 'World famous burgers & fries',
   'Kampala Road, Kampala', 25, 3000, 10000, 4.20, TRUE),
  (1, 'KFC', 'Finger lickin'' good chicken',
   'Garden City Mall, Kampala', 30, 3500, 15000, 4.10, TRUE);

-- McDonald's menu (prices in UGX integer)
INSERT INTO menu_items (restaurant_id, name, description, price, sort_order) VALUES
  (1, 'Big Mac',             'Two beef patties, special sauce, lettuce, cheese', 15000, 1),
  (1, 'McChicken',           'Crispy chicken fillet burger',                      15000, 2),
  (1, 'Cheeseburger',        'Classic single beef with cheese',                  10000, 3),
  (1, 'Chicken McNuggets 6', 'Six crispy nuggets with dipping sauce',            12000, 4),
  (1, 'Large Fries',         'Golden crispy fries',                               7000, 5),
  (1, 'McFlurry Oreo',       'Creamy ice cream with Oreo crumbles',               9000, 6),
  (1, 'Coke 500ml',          'Ice cold Coca-Cola',                                5000, 7);

-- KFC menu
INSERT INTO menu_items (restaurant_id, name, description, price, sort_order) VALUES
  (2, 'Zinger Burger',       'Spicy chicken fillet burger',                       17000, 1),
  (2, 'Original Recipe 3pc', 'Three pieces of the Colonel''s original chicken',  22000, 2),
  (2, 'Hot Wings 5pc',       'Five spicy fried chicken wings',                   15000, 3),
  (2, 'Streetwise 2',        'Two pieces chicken with chips',                    18000, 4),
  (2, 'Coleslaw',            'Creamy coleslaw side',                               4000, 5),
  (2, 'Pepsi 500ml',         'Ice cold Pepsi',                                    6000, 6),
  (2, 'Krushers Vanilla',    'Creamy blended vanilla drink',                      9000, 7);
