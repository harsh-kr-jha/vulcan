# Tamaso Platform — Local Development
#
# Database isolation: each git branch gets its own SQLite file in .data/
# No VULCAN_VARIANT needed — each branch is self-contained.
#
# Usage:
#   make setup     — install deps, migrate, create superuser
#   make dev       — run backend + frontend (two processes)
#   make backend   — run backend only (with admin at /admin/)
#   make frontend  — run frontend only
#   make seed      — load demo data (branch-specific seed command)
#   make reset     — delete this branch's database and re-migrate
#   make test      — run Python tests
#   make lint      — run all linters

.PHONY: setup dev backend frontend seed reset test lint migrate superuser info

BRANCH := $(shell git branch --show-current 2>/dev/null || echo "default")
DB_NAME := $(subst /,-,$(BRANCH))
DB_PATH := .data/$(DB_NAME).sqlite3

export DJANGO_DEBUG=true
export VULCAN_ADMIN_ENABLED=true

# --- Primary commands ---

setup: ## Install dependencies, migrate, create admin superuser
	npm ci
	uv sync --frozen
	@mkdir -p .data
	.venv/bin/python backend/manage.py migrate
	@echo ""
	@echo "Creating superuser for admin panel (http://localhost:8000/admin/)"
	@echo "Database: $(DB_PATH)"
	.venv/bin/python backend/manage.py createsuperuser
	@echo ""
	@echo "Setup complete. Run 'make dev' to start."

dev: ## Run backend and frontend together
	@echo "Branch: $(BRANCH)"
	@echo "Database: $(DB_PATH)"
	@echo "Backend: http://localhost:8000 (admin: /admin/)"
	@echo "Frontend: http://localhost:3000"
	@echo ""
	@trap 'kill 0' EXIT; \
		.venv/bin/python backend/manage.py runserver & \
		npm run dev & \
		wait

backend: ## Run backend only (admin panel at /admin/)
	@echo "Branch: $(BRANCH) | DB: $(DB_PATH)"
	@echo "Admin: http://localhost:8000/admin/"
	.venv/bin/python backend/manage.py runserver

frontend: ## Run frontend only
	npm run dev

migrate: ## Apply database migrations
	.venv/bin/python backend/manage.py migrate

superuser: ## Create a new admin superuser
	.venv/bin/python backend/manage.py createsuperuser

seed: ## Load branch-specific demo data
	@if [ -f backend/apps/tenancy/management/commands/seed_infinexxgen.py ]; then \
		echo "Seeding INFINEXXGEN automotive data..."; \
		.venv/bin/python backend/manage.py seed_infinexxgen; \
	elif [ -f backend/apps/tenancy/management/commands/seed_mypol.py ]; then \
		echo "Seeding MyPol automotive data..."; \
		.venv/bin/python backend/manage.py seed_mypol --confirm-production-showcase; \
	elif [ -f backend/apps/tenancy/management/commands/seed_mushroom.py ]; then \
		echo "Seeding mushroom cultivation data..."; \
		.venv/bin/python backend/manage.py seed_mushroom --confirm-production-showcase; \
	else \
		echo "No seed command found on this branch (Platform Core has no seed data)."; \
	fi

reset: ## Delete this branch's database and re-migrate
	@echo "Deleting database: $(DB_PATH)"
	rm -f "$(DB_PATH)"
	.venv/bin/python backend/manage.py migrate
	@echo "Database reset. Run 'make superuser' to create admin login."

info: ## Show current branch and database info
	@echo "Branch:   $(BRANCH)"
	@echo "Database: $(DB_PATH)"
	@echo "Exists:   $(shell test -f '$(DB_PATH)' && echo 'yes' || echo 'no')"
	@echo ""
	@echo "All databases:"
	@ls -la .data/*.sqlite3 2>/dev/null || echo "  (none)"

# --- Quality ---

test: ## Run Python tests
	.venv/bin/pytest

lint: ## Run all linters
	npm run lint
	npm run typecheck
	.venv/bin/ruff check backend/ processing/

build: ## Build frontend for production
	npm run build
