.PHONY: up down reset logs test test-backend test-frontend

up:
	docker compose up --build

down:
	docker compose down

reset:
	docker compose down -v

logs:
	docker compose logs -f

# Backend tests need a real Postgres. They create a throw-away schema per test,
# so they never touch the seeded data.
test-backend:
	docker compose up -d db
	docker run --rm \
		--network stockflow_default \
		-v "$(PWD)/backend":/app -w /app \
		-e TEST_DATABASE_URL="postgres://stockflow:stockflow@db:5432/stockflow?sslmode=disable" \
		golang:1.24 go test -race ./...

test-frontend:
	cd frontend && npm ci && npm test

test: test-backend test-frontend
