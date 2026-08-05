import os
import subprocess
import sys
from pathlib import Path

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
REQUIRED_PRODUCTION_ENV = {
    "DJANGO_DEBUG": "false",
    "DJANGO_SECRET_KEY": "K8x4qP2vN7mR5cT9zL3wS6hY1dF0gJ8bQ4eU7iO2aC5nM9pV6rX3kH9s",
    "DJANGO_ALLOWED_HOSTS": "app.example.com",
    "DJANGO_DATABASE_URL": "postgresql://vulcan:test@localhost:5432/vulcan",
    "DJANGO_CSRF_TRUSTED_ORIGINS": "https://app.example.com",
    "CORS_ALLOWED_ORIGINS": "",
    "REDIS_URL": "redis://localhost:6379/0",
    "DJANGO_CACHE_URL": "redis://localhost:6379/1",
    "CELERY_TASK_ALWAYS_EAGER": "false",
    "DJANGO_NUM_PROXIES": "0",
    "DJANGO_TRUST_PROXY_HEADERS": "false",
    "DJANGO_USE_X_FORWARDED_HOST": "false",
}


def import_production_settings(*, remove=(), override=None):
    environment = os.environ.copy()
    for key in REQUIRED_PRODUCTION_ENV:
        environment.pop(key, None)
    environment.update(REQUIRED_PRODUCTION_ENV)
    for key in remove:
        environment.pop(key, None)
    environment.update(override or {})
    environment["PYTHONPATH"] = os.pathsep.join(
        [str(REPOSITORY_ROOT / "backend"), str(REPOSITORY_ROOT)]
    )
    return subprocess.run(
        [sys.executable, "-c", "import config.settings"],
        cwd=REPOSITORY_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )


@pytest.mark.parametrize(
    ("remove", "override", "expected_message"),
    [
        (("DJANGO_SECRET_KEY",), None, "DJANGO_SECRET_KEY is required"),
        ((), {"DJANGO_SECRET_KEY": "too-short"}, "long, random production secret"),
        ((), {"DJANGO_ALLOWED_HOSTS": "*.example.com"}, "exact hostnames"),
        (("DJANGO_DATABASE_URL",), None, "DJANGO_DATABASE_URL is required"),
        ((), {"DJANGO_DATABASE_URL": "sqlite:////tmp/vulcan.sqlite3"}, "use PostgreSQL"),
        (
            ("DJANGO_CSRF_TRUSTED_ORIGINS",),
            None,
            "DJANGO_CSRF_TRUSTED_ORIGINS must contain",
        ),
        (
            (),
            {"DJANGO_CSRF_TRUSTED_ORIGINS": "http://app.example.com"},
            "only exact HTTPS origins",
        ),
        (
            (),
            {"CORS_ALLOWED_ORIGINS": "http://app.example.com"},
            "CORS_ALLOWED_ORIGINS must be empty",
        ),
        (("REDIS_URL",), None, "REDIS_URL and DJANGO_CACHE_URL are required"),
        (("DJANGO_CACHE_URL",), None, "REDIS_URL and DJANGO_CACHE_URL are required"),
        ((), {"CELERY_TASK_ALWAYS_EAGER": "true"}, "must be false"),
        ((), {"DJANGO_NUM_PROXIES": "-1"}, "must be zero or greater"),
        (
            (),
            {"DJANGO_USE_X_FORWARDED_HOST": "true"},
            "requires DJANGO_TRUST_PROXY_HEADERS=true",
        ),
    ],
)
def test_production_settings_fail_closed(remove, override, expected_message):
    result = import_production_settings(remove=remove, override=override)

    assert result.returncode != 0
    assert expected_message in result.stderr


def test_complete_explicit_production_settings_import_successfully():
    result = import_production_settings()

    assert result.returncode == 0, result.stderr


def test_production_url_configuration_does_not_expose_django_admin():
    environment = os.environ.copy()
    for key in REQUIRED_PRODUCTION_ENV:
        environment.pop(key, None)
    environment.update(REQUIRED_PRODUCTION_ENV)
    environment["DJANGO_SETTINGS_MODULE"] = "config.settings"
    environment["PYTHONPATH"] = os.pathsep.join(
        [str(REPOSITORY_ROOT / "backend"), str(REPOSITORY_ROOT)]
    )
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import django; django.setup(); "
                "from django.urls import resolve, Resolver404; "
                "\ntry:\n resolve('/admin/login/')\nexcept Resolver404:\n raise SystemExit(0)"
                "\nraise SystemExit(1)"
            ),
        ],
        cwd=REPOSITORY_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr


def test_debug_defaults_to_fail_closed_production_mode():
    result = import_production_settings(remove=("DJANGO_DEBUG",))

    assert result.returncode == 0, result.stderr
