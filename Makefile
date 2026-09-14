# Tamaso Platform — Local Development
#
# Database isolation: each git branch gets its own PostgreSQL database.
# No VULCAN_VARIANT needed — each branch is self-contained.
#
# Usage:
#   make setup     — install deps, migrate, create superuser
#   make dev       — run the complete local application and workers
#   make backend   — run backend only (with admin at /admin/)
#   make frontend  — run frontend only
#   make seed      — load demo data (branch-specific seed command)
#   make reset     — recreate this branch's PostgreSQL database
#   make test      — run Python tests
#   make lint      — run all linters

.PHONY: setup postgres-setup migrate-sqlite dev backend frontend seed reset test lint migrate superuser info

BRANCH := $(shell git branch --show-current 2>/dev/null || echo "default")
DB_NAME := $(subst /,-,$(BRANCH))
DB_PATH := .data/$(DB_NAME).sqlite3
PG_DB_NAME := vulcan_$(shell printf '%s' '$(BRANCH)' | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/_/g; s/^_+//; s/_+$$//')

export DJANGO_DEBUG=true
export VULCAN_ADMIN_ENABLED=true

# --- Primary commands ---

setup: ## Install dependencies, create PostgreSQL database, migrate, create admin
	npm ci
	uv sync --frozen
	$(MAKE) postgres-setup
	@echo ""
	@echo "Creating superuser for admin panel (http://localhost:8000/admin/)"
	@echo "Database: $(PG_DB_NAME)"
	.venv/bin/python backend/manage.py createsuperuser
	@echo ""
	@echo "Setup complete. Run 'make dev' to start."

postgres-setup: ## Create and migrate this branch's local PostgreSQL database
	@pg_isready -q || { echo "PostgreSQL is not running."; exit 1; }
	@psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$(PG_DB_NAME)'" | grep -q 1 || createdb "$(PG_DB_NAME)"
	.venv/bin/python backend/manage.py migrate

migrate-sqlite: postgres-setup ## Copy the legacy branch SQLite database into PostgreSQL
	@test -f "$(DB_PATH)" || { echo "Missing SQLite source: $(DB_PATH)"; exit 1; }
	.venv/bin/python backend/manage.py migrate_sqlite_to_postgres --source "$(DB_PATH)" --replace-target
	@echo "SQLite source retained at $(DB_PATH)"

dev: ## Run backend and frontend together
	@echo "Branch: $(BRANCH)"
	@echo "Database: $(PG_DB_NAME)"
	@echo "Backend: http://localhost:8000 (admin: /admin/)"
	@echo "Frontend: http://localhost:3000"
	@echo ""
	@trap 'kill 0' EXIT; \
		.venv/bin/python backend/manage.py runserver & \
		.venv/bin/python backend/manage.py poll_data_streams & \
		OMP_NUM_THREADS=1 .venv/bin/python backend/manage.py observe_machines & \
		npm run dev & \
		wait

backend: ## Run backend only (admin panel at /admin/)
	@echo "Branch: $(BRANCH) | DB: $(PG_DB_NAME)"
	@echo "Admin: http://localhost:8000/admin/"
	.venv/bin/python backend/manage.py runserver

frontend: ## Run frontend only
	npm run dev

migrate: ## Apply database migrations
	.venv/bin/python backend/manage.py migrate

superuser: ## Create a new admin superuser
	.venv/bin/python backend/manage.py createsuperuser

seed: ## Load branch-specific demo data
	@if [ -f backend/apps/tenancy/management/commands/seed_mypol.py ]; then \
		echo "Seeding MyPol automotive data..."; \
		.venv/bin/python backend/manage.py seed_mypol --confirm-production-showcase; \
	elif [ -f backend/apps/tenancy/management/commands/seed_mushroom.py ]; then \
		echo "Seeding mushroom cultivation data..."; \
		.venv/bin/python backend/manage.py seed_mushroom --confirm-production-showcase; \
	else \
		echo "No seed command found on this branch (Platform Core has no seed data)."; \
	fi

reset: ## Recreate this branch's PostgreSQL database
	dropdb --if-exists "$(PG_DB_NAME)"
	createdb "$(PG_DB_NAME)"
	.venv/bin/python backend/manage.py migrate
	@echo "Database reset. Run 'make superuser' to create admin login."

info: ## Show current branch and database info
	@echo "Branch:   $(BRANCH)"
	@echo "PostgreSQL database: $(PG_DB_NAME)"
	@psql -d postgres -tAc "SELECT datname FROM pg_database WHERE datname='$(PG_DB_NAME)'"
	@echo "Legacy SQLite: $(DB_PATH)"

# --- Quality ---

test: ## Run Python tests
	.venv/bin/pytest

lint: ## Run all linters
	npm run lint
	npm run typecheck
	.venv/bin/ruff check backend/ processing/

build: ## Build frontend for production
	npm run build
