-- StockFlow schema.
-- Applied automatically by the postgres image on first boot
-- (mounted at /docker-entrypoint-initdb.d).

CREATE TABLE products (
    id         SERIAL PRIMARY KEY,
    sku        TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    price      INTEGER NOT NULL CHECK (price >= 0),   -- IDR, integer: no float money
    stock      INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive search support (products list uses ILIKE).
CREATE INDEX products_sku_lower_idx  ON products (lower(sku));
CREATE INDEX products_name_lower_idx ON products (lower(name));

CREATE TABLE stock_movements (
    id         SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    type       TEXT NOT NULL CHECK (type IN ('in', 'out')),
    qty        INTEGER NOT NULL CHECK (qty > 0),
    note       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Drives both the movement history endpoint and the derived last_movement_at.
CREATE INDEX stock_movements_product_created_idx
    ON stock_movements (product_id, created_at DESC, id DESC);

CREATE TABLE sales_orders (
    id           SERIAL PRIMARY KEY,
    customer     TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','CANCELLED')),
    total        INTEGER NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at TIMESTAMPTZ
);

CREATE INDEX sales_orders_created_idx ON sales_orders (created_at DESC, id DESC);
CREATE INDEX sales_orders_status_idx  ON sales_orders (status);

CREATE TABLE sales_order_items (
    id         SERIAL PRIMARY KEY,
    order_id   INTEGER NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    sku        TEXT NOT NULL REFERENCES products(sku),
    qty        INTEGER NOT NULL CHECK (qty > 0),
    unit_price INTEGER NOT NULL
);

CREATE INDEX sales_order_items_order_idx ON sales_order_items (order_id);
CREATE INDEX sales_order_items_sku_idx   ON sales_order_items (sku);

-- Bonus: Idempotency-Key support for POST /api/orders.
-- The key is inserted in the same transaction as the order, so a retry can
-- never create a second order.
CREATE TABLE idempotency_keys (
    id           SERIAL PRIMARY KEY,
    key          TEXT NOT NULL UNIQUE,
    request_hash TEXT NOT NULL,
    order_id     INTEGER REFERENCES sales_orders(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
