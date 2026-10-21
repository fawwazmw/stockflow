# StockFlow — Inventory & Sales (mini ERP)

A warehouse supervisor's tool: manage products, adjust stock with an auditable
ledger, and record sales orders that reserve stock atomically. The React
frontend talks to the real Go API — there is no mock data anywhere in the
deliverable.

**Stack:** React 19 + TypeScript (Vite) · Go 1.24 (`net/http` + `pgx/v5`) ·
PostgreSQL 16 · Docker Compose.

---

## Quick start

```bash
docker compose up --build
```

Then open **http://localhost:3000**. That is the whole setup: Postgres starts
with the schema and seed data applied, the API waits for the database to become
healthy, and nginx serves the built frontend with `/api` proxied to the backend.

| Service | URL | Notes |
| --- | --- | --- |
| Frontend | http://localhost:3000 | nginx, SPA fallback, `/api` proxy |
| API | http://localhost:8080 | `GET /healthz` for a liveness check |
| Postgres | localhost:5432 | user/password/db: `stockflow` |

Ports are overridable if something is already bound:

```bash
DB_PORT=55432 API_PORT=18080 WEB_PORT=3000 docker compose up --build
```

To wipe the database and re-run migrations + seed:

```bash
docker compose down -v && docker compose up --build
```

> Migrations are applied by the Postgres image only on an **empty** volume. That
> is deliberate: one `docker compose up` is the whole "runnable in 5 minutes"
> path, with no migration tool to install.

---

## Local development (without Docker for the apps)

Postgres from compose, then the two apps on the host:

```bash
docker compose up -d db

# terminal 1 — API
cd backend
DATABASE_URL="postgres://stockflow:stockflow@localhost:5432/stockflow?sslmode=disable" \
  go run ./cmd/api          # listens on :8080

# terminal 2 — Vite
cd frontend
npm install
npm run dev                 # http://localhost:5173, proxies /api to :8080
```

Vite proxies `/api` to `http://localhost:8080` (override with
`VITE_API_PROXY=http://localhost:18080`). Because the browser only ever talks to
one origin, no CORS configuration is required in development. The API also sends
permissive CORS headers (`CORS_ORIGINS`, default `*`) so it can be called
directly from a different origin if you prefer.

---

## Tests

```bash
make test            # backend (go test -race) + frontend (vitest)
make test-backend
make test-frontend
```

Backend tests create a **throw-away Postgres schema per test**, apply the real
`0001_schema.sql`, and drop the schema afterwards — they never read or write the
seeded data. They need `TEST_DATABASE_URL` (the Makefile supplies it).

Covered:

| Test | What it proves |
| --- | --- |
| `TestCreateOrderHappyPathWritesMovementAndStock` | prices/total come from the DB; stock and `out` movements are written |
| `TestCreateOrderInsufficientStockWritesNothing` | a multi-line order that fails on line 2 leaves **zero** rows and **zero** stock changes |
| `TestConcurrentOrdersNeverOversell` | 20 goroutines race for 5 units → exactly 5 succeed, stock ends at 0 (`go test -race`) |
| `TestCancelOrderRestoresStock` | cancel restores once; a second cancel is a 409 and does not double-restore |
| `TestAdjustStockRejectsOverdrawWithoutWriting` | guarded decrement + no movement row on failure |
| `TestDeleteProductKeepsHistory` | history blocks deletion; a clean product deletes |
| `TestCreateOrderRejectsUnknownAndInactiveSKUs` | validation happens before any write |
| `TestIdempotencyKeyReplaysTheSameOrder` | retry returns the same order; a different payload with the same key conflicts |
| `TestListProductsSearchFilterAndLastMovement` | case-insensitive search, filters, pagination, literal `%`, null `last_movement_at` |

Frontend (Vitest, pure logic — no DOM needed): currency/relative-time
formatting, quantity and form validation, and the order-line validator
(duplicate SKUs, zero/negative/fractional quantities).

---

## API

Base URL `http://localhost:8080`.

### Error envelope

Every failure — validation, conflict, 404, 500 — uses one shape:

```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "…", "sku": "CHR-001", "available": 3, "requested": 99 } }
```

Validation errors add machine-readable detail so the UI can point at a field or
a specific order line:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "order validation failed",
    "fields": { "customer": "is required" },
    "details": [
      { "field": "items[1].sku", "sku": "KEY-001", "message": "duplicate sku in the same order (already on item 0)" }
    ]
  }
}
```

### Endpoints

| Method | Path | Success | Notes |
| --- | --- | --- | --- |
| GET | `/api/products?search=&page=&limit=&status=` | 200 `{data,page,limit,total}` | `search` matches sku or name, case-insensitive. `status` = `all\|active\|inactive\|low` (**extension**). `last_movement_at` is derived per row. |
| POST | `/api/products` | 201 `{data}` | `sku` required + unique, `name` required, `price` integer ≥ 0. Optional `stock` writes an opening `in` movement. |
| GET | `/api/products/{id}` | 200 `{data}` | **extension** |
| PUT | `/api/products/{id}` | 200 `{data}` | Full replace of sku/name/price/is_active. **Stock is not settable here** — use the stock endpoint. 404 if missing, 409 on duplicate SKU. |
| DELETE | `/api/products/{id}` | 204 | 409 `PRODUCT_HAS_HISTORY` when the product has movements or order lines. History is never deleted. |
| POST | `/api/products/{id}/stock` | 200 `{data:{product,movement}}` | Body `{type:"in"\|"out", qty, note}`. 409 `INSUFFICIENT_STOCK` + `available`. Movement and stock change share one transaction. |
| GET | `/api/products/{id}/movements` | 200 `{data}` | Newest first. |
| GET | `/api/products/summary` | 200 `{data}` | **extension** — totals for the dashboard cards. |
| POST | `/api/orders` | 201 `{data}` | Validates everything first; prices from the DB; one transaction for all lines. Supports `Idempotency-Key`. |
| GET | `/api/orders/{id}` | 200 `{data}` | Order + items (with `unit_price`, `subtotal`, `product_name`). |
| POST | `/api/orders/{id}/cancel` | 200 `{data}` | Restores stock, appends `in` movements. 409 `ORDER_ALREADY_CANCELLED`. |
| GET | `/api/orders?page=&limit=` | 200 | **extension** — needed by the orders screen. |
| GET | `/api/reports/daily-sales?date=YYYY-MM-DD` | 200 `{data}` | **bonus** — orders, items sold and revenue for a day (non-cancelled orders). |

All money/quantity fields are integers (IDR, no floating point).

### curl walkthrough

```bash
# List + search + filter
curl 'http://localhost:8080/api/products?search=lap&page=1&limit=10'
curl 'http://localhost:8080/api/products?status=low&limit=100'

# Create a product (with opening stock)
curl -X POST http://localhost:8080/api/products \
  -H 'Content-Type: application/json' \
  -d '{"sku":"NEW-001","name":"Docking Station","price":850000,"stock":4,"is_active":true}'

# Stock in / out
curl -X POST http://localhost:8080/api/products/1/stock \
  -H 'Content-Type: application/json' \
  -d '{"type":"in","qty":5,"note":"Restock from distributor"}'

# Overdraw -> 409 with the available quantity, nothing written
curl -i -X POST http://localhost:8080/api/products/11/stock \
  -H 'Content-Type: application/json' \
  -d '{"type":"out","qty":999}'

# Creating an order (unit prices are NOT accepted from the client)
curl -X POST http://localhost:8080/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"customer":"CV Sinar Abadi","items":[{"sku":"KEY-001","qty":2},{"sku":"MSE-001","qty":1}]}'

# Same request retried with the same key returns the same order (no double order)
curl -i -X POST http://localhost:8080/api/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 6f1c1f0e-2f2a-4a5b-9c3d-000000000001' \
  -d '{"customer":"Retry Buyer","items":[{"sku":"MSE-001","qty":2}]}'

# Cancel -> stock restored
curl -X POST http://localhost:8080/api/orders/4/cancel

# Delete a product with history -> 409 PRODUCT_HAS_HISTORY
curl -i -X DELETE http://localhost:8080/api/products/1

# History, newest first
curl http://localhost:8080/api/products/1/movements

# Daily sales
curl 'http://localhost:8080/api/reports/daily-sales?date=2026-10-21'
```

---

## Design decisions

### 1. Stock can never go negative (the part that matters most)

Every decrement is a **guarded UPDATE**, never a read-then-write:

```sql
UPDATE products SET stock = stock - $1
WHERE id = $2 AND stock >= $1
RETURNING stock;
```

`RowsAffected() == 0` means "don't have enough" — the API then re-reads `stock`
for the 409 payload and returns an error, which rolls the transaction back.

For an order, all lines are reserved in **one transaction**, so either the whole
order exists or nothing changed. Lines are sorted by `product_id` before
updating, so two concurrent multi-item orders acquire row locks in the same
order and cannot deadlock on each other.

Cancel is the mirror image: `SELECT … FOR UPDATE` on the order row makes
concurrent cancels serialise (the second sees `CANCELLED` → 409), and stock is
restored with compensating `in` movements.

`stock_movements` is append-only and every stock change writes a row in the same
transaction, so `stock` is always explainable by the ledger. (The seed data is
generated the same way and verified: `stock = sum(in) − sum(out)` for all rows.)

### 2. `last_movement_at` is derived, not denormalised

The products query computes it with a correlated subquery:

```sql
(SELECT max(m.created_at) FROM stock_movements m WHERE m.product_id = p.id)
```

**Why:** there is no second place to keep in sync, so it cannot drift after a
failed write, a manual SQL fix, or a future consumer of the ledger. It is cheap
here because `stock_movements` has an index on `(product_id, created_at DESC)`.
If the products table grew far beyond this scale I would switch to a
`last_movement_at` column maintained by a trigger (or a materialised view)
rather than accept the per-row subquery.

### 3. Money is an integer, always

`price`, `unit_price` and `total` are `INTEGER` IDR. The total is computed in
SQL/Go from the products table; the client cannot send prices, so it cannot
influence the total.

### 4. Validation is layered, and the UI mirrors it

1. **Shape** (400): customer/name/sku presence, `qty > 0`, duplicate SKUs,
   empty items, integer price ≥ 0. Runs before any query that writes.
2. **Reference** (400): unknown SKU, inactive product — checked inside the
   transaction but before any stock change.
3. **Availability** (409): `INSUFFICIENT_STOCK` with `sku` + `available`.

The frontend repeats the cheap checks for instant feedback, but it never treats
them as authoritative — every server error is rendered. In particular the 409
from the database is shown **in the modal / on the order line**, never only in
the console.

### 5. Idempotency (bonus)

`POST /api/orders` accepts `Idempotency-Key`. The key + a SHA-256 of the
canonical payload are inserted in the **same transaction** as the order:

- same key + same payload → returns the original order (201, `Idempotent-Replayed: true`)
- same key + different payload → 409 `IDEMPOTENCY_KEY_REUSED`
- key still in flight → 409 `IDEMPOTENCY_IN_PROGRESS`

The frontend generates one key per distinct payload, so a double-click or a
network retry cannot double-order.

### 6. Frontend architecture

- `src/api/types.ts` — the domain contract in one module; no `any` on domain data.
- `src/api/client.ts` — **the only** module that calls `fetch`. It builds URLs,
  parses the error envelope into a typed `ApiError` (with `code`, `sku`,
  `available`, `fields`, `details`) and exposes one function per endpoint.
  Components never construct URLs.
- `src/lib/*` — pure formatting and validation, unit tested.
- `src/hooks/useApi.ts` — loading/error/retry with stale-while-revalidate, so
  typing in the search box does not blank the table.
- Loading, empty and error states are all implemented and reachable:
  skeletons while fetching, a filtered empty state with "Clear filters", and an
  error state with **Retry** (which refetches the table *and* the summary cards).
  Stop the backend to see it.

### 7. Extensions beyond the required contract

Kept deliberately small, and all additive:

- `status=` filter on the products list (the UI filters **server-side**, so
  pagination and totals stay correct instead of filtering one page in the browser).
- `GET /api/products/{id}`, `GET /api/products/summary`, `GET /api/orders`.
- `product_name` and `subtotal` on order items (read-only joins).
- `GET /api/reports/daily-sales` + a "Today's sales" card.
- Idempotency-Key, nginx-proxied frontend, skeleton rows, `useDebounce`.

`PUT /api/products/{id}` intentionally ignores `stock`: allowing stock edits
there would create stock changes with no movement row and break the ledger.

---

## Seed data

16 realistic products (including inactive and zero-stock items), 4 weeks of
movements and 3 sample orders — one of them cancelled, so both statuses and the
restore path are visible immediately. Low-stock count is 7, which makes the
"Low stock" filter non-trivial.

## Repository layout

```
stockflow/
├── backend/
│   ├── cmd/api/main.go            # config, pool with retry, graceful shutdown
│   ├── internal/api/              # routing, middleware, validation, error envelope
│   ├── internal/store/            # all SQL + domain errors (+ tests)
│   ├── migrations/                # 0001_schema.sql, 0002_seed.sql
│   └── Dockerfile
├── frontend/
│   ├── src/api/                   # types + the single API client
│   ├── src/components/            # modals, table bits, badges, feedback
│   ├── src/pages/                 # products, orders, order detail, new order
│   ├── src/lib/                   # formatting + validation (+ tests)
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml
├── Makefile
└── README.md
```

## What I would improve next

- **Auth & roles** — the API is currently open; a warehouse app needs at least
  an operator identity on every movement.
- **Optimistic concurrency for edits** — `PUT /api/products/{id}` is last-write-wins.
  An `updated_at` + `If-Match` (or a version column) would stop two supervisors
  from silently overwriting each other.
- **Migrations as a first-class step** — the initdb scripts are perfect for a
  demo but not for evolving production data; I would move to `golang-migrate`
  run by a one-shot compose service.
- **Order cancellation window** — currently any `CREATED` order can be cancelled
  forever. Real ERPs usually restrict this (e.g. same day, or require a reason).
- **Pagination for movements** — the history endpoint returns everything; fine at
  this size, not at 100k rows.
- **More frontend tests** — add React Testing Library coverage for the two
  critical interactions (409 in the stock modal, 409 highlighting an order line).
- **Observability** — request IDs in logs and a `/metrics` endpoint.

## Time spent

Roughly **7 focused hours**, in this order: schema + seed (1h), Go API and the
concurrency-safe order path (2.5h), backend tests (1h), React UI (2h),
Docker/README/verification (0.5h).

**AI assistance:** this implementation was produced with AI assistance in a
single session, per the recruiter's confirmation that tooling is allowed. Every
decision above is documented so it can be defended and changed in review.

---

## Git history

Meaningful commits per layer, not one dump:

```
chore: scaffold repo layout, compose stack and database schema
feat(db): seed 16 products, three orders and a consistent ledger
feat(backend): Go API for products, stock and orders
test(backend): store tests for data safety
feat(frontend): React + TypeScript UI for products, stock and orders
chore(frontend): production build served by nginx with /api proxy
docs: README with run steps, API contract and design decisions
```
