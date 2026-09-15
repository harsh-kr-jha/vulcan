import unicodedata

from django.conf import settings
from django.core.validators import validate_email
from django.db import models

from apps.common.models import TimestampedModel, UUIDModel


def normalize_login_email(value: str) -> str:
    """Return the canonical, case-insensitive address used for authentication."""
    return unicodedata.normalize("NFKC", str(value or "")).strip().casefold()


class EmailIdentity(UUIDModel, TimestampedModel):
    """A unique login address for projects that still use Django's built-in User."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="email_identity",
    )
    email = models.CharField(max_length=254, unique=True)

    class Meta:
        verbose_name_plural = "email identities"

    def clean(self):
        super().clean()
        self.email = normalize_login_email(self.email)
        validate_email(self.email)

    def save(self, *args, **kwargs):
        self.email = normalize_login_email(self.email)
        validate_email(self.email)
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.email


class Tenant(UUIDModel, TimestampedModel):
    name = models.CharField(max_length=180)
    slug = models.SlugField(max_length=80, unique=True)
    is_active = models.BooleanField(default=True)
    settings = models.JSONField(default=dict, blank=True)

    def __str__(self) -> str:
        return self.name


class Company(UUIDModel, TimestampedModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT, related_name="companies")
    name = models.CharField(max_length=180)
    legal_name = models.CharField(max_length=240, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "name"], name="unique_company_name_per_tenant"
            )
        ]

    def __str__(self) -> str:
        return self.name


class Factory(UUIDModel, TimestampedModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT, related_name="factories")
    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name="factories")
    name = models.CharField(max_length=180)
    code = models.CharField(max_length=40)
    timezone = models.CharField(max_length=64, default="Asia/Kolkata")
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    configuration = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "code"], name="unique_factory_code_per_tenant"
            )
        ]
        indexes = [models.Index(fields=["tenant", "is_active"])]

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"


class Role(models.TextChoices):
    PLATFORM_ADMIN = "platform_admin", "Platform administrator"
    OPERATIONS_REVIEWER = "operations_reviewer", "Backend operations reviewer"
    COMPANY_ADMIN = "company_admin", "Company administrator"
    FACTORY_ADMIN = "factory_admin", "Factory administrator"
    FACTORY_MANAGER = "factory_manager", "Factory manager"
    PRODUCTION_SUPERVISOR = "production_supervisor", "Production supervisor"
    QUALITY_REVIEWER = "quality_reviewer", "Quality reviewer"
    INVENTORY_REVIEWER = "inventory_reviewer", "Inventory reviewer"
    EXECUTIVE = "executive", "Read-only executive"


class Membership(UUIDModel, TimestampedModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships"
    )
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=40, choices=Role.choices)
    all_factories = models.BooleanField(default=False)
    factories = models.ManyToManyField(Factory, blank=True, related_name="memberships")
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "tenant"], name="unique_user_tenant_membership")
        ]
        indexes = [models.Index(fields=["tenant", "role", "is_active"])]

    def __str__(self) -> str:
        return f"{self.user} · {self.tenant} · {self.role}"


class FactoryMaster(UUIDModel, TimestampedModel):
    """Small, factory-owned reference records used during import validation."""

    class Kind(models.TextChoices):
        LINE = "lines", "Production line"
        PROCESS = "processes", "Manufacturing process"
        MACHINE = "machines", "Machine"
        SKU = "skus", "Product / SKU"
        MATERIAL = "materials", "Material"
        SUPPLIER = "suppliers", "Supplier"
        SHIFT = "shifts", "Shift"
        REASON_CODE = "reasonCodes", "Reason code"

    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT, related_name="factory_masters")
    factory = models.ForeignKey(Factory, on_delete=models.CASCADE, related_name="master_records")
    kind = models.CharField(max_length=30, choices=Kind.choices)
    name = models.CharField(max_length=160)
    code = models.CharField(max_length=60)
    parent = models.ForeignKey(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="children"
    )
    metadata = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["factory", "kind", "code"], name="unique_factory_master_code"
            )
        ]
        indexes = [models.Index(fields=["tenant", "factory", "kind", "is_active"])]
