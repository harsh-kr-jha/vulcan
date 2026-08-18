import os

# Test runs must never inherit production connectivity from a developer shell
# or CI secret context. Import the base settings in explicit debug mode, then
# replace every stateful service with a process-local implementation.
os.environ.update(
    {
        "DJANGO_DEBUG": "true",
        "DJANGO_ALLOWED_HOSTS": "localhost,127.0.0.1,testserver",
        "DJANGO_DATABASE_URL": "sqlite:///:memory:",
        "DJANGO_CACHE_URL": "",
        "REDIS_URL": "",
        "CELERY_TASK_ALWAYS_EAGER": "true",
        "DJANGO_NUM_PROXIES": "0",
        "LOGIN_IP_RATE": "10/15m",
        "LOGIN_ACCOUNT_RATE": "5/15m",
    }
)

from config.settings import *  # noqa: F403, E402

SECRET_KEY = "test-only-vulcan-secret-key-not-for-any-deployment"
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "vulcan-isolated-test-cache",
    }
}
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
