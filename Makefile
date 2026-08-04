.PHONY: dev build test lint migrate seed

dev:
	npm run dev

build:
	npm run build

test:
	.venv/bin/pytest

lint:
	npm run lint
	npm run typecheck
	.venv/bin/ruff check backend processing

migrate:
	.venv/bin/python backend/manage.py migrate

seed:
	.venv/bin/python backend/manage.py seed_mypol
