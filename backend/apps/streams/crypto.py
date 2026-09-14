import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def _fernet() -> Fernet:
    raw = settings.DATA_STREAM_CREDENTIAL_KEY or settings.SECRET_KEY
    key = base64.urlsafe_b64encode(hashlib.sha256(raw.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("The stored data-stream credential cannot be decrypted.") from exc
