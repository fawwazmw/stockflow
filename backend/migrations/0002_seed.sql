-- Seed data: 16 realistic products + 3 sample orders.
-- All stock movements are written alongside the stock changes so the seeded
-- data is internally consistent (stock == sum(in) - sum(out)).

INSERT INTO products (sku, name, price, stock, is_active) VALUES
    ('LAP-001', 'Laptop Lenovo ThinkPad E14',        12499000,  14, TRUE),
    ('LAP-002', 'Laptop ASUS VivoBook 14',            8499000,  11, TRUE),
    ('MON-001', 'Monitor LG 24MK430H 24"',            1899000,  22, TRUE),
    ('KEY-001', 'Keyboard Logitech K380',              499000,  40, TRUE),
    ('MSE-001', 'Mouse Logitech M331 Silent',          249000,  55, TRUE),
    ('SSD-001', 'SSD Samsung 970 EVO 1TB',            1599000,  18, TRUE),
    ('RAM-001', 'RAM Kingston Fury 16GB DDR4',         899000,   9, TRUE),
    ('PRN-001', 'Printer Epson L3250',                3299000,   4, TRUE),
    ('PPR-001', 'Kertas HVS A4 80gsm (rim)',            62000, 120, TRUE),
    ('TNT-001', 'Tinta Epson 003 Black',                89000,   7, TRUE),
    ('CHR-001', 'Kursi Ergonomis Ergotec',            2450000,   3, TRUE),
    ('DSK-001', 'Meja Kerja 120cm',                   1799000,   0, TRUE),
    ('CBL-001', 'Kabel HDMI 2m',                        75000, 200, TRUE),
    ('WEB-001', 'Webcam Logitech C270',                549000,   0, FALSE),
    ('SPK-001', 'Speaker JBL Go 3',                    699000,  15, FALSE),
    ('UPS-001', 'UPS APC BX600',                      1050000,   6, TRUE);

-- Opening balance for every product that currently holds stock.
INSERT INTO stock_movements (product_id, type, qty, note, created_at)
SELECT id, 'in', stock, 'Initial stock', now() - interval '45 days'
FROM products
WHERE stock > 0;

-- A handful of later adjustments. Each row updates both the ledger and the
-- product row so the two never disagree.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('KEY-001', 'in',   5, 'Restock from distributor', interval '8 days'),
            ('MSE-001', 'out',  2, 'Damaged in transit',       interval '6 days'),
            ('PPR-001', 'in',  30, 'Restock from distributor', interval '20 days'),
            ('CBL-001', 'out',  5, 'Sample unit for demo',     interval '12 days')
        ) AS t(sku, type, qty, note, ago)
    LOOP
        INSERT INTO stock_movements (product_id, type, qty, note, created_at)
        SELECT p.id, r.type, r.qty, r.note, now() - r.ago
        FROM products p WHERE p.sku = r.sku;

        UPDATE products p
        SET stock = p.stock + CASE WHEN r.type = 'in' THEN r.qty ELSE -r.qty END
        WHERE p.sku = r.sku;
    END LOOP;
END $$;

-- Sample orders. Created through a helper so the item rows, the ledger and the
-- product stock always agree, exactly like the API does it.
CREATE TEMP TABLE seed_items (sku TEXT NOT NULL, qty INTEGER NOT NULL);

CREATE FUNCTION pg_temp.seed_order(p_customer TEXT, p_created TIMESTAMPTZ, p_cancel BOOLEAN)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_order_id INTEGER;
    v_total    INTEGER;
BEGIN
    SELECT COALESCE(SUM(p.price * i.qty), 0)
    INTO v_total
    FROM seed_items i JOIN products p ON p.sku = i.sku;

    INSERT INTO sales_orders (customer, total, created_at)
    VALUES (p_customer, v_total, p_created)
    RETURNING id INTO v_order_id;

    INSERT INTO sales_order_items (order_id, sku, qty, unit_price)
    SELECT v_order_id, i.sku, i.qty, p.price
    FROM seed_items i JOIN products p ON p.sku = i.sku;

    INSERT INTO stock_movements (product_id, type, qty, note, created_at)
    SELECT p.id, 'out', i.qty, 'Sales order #' || v_order_id, p_created
    FROM seed_items i JOIN products p ON p.sku = i.sku;

    UPDATE products p SET stock = p.stock - i.qty
    FROM seed_items i WHERE p.sku = i.sku;

    IF p_cancel THEN
        INSERT INTO stock_movements (product_id, type, qty, note, created_at)
        SELECT p.id, 'in', i.qty, 'Cancelled order #' || v_order_id, p_created + interval '1 day'
        FROM seed_items i JOIN products p ON p.sku = i.sku;

        UPDATE products p SET stock = p.stock + i.qty
        FROM seed_items i WHERE p.sku = i.sku;

        UPDATE sales_orders
        SET status = 'CANCELLED', cancelled_at = p_created + interval '1 day'
        WHERE id = v_order_id;
    END IF;

    DELETE FROM seed_items;
    RETURN v_order_id;
END $$;

INSERT INTO seed_items VALUES ('MON-001', 2), ('KEY-001', 3);
SELECT pg_temp.seed_order('CV Sinar Abadi', now() - interval '2 days', FALSE);

INSERT INTO seed_items VALUES ('CHR-001', 1), ('TNT-001', 2);
SELECT pg_temp.seed_order('Toko Berkah Jaya', now() - interval '5 days', TRUE);

INSERT INTO seed_items VALUES ('MSE-001', 4), ('PPR-001', 10);
SELECT pg_temp.seed_order('PT Maju Bersama', now() - interval '6 hours', FALSE);

DROP TABLE seed_items;
