package store

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testStore spins up an isolated Postgres schema per test (the parent database
// comes from TEST_DATABASE_URL), applies the real schema file, and drops it
// afterwards. Tests therefore never interfere with each other and never touch
// seeded data.
func testStore(t *testing.T) *Store {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set; skipping database-backed tests")
	}

	ctx := context.Background()

	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connect admin pool: %v", err)
	}

	schema := fmt.Sprintf("test_%d", time.Now().UnixNano())
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		admin.Close()
		t.Fatalf("create schema: %v", err)
	}

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatalf("parse dsn: %v", err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("connect test schema: %v", err)
	}

	ddl, err := os.ReadFile("../../migrations/0001_schema.sql")
	if err != nil {
		t.Fatalf("read schema: %v", err)
	}
	if _, err := pool.Exec(ctx, string(ddl)); err != nil {
		t.Fatalf("apply schema: %v", err)
	}

	t.Cleanup(func() {
		pool.Close()
		if _, err := admin.Exec(context.Background(), "DROP SCHEMA "+schema+" CASCADE"); err != nil {
			t.Logf("drop schema %s: %v", schema, err)
		}
		admin.Close()
	})

	return New(pool)
}

func mustCreateProduct(t *testing.T, st *Store, sku string, price, stock int64, active bool) Product {
	t.Helper()
	p, err := st.CreateProduct(context.Background(), ProductInput{
		SKU: sku, Name: "Product " + sku, Price: price, Stock: stock, IsActive: active,
	})
	if err != nil {
		t.Fatalf("create product %s: %v", sku, err)
	}
	return p
}

func countRows(t *testing.T, st *Store, table string) int64 {
	t.Helper()
	var n int64
	if err := st.pool.QueryRow(context.Background(), "SELECT count(*) FROM "+table).Scan(&n); err != nil {
		t.Fatalf("count %s: %v", table, err)
	}
	return n
}

func stockOf(t *testing.T, st *Store, id int64) int64 {
	t.Helper()
	p, err := st.GetProduct(context.Background(), id)
	if err != nil {
		t.Fatalf("get product %d: %v", id, err)
	}
	return p.Stock
}
