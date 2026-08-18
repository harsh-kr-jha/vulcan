from functools import lru_cache

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password

from apps.tenancy.models import EmailIdentity, normalize_login_email


@lru_cache(maxsize=1)
def _dummy_password_hash() -> str:
    """Return a real hash so unknown identities take the password-check path."""
    return make_password("vulcan-enumeration-resistance-placeholder")


class EmailIdentityBackend:
    """Authenticate the unique normalized identity, never the non-unique User.email field."""

    def authenticate(self, request, email=None, password=None, username=None, **kwargs):
        normalized_email = normalize_login_email(email or username)
        identity = (
            EmailIdentity.objects.select_related("user")
            .filter(email=normalized_email)
            .first()
            if normalized_email
            else None
        )
        user = identity.user if identity else None
        if user is not None and user.has_usable_password():
            # AbstractBaseUser supplies a setter that upgrades legacy hashes to
            # the preferred hasher after a successful verification.
            password_matches = user.check_password(str(password or ""))
        else:
            password_matches = check_password(str(password or ""), _dummy_password_hash())
        if user is None or not password_matches or not user.is_active:
            return None
        return user

    def get_user(self, user_id):
        user_model = get_user_model()
        try:
            user = user_model._default_manager.get(pk=user_id)
        except user_model.DoesNotExist:
            return None
        return user if user.is_active else None
