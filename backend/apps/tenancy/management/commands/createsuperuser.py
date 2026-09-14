import getpass
import os

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.db import transaction

from apps.tenancy.models import EmailIdentity, normalize_login_email


class Command(BaseCommand):
    help = "Create an administrator with a unique email login identity."
    requires_migrations_checks = True

    def add_arguments(self, parser):
        parser.add_argument("--username")
        parser.add_argument("--email")
        parser.add_argument(
            "--noinput",
            "--no-input",
            action="store_false",
            dest="interactive",
            help="Read credentials from DJANGO_SUPERUSER_* environment variables.",
        )

    def handle(self, *args, **options):
        interactive = options.get("interactive", True)
        email = options.get("email") or os.getenv("DJANGO_SUPERUSER_EMAIL", "")
        username = options.get("username") or os.getenv("DJANGO_SUPERUSER_USERNAME", "")
        if interactive:
            email = email or input("Email address: ").strip()
            username = username or input("Internal username [admin]: ").strip() or "admin"
            password = getpass.getpass("Password: ")
            confirmation = getpass.getpass("Password (again): ")
            if password != confirmation:
                raise CommandError("The two password fields did not match.")
        else:
            password = os.getenv("DJANGO_SUPERUSER_PASSWORD", "")

        if not email or not username or not password:
            raise CommandError(
                "Email, internal username, and password are required. For --noinput, set "
                "DJANGO_SUPERUSER_EMAIL, DJANGO_SUPERUSER_USERNAME, and "
                "DJANGO_SUPERUSER_PASSWORD."
            )
        self.create_administrator(email=email, username=username, password=password)
        self.stdout.write(self.style.SUCCESS("Administrator email login created."))

    @transaction.atomic
    def create_administrator(self, *, email, username, password):
        user_model = get_user_model()
        email = normalize_login_email(email)
        try:
            validate_email(email)
        except ValidationError as exc:
            raise CommandError("Enter a valid administrator email address.") from exc
        if (
            EmailIdentity.objects.filter(email=email).exists()
            or user_model.objects.filter(email__iexact=email).exists()
        ):
            raise CommandError("An account already uses that email address.")
        if user_model.objects.filter(username=username).exists():
            raise CommandError("An account already uses that internal username.")

        username_field = user_model._meta.get_field(user_model.USERNAME_FIELD)
        try:
            username = username_field.clean(username, None)
            candidate = user_model(username=username, email=email, is_staff=True, is_superuser=True)
            validate_password(password, user=candidate)
        except ValidationError as exc:
            raise CommandError(" ".join(exc.messages)) from exc

        user = user_model._default_manager.create_superuser(
            username=username,
            email=email,
            password=password,
        )
        EmailIdentity.objects.create(user=user, email=email)
        return user
