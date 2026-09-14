from rest_framework.authentication import BaseAuthentication, SessionAuthentication


class SessionAuthentication401(SessionAuthentication):
    """Use normal Django sessions while correctly signalling an absent session as 401."""

    def authenticate_header(self, request):
        return "Session"


class WorkspaceFallbackAuthentication(BaseAuthentication):
    """Authenticate unauthenticated requests using the default workspace identity."""

    def authenticate(self, request):
        django_request = getattr(request, "_request", request)
        django_user = getattr(django_request, "user", None)
        if django_user and django_user.is_authenticated:
            return (django_user, None)
        from apps.common.permissions import get_or_create_default_membership

        membership = get_or_create_default_membership()
        request._vulcan_membership = membership
        return (membership.user, None)
