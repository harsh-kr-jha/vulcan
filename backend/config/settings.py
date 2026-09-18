import os
from pathlib import Path
from urllib.parse import urlsplit

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
REPOSITORY_ROOT = BASE_DIR.parent


def environment_boolean(name: str, *, default: bool = False) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    value = raw_value.strip().lower()
    if value not in {"true", "false"}:
        raise ImproperlyConfigured(f"{name} must be either 'true' or 'false'.")
    return value == "true"


def secure_origin(origin: str) -> bool:
    parsed = urlsplit(origin)
    return (
        parsed.scheme == "https"
        and bool(parsed.hostname)
        and not parsed.username
        and not parsed.password
        and not parsed.path
        and not parsed.query
        and not parsed.fragment
        and "*" not in origin
    )


def redis_location(location: str) -> bool:
    parsed = urlsplit(location)
    if parsed.scheme in {"redis", "rediss"}:
        return bool(parsed.hostname)
    return parsed.scheme == "unix" and bool(parsed.path)


DEBUG = environment_boolean("DJANGO_DEBUG", default=False)
SINGLE_NODE = environment_boolean("VULCAN_SINGLE_NODE", default=False)
ADMIN_ENABLED = environment_boolean("VULCAN_ADMIN_ENABLED", default=False)
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY is required when DJANGO_DEBUG is false.")
    SECRET_KEY = "unsafe-local-development-key"
if not DEBUG and (
    len(SECRET_KEY) < 50
    or len(set(SECRET_KEY)) < 5
    or SECRET_KEY.startswith("django-insecure-")
):
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be a long, random production secret.")

allowed_hosts_value = os.getenv(
    "DJANGO_ALLOWED_HOSTS",
    "localhost,127.0.0.1,testserver" if DEBUG else "",
)
ALLOWED_HOSTS = [host.strip() for host in allowed_hosts_value.split(",") if host.strip()]
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must contain at least one explicit host.")
if any(
    "*" in host or host.startswith(".") or "://" in host or "/" in host
    for host in ALLOWED_HOSTS
):
    raise ImproperlyConfigured(
        "DJANGO_ALLOWED_HOSTS must contain exact hostnames, not wildcards or URLs."
    )

INSTALLED_APPS = [
    # Keep tenancy before django.contrib.auth so its email-aware
    # createsuperuser command safely overrides Django's username-only command.
    "apps.tenancy",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "apps.operations",
    "apps.analytics",
    "apps.ml",
    "apps.alerts",
    "apps.audit",
    "apps.spatial",
    "apps.streams",
]

MIDDLEWARE = [
    "apps.common.middleware.RequestIdMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.common.middleware.PrivateApiResponseMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

database_url = os.getenv("DJANGO_DATABASE_URL", "")
if not database_url and not DEBUG:
    raise ImproperlyConfigured("DJANGO_DATABASE_URL is required when DJANGO_DEBUG is false.")

# In development, isolate PostgreSQL databases per git branch. SQLite remains
# available only through settings_test.py; concurrent app workers require PostgreSQL.
if not database_url and DEBUG:
    import re
    import subprocess

    try:
        _branch = (
            subprocess.check_output(
                ["git", "branch", "--show-current"],
                cwd=str(BASE_DIR.parent),
                stderr=subprocess.DEVNULL,
            )
            .decode()
            .strip()
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        _branch = "default"
    _db_name = re.sub(r"[^a-z0-9]+", "_", _branch.lower()).strip("_") or "default"
    database_url = f"postgresql:///vulcan_{_db_name}"

DATABASES = {
    "default": dj_database_url.config(
        env="DJANGO_DATABASE_URL",
        default=database_url or f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=60,
    )
}
if DATABASES["default"]["ENGINE"] == "django.db.backends.sqlite3":
    # The stream poller, observation worker and web process can briefly contend
    # for the development database. Wait for the writer instead of immediately
    # surfacing a transient "database is locked" observation error.
    DATABASES["default"].setdefault("OPTIONS", {})["timeout"] = 20
if not DEBUG and DATABASES["default"]["ENGINE"] != "django.db.backends.postgresql":
    raise ImproperlyConfigured(
        "DJANGO_DATABASE_URL must use PostgreSQL outside isolated tests."
    )

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 15},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

AUTHENTICATION_BACKENDS = ["apps.tenancy.authentication.EmailIdentityBackend"]
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.ScryptPasswordHasher",
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
STATIC_ROOT = os.getenv("DJANGO_STATIC_ROOT", str(BASE_DIR / "staticfiles"))
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

num_proxies = int(os.getenv("DJANGO_NUM_PROXIES", "0"))
if num_proxies < 0:
    raise ImproperlyConfigured("DJANGO_NUM_PROXIES must be zero or greater.")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.common.authentication.SessionAuthentication401",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.LimitOffsetPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/hour",
        "user": "1200/hour",
        "login_ip": os.getenv("LOGIN_IP_RATE", "30/15m"),
        "login_account": os.getenv("LOGIN_ACCOUNT_RATE", "10/15m"),
    },
    "NUM_PROXIES": num_proxies,
}

local_frontend_origins = (
    "http://localhost:3000,http://127.0.0.1:3000,"
    "http://localhost:3100,http://127.0.0.1:3100"
)
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOWED_ORIGINS", local_frontend_origins if DEBUG else ""
    ).split(",")
    if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "DJANGO_CSRF_TRUSTED_ORIGINS", local_frontend_origins if DEBUG else ""
    ).split(",")
    if origin.strip()
]
if not DEBUG:
    if not CSRF_TRUSTED_ORIGINS:
        raise ImproperlyConfigured(
            "DJANGO_CSRF_TRUSTED_ORIGINS must contain an exact HTTPS application origin."
        )
    if any(not secure_origin(origin) for origin in CSRF_TRUSTED_ORIGINS):
        raise ImproperlyConfigured(
            "DJANGO_CSRF_TRUSTED_ORIGINS must contain only exact HTTPS origins."
        )
    if any(not secure_origin(origin) for origin in CORS_ALLOWED_ORIGINS):
        raise ImproperlyConfigured(
            "CORS_ALLOWED_ORIGINS must be empty or contain only exact HTTPS origins in production."
        )

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = int(os.getenv("SESSION_COOKIE_AGE_SECONDS", str(8 * 60 * 60)))
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
SESSION_SAVE_EVERY_REQUEST = False
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_HEADER_NAME = "HTTP_X_CSRFTOKEN"

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0" if DEBUG else "")
cache_url = os.getenv("DJANGO_CACHE_URL", "")
if not DEBUG and not SINGLE_NODE and (not REDIS_URL or not cache_url):
    raise ImproperlyConfigured(
        "REDIS_URL and DJANGO_CACHE_URL are required when DJANGO_DEBUG is false."
    )
if (
    not DEBUG
    and not SINGLE_NODE
    and any(not redis_location(url) for url in (REDIS_URL, cache_url))
):
    raise ImproperlyConfigured(
        "REDIS_URL and DJANGO_CACHE_URL must use redis://, rediss://, or unix://."
    )
if cache_url or (not DEBUG and not SINGLE_NODE):
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": cache_url or REDIS_URL,
            "KEY_PREFIX": "vulcan",
        }
    }
elif not DEBUG and SINGLE_NODE:
    # Keep potentially large workspace snapshots outside the web worker. The
    # cache is disposable and is regenerated from SQLite after deployments or
    # invalidation; locating it beside the database also avoids container-layer
    # churn on the single-node showcase.
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.filebased.FileBasedCache",
            "LOCATION": os.getenv("DJANGO_FILE_CACHE_DIR", "/data/cache"),
            "OPTIONS": {"MAX_ENTRIES": 500, "CULL_FREQUENCY": 3},
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "vulcan-local-development",
        }
    }
WORKSPACE_CACHE_TTL = int(os.getenv("WORKSPACE_CACHE_TTL_SECONDS", "300"))
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_TASK_ALWAYS_EAGER = environment_boolean(
    "CELERY_TASK_ALWAYS_EAGER", default=DEBUG or SINGLE_NODE
)
if not DEBUG and CELERY_TASK_ALWAYS_EAGER:
    raise ImproperlyConfigured(
        "CELERY_TASK_ALWAYS_EAGER must be false outside debug mode."
    )
CELERY_TASK_EAGER_PROPAGATES = DEBUG
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_BROKER_TRANSPORT_OPTIONS = {
    "max_retries": 1,
    "socket_connect_timeout": 2,
    "socket_timeout": 5,
}
CELERY_TASK_ROUTES = {
    "apps.operations.tasks.inspect_upload": {"queue": "file_inspection"},
    "apps.operations.tasks.validate_upload": {"queue": "validation"},
    "apps.operations.tasks.standardise_upload": {"queue": "standardisation"},
    "apps.analytics.tasks.refresh_upload_analytics": {"queue": "analytics"},
}

DATA_STREAM_CREDENTIAL_KEY = os.getenv("DATA_STREAM_CREDENTIAL_KEY", SECRET_KEY)
DATA_STREAM_POLL_SECONDS = max(1, int(os.getenv("DATA_STREAM_POLL_SECONDS", "5")))
DATA_STREAM_RETENTION_DAYS = max(1, int(os.getenv("DATA_STREAM_RETENTION_DAYS", "30")))
STREAM_INGESTION_ENABLED = environment_boolean("STREAM_INGESTION_ENABLED", default=True)
TELEMETRY_ALLOW_SIMULATED_INPUTS = environment_boolean(
    "TELEMETRY_ALLOW_SIMULATED_INPUTS", default=DEBUG
)
TELEMETRY_HOT_STORAGE_ENABLED = environment_boolean(
    "TELEMETRY_HOT_STORAGE_ENABLED", default=False
)
TELEMETRY_ARCHIVE_ENABLED = environment_boolean("TELEMETRY_ARCHIVE_ENABLED", default=DEBUG)
ML_DATASETS_ENABLED = environment_boolean("ML_DATASETS_ENABLED", default=DEBUG)

# Telemetry object storage. Development uses the filesystem. Production can
# switch to any private S3-compatible service without changing pipeline code.
TELEMETRY_STORAGE_BACKEND = os.getenv("TELEMETRY_STORAGE_BACKEND", "filesystem")
TELEMETRY_STORAGE_ROOT = os.getenv(
    "TELEMETRY_STORAGE_ROOT", str(REPOSITORY_ROOT / ".data" / "telemetry")
)
TELEMETRY_STORAGE_BUCKET = os.getenv("TELEMETRY_STORAGE_BUCKET", "")
TELEMETRY_STORAGE_PREFIX = os.getenv("TELEMETRY_STORAGE_PREFIX", "telemetry")
TELEMETRY_STORAGE_ENDPOINT_URL = os.getenv("TELEMETRY_STORAGE_ENDPOINT_URL")
TELEMETRY_STORAGE_SSE = os.getenv("TELEMETRY_STORAGE_SSE", "AES256")
TELEMETRY_STORAGE_KMS_KEY_ID = os.getenv("TELEMETRY_STORAGE_KMS_KEY_ID", "")
TELEMETRY_LOCAL_FILE_MODE = int(os.getenv("TELEMETRY_LOCAL_FILE_MODE", "0o600"), 8)
TELEMETRY_BUFFER_DIR = os.getenv(
    "TELEMETRY_BUFFER_DIR", str(REPOSITORY_ROOT / ".data" / "telemetry-buffer")
)
TELEMETRY_PIPELINE_RETRIES = max(0, int(os.getenv("TELEMETRY_PIPELINE_RETRIES", "3")))
TELEMETRY_PIPELINE_RETRY_SECONDS = max(
    0.0, float(os.getenv("TELEMETRY_PIPELINE_RETRY_SECONDS", "0.25"))
)

# ClickHouse is deliberately optional. Compose enables it for the local
# telemetry profile; web workers and archival remain usable without it.
CLICKHOUSE_URL = os.getenv("CLICKHOUSE_URL", "http://127.0.0.1:8123")
CLICKHOUSE_DATABASE = os.getenv("CLICKHOUSE_DATABASE", "vulcan")
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "vulcan_ingest")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "")
CLICKHOUSE_VERIFY_TLS = environment_boolean("CLICKHOUSE_VERIFY_TLS", default=True)
CLICKHOUSE_RETENTION_DAYS = max(1, int(os.getenv("CLICKHOUSE_RETENTION_DAYS", "30")))
CLICKHOUSE_CONNECT_TIMEOUT_SECONDS = max(
    1, int(os.getenv("CLICKHOUSE_CONNECT_TIMEOUT_SECONDS", "5"))
)

if TELEMETRY_STORAGE_BACKEND not in {"filesystem", "s3"}:
    raise ImproperlyConfigured("TELEMETRY_STORAGE_BACKEND must be 'filesystem' or 's3'.")
if TELEMETRY_STORAGE_BACKEND == "s3" and not TELEMETRY_STORAGE_BUCKET:
    raise ImproperlyConfigured("TELEMETRY_STORAGE_BUCKET is required for S3 telemetry storage.")
if not DEBUG and TELEMETRY_HOT_STORAGE_ENABLED:
    if not CLICKHOUSE_PASSWORD:
        raise ImproperlyConfigured("CLICKHOUSE_PASSWORD is required when hot storage is enabled.")
    if urlsplit(CLICKHOUSE_URL).scheme != "https":
        raise ImproperlyConfigured("Production ClickHouse connections must use HTTPS.")

AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")
AWS_S3_BUCKET = os.getenv("AWS_S3_BUCKET", "")
AWS_S3_ENDPOINT_URL = os.getenv("AWS_S3_ENDPOINT_URL")
AWS_S3_PUBLIC_ENDPOINT_URL = os.getenv("AWS_S3_PUBLIC_ENDPOINT_URL", AWS_S3_ENDPOINT_URL)
ML_MODEL_SOURCE = os.getenv("ML_MODEL_SOURCE", "local")
ML_MODEL_DIR = os.getenv("ML_MODEL_DIR", str(REPOSITORY_ROOT / "models"))
ML_MODEL_UPLOAD_MAX_BYTES = max(
    1, int(os.getenv("ML_MODEL_UPLOAD_MAX_BYTES", str(100 * 1024 * 1024)))
)
ML_MODEL_BUCKET = os.getenv("ML_MODEL_BUCKET", AWS_S3_BUCKET)
ML_MODEL_PREFIX = os.getenv("ML_MODEL_PREFIX", "models")
ML_MODEL_ENDPOINT_URL = os.getenv("ML_MODEL_ENDPOINT_URL") or AWS_S3_ENDPOINT_URL
UPLOAD_URL_TTL_SECONDS = int(os.getenv("UPLOAD_URL_TTL_SECONDS", "900"))
MAX_EXCEL_UPLOAD_BYTES = int(os.getenv("MAX_EXCEL_UPLOAD_BYTES", str(50 * 1024 * 1024)))
MAX_CSV_UPLOAD_BYTES = int(os.getenv("MAX_CSV_UPLOAD_BYTES", str(500 * 1024 * 1024)))
MAX_SYNC_UPLOAD_BYTES = int(os.getenv("MAX_SYNC_UPLOAD_BYTES", str(10 * 1024 * 1024)))

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_NAME = "__Host-vulcan-session"
    CSRF_COOKIE_SECURE = True
    CSRF_COOKIE_NAME = "__Host-vulcan-csrf"
    SECURE_HSTS_SECONDS = 31_536_000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = environment_boolean("DJANGO_HSTS_INCLUDE_SUBDOMAINS")
    SECURE_HSTS_PRELOAD = environment_boolean("DJANGO_HSTS_PRELOAD")
    trust_proxy_headers = environment_boolean("DJANGO_TRUST_PROXY_HEADERS")
    use_forwarded_host = environment_boolean("DJANGO_USE_X_FORWARDED_HOST")
    if use_forwarded_host and not trust_proxy_headers:
        raise ImproperlyConfigured(
            "DJANGO_USE_X_FORWARDED_HOST requires DJANGO_TRUST_PROXY_HEADERS=true."
        )
    if trust_proxy_headers:
        SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    USE_X_FORWARDED_HOST = use_forwarded_host

    # These two deployment checks prescribe broad HSTS policies that are only
    # safe after every subdomain is HTTPS-only and the domain is preload-ready.
    # Silence only the explicitly declined opt-ins; every other warning remains fatal in CI.
    SILENCED_SYSTEM_CHECKS = []
    if not SECURE_HSTS_INCLUDE_SUBDOMAINS:
        SILENCED_SYSTEM_CHECKS.append("security.W005")
    if not SECURE_HSTS_PRELOAD:
        SILENCED_SYSTEM_CHECKS.append("security.W021")

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

LOG_LEVEL = os.getenv("DJANGO_LOG_LEVEL", "INFO").upper()
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "safe_context": {"()": "apps.common.observability.SafeLogFilter"},
    },
    "formatters": {
        "readable": {
            "()": "apps.common.observability.ReadableFormatter",
            "fmt": "%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s",
        },
        "json": {"()": "apps.common.observability.JsonFormatter"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
            "filters": ["safe_context"],
            "formatter": "readable" if DEBUG else "json",
        },
    },
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
        # SQL parameters routinely contain personal and authentication data.
        # Keep them out of stdout even when the application log level is DEBUG.
        "django.db.backends": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
        "vulcan.security.authentication": {
            "level": "WARNING",
            "propagate": True,
        },
    },
}
