from collections.abc import Mapping

from django.conf import settings
from django.core.cache import cache
from django.utils.crypto import salted_hmac
from rest_framework.throttling import BaseThrottle

from apps.tenancy.models import normalize_login_email


class FixedWindowLoginThrottle(BaseThrottle):
    """Atomic fixed-window throttle backed by the configured shared Django cache."""

    scope = ""
    cache_prefix = "auth-login"

    def __init__(self):
        self.duration = 0

    def identifier(self, request) -> str:
        raise NotImplementedError

    def allow_request(self, request, view):
        rate = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"][self.scope]
        request_limit, self.duration = self.parse_rate(rate)
        identifier = self.identifier(request)
        digest = salted_hmac(
            f"{self.cache_prefix}:{self.scope}",
            identifier,
            secret=settings.SECRET_KEY,
        ).hexdigest()
        self.cache_key = f"{self.cache_prefix}:{self.scope}:{digest}"

        if cache.add(self.cache_key, 1, timeout=self.duration):
            return True
        try:
            request_count = cache.incr(self.cache_key)
        except ValueError:
            # The window expired between add() and incr(); begin a new one.
            cache.set(self.cache_key, 1, timeout=self.duration)
            return True
        return request_count <= request_limit

    def wait(self):
        return self.duration or None

    @staticmethod
    def parse_rate(rate: str) -> tuple[int, int]:
        count, period = rate.split("/", 1)
        period = period.strip().lower()
        unit_seconds = {"s": 1, "m": 60, "h": 3600, "d": 86_400}[period[-1]]
        multiplier = int(period[:-1] or "1")
        return int(count), multiplier * unit_seconds

    @classmethod
    def key_for(cls, request, identifier: str) -> str:
        digest = salted_hmac(
            f"{cls.cache_prefix}:{cls.scope}",
            identifier,
            secret=settings.SECRET_KEY,
        ).hexdigest()
        return f"{cls.cache_prefix}:{cls.scope}:{digest}"


class LoginIPThrottle(FixedWindowLoginThrottle):
    scope = "login_ip"

    def identifier(self, request) -> str:
        return self.get_ident(request)


class LoginAccountThrottle(FixedWindowLoginThrottle):
    scope = "login_account"

    def identifier(self, request) -> str:
        email = request.data.get("email", "") if isinstance(request.data, Mapping) else ""
        return normalize_login_email(email) or "invalid-email"


def clear_login_account_throttle(request, email: str) -> None:
    """Clear only the successful identity's bucket; retain the anti-spray IP ceiling."""
    cache.delete(
        LoginAccountThrottle.key_for(
            request,
            normalize_login_email(email) or "invalid-email",
        )
    )
