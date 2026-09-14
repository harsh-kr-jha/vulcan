import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from django.conf import settings

from apps.streams.crypto import decrypt_secret


class StreamClientError(RuntimeError):
    pass


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def validate_base_url(value: str) -> str:
    value = value.strip().rstrip("/")
    parsed = urlsplit(value)
    allowed_schemes = {"https"} | ({"http"} if settings.DEBUG else set())
    if (
        parsed.scheme not in allowed_schemes
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise StreamClientError(
            "Enter a valid stream URL using an allowed scheme and no embedded credentials."
        )
    if parsed.query or parsed.fragment:
        raise StreamClientError("The stream base URL cannot contain a query or fragment.")
    return value


def request_json(stream, path: str, *, method: str = "GET", payload=None, query=None):
    if not path.startswith("/") or path.startswith("//"):
        raise StreamClientError("The stream endpoint path is invalid.")
    base_url = validate_base_url(stream.base_url)
    url = urljoin(f"{base_url}/", path.lstrip("/"))
    if query:
        url = f"{url}?{urlencode(query)}"
    try:
        credential = stream.credential
    except Exception as exc:
        raise StreamClientError("The stream has no active credential.") from exc
    if credential.revoked_at:
        raise StreamClientError("The stream credential has been revoked.")
    try:
        secret = decrypt_secret(credential.encrypted_secret)
    except ValueError as exc:
        raise StreamClientError("The stream credential cannot be decrypted.") from exc
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(
        url,
        data=data,
        method=method,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {secret}",
        },
    )
    try:
        with build_opener(_NoRedirect).open(request, timeout=10) as response:
            raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise StreamClientError("The stream response exceeded 2 MB.")
            result = json.loads(raw.decode("utf-8"))
            if not isinstance(result, dict):
                raise StreamClientError("The stream response must be a JSON object.")
            return result
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise StreamClientError(f"The stream request failed: {exc}") from exc


def valid_control_action(action: str) -> bool:
    return bool(re.fullmatch(r"[a-z][a-z0-9_-]{0,39}", action))
