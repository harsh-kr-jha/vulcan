import json
import logging
import re

import pytest
from apps.common.middleware import RequestIdMiddleware
from apps.common.observability import JsonFormatter, SafeLogFilter
from django.http import HttpResponse
from django.test import Client, RequestFactory

REQUEST_ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")


def test_request_ids_are_unique_server_generated_and_attached_to_request():
    observed = {}

    def view(request):
        observed["request_id"] = request.request_id
        return HttpResponse()

    middleware = RequestIdMiddleware(view)
    response = middleware(
        RequestFactory().get("/", HTTP_X_REQUEST_ID="caller-controlled-value")
    )
    first_id = response["X-Request-ID"]
    second_id = Client().get("/api/auth/csrf/")["X-Request-ID"]

    assert REQUEST_ID_PATTERN.fullmatch(first_id)
    assert REQUEST_ID_PATTERN.fullmatch(second_id)
    assert first_id != second_id
    assert first_id != "caller-controlled-value"
    assert observed["request_id"] == first_id


def test_safe_logging_filter_redacts_sensitive_values():
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg=(
            "password=%s token=%s secret=%s\n"
            "Authorization: Bearer auth-value\nCookie: sessionid=cookie-value"
        ),
        args=("password-value", "token-value", "secret-value"),
        exc_info=None,
    )

    assert SafeLogFilter().filter(record)
    rendered = record.getMessage()

    for sensitive_value in (
        "password-value",
        "token-value",
        "secret-value",
        "auth-value",
        "cookie-value",
    ):
        assert sensitive_value not in rendered
    assert rendered.count("[REDACTED]") == 5


def test_json_formatter_emits_stable_production_fields():
    record = logging.LogRecord(
        name="vulcan.test",
        level=logging.WARNING,
        pathname=__file__,
        lineno=1,
        msg="safe message",
        args=(),
        exc_info=None,
    )
    SafeLogFilter().filter(record)

    payload = json.loads(JsonFormatter().format(record))

    assert set(payload) == {"timestamp", "level", "logger", "message", "request_id"}
    assert payload["level"] == "WARNING"
    assert payload["logger"] == "vulcan.test"
    assert payload["message"] == "safe message"
    assert payload["request_id"] == "-"
    assert payload["timestamp"].endswith("Z")


@pytest.mark.django_db
def test_failed_sign_in_log_contains_only_fingerprint_and_safe_event(caplog):
    supplied_email = "private-login-address@example.com"
    supplied_password = "Never-Log-This-Password-2026!"
    client = Client(enforce_csrf_checks=True, REMOTE_ADDR="198.51.100.42")
    csrf_token = client.get("/api/auth/csrf/").json()["csrfToken"]

    with caplog.at_level(logging.WARNING, logger="vulcan.security.authentication"):
        response = client.post(
            "/api/auth/login/",
            data=json.dumps({"email": supplied_email, "password": supplied_password}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )

    assert response.status_code == 401
    record = next(
        item for item in caplog.records if getattr(item, "event", None) == "auth.login.failed"
    )
    serialized_record = json.dumps(record.__dict__, default=str)
    assert supplied_email not in serialized_record
    assert supplied_password not in serialized_record
    assert re.fullmatch(r"[0-9a-f]{24}", record.account_fingerprint)
    assert record.client_ip == "198.51.100.42"
    assert record.request_id == response["X-Request-ID"]
