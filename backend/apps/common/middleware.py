import secrets

from django.utils.cache import patch_vary_headers

from apps.common.observability import bind_request_id, reset_request_id


class RequestIdMiddleware:
    """Create a trusted correlation ID for each request and its log records."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # An inbound header is deliberately ignored: external callers must not
        # be able to forge correlation data used by internal logs.
        request_id = secrets.token_hex(16)
        request.request_id = request_id
        context_token = bind_request_id(request_id)
        try:
            response = self.get_response(request)
            response["X-Request-ID"] = request_id
            return response
        finally:
            reset_request_id(context_token)


class PrivateApiResponseMiddleware:
    """Prevent browsers and intermediaries from retaining personalized API responses."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/api/"):
            response["Cache-Control"] = "private, no-store"
            response["Pragma"] = "no-cache"
            patch_vary_headers(response, ("Cookie",))
        return response
