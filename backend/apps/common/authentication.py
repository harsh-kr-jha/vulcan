from rest_framework.authentication import SessionAuthentication


class SessionAuthentication401(SessionAuthentication):
    """Use normal Django sessions while correctly signalling an absent session as 401."""

    def authenticate_header(self, request):
        return "Session"
