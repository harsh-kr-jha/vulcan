import getpass
import secrets

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction

from apps.tenancy.models import (
    EmailIdentity,
    Membership,
    Role,
    Tenant,
    normalize_login_email,
)


class Command(BaseCommand):
    help = "Create an email login and membership for a single-node variant showcase."
    requires_migrations_checks = True

    def add_arguments(self, parser):
        parser.add_argument("--email")
        parser.add_argument("--name")
        parser.add_argument("--tenant-slug")
        parser.add_argument(
            "--role",
            choices=[value for value, _label in Role.choices],
            default=Role.EXECUTIVE,
            help="Workspace role; defaults to the read-only executive role.",
        )

    def handle(self, *args, **options):
        if not settings.SINGLE_NODE:
            raise CommandError(
                "create_showcase_user is restricted to an explicitly configured single-node "
                "showcase."
            )

        email = options.get("email") or input("Email address: ").strip()
        name = options.get("name") or input("Display name: ").strip()
        password = getpass.getpass("Password: ")
        confirmation = getpass.getpass("Password (again): ")
        if password != confirmation:
            raise CommandError("The two password fields did not match.")

        tenant = self.resolve_tenant(options.get("tenant_slug"))
        membership = self.create_member(
            tenant=tenant,
            email=email,
            name=name,
            password=password,
            role=options["role"],
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Showcase login {membership.user.email} created with role {membership.role}."
            )
        )

    @staticmethod
    def resolve_tenant(tenant_slug):
        if tenant_slug:
            tenant = Tenant.objects.filter(slug=tenant_slug, is_active=True).first()
            if tenant is None:
                raise CommandError("No active showcase tenant uses that slug.")
            return tenant

        tenants = list(
            Tenant.objects.filter(is_active=True, factories__is_active=True)
            .distinct()
            .order_by("created_at")[:2]
        )
        if not tenants:
            raise CommandError("Seed this variant before creating more logins.")
        if len(tenants) > 1:
            raise CommandError("Multiple showcase tenants exist; provide --tenant-slug.")
        return tenants[0]

    @transaction.atomic
    def create_member(self, *, tenant, email, name, password, role):
        email = normalize_login_email(email)
        name = name.strip()
        if not name:
            raise CommandError("Display name is required.")

        user_model = get_user_model()
        try:
            validate_email(email)
            candidate = user_model(email=email)
            validate_password(password, user=candidate)
        except ValidationError as exc:
            raise CommandError(" ".join(exc.messages)) from exc

        if (
            EmailIdentity.objects.filter(email=email).exists()
            or user_model.objects.filter(email__iexact=email).exists()
        ):
            raise CommandError("An account already uses that email address.")

        first_name, _, last_name = name.partition(" ")
        username = self.unique_internal_username(user_model)
        try:
            user = user_model.objects.create_user(
                username=username,
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name,
                is_active=True,
            )
            EmailIdentity.objects.create(user=user, email=email)
            return Membership.objects.create(
                user=user,
                tenant=tenant,
                role=role,
                all_factories=True,
                is_active=True,
            )
        except IntegrityError as exc:
            raise CommandError("The showcase login could not be created uniquely.") from exc

    @staticmethod
    def unique_internal_username(user_model):
        for _attempt in range(5):
            username = f"showcase-{secrets.token_hex(8)}"
            if not user_model.objects.filter(username=username).exists():
                return username
        raise CommandError("Could not allocate an internal username; try again.")
