from django import forms
from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.db.models import Q
from django.http import HttpResponseRedirect
from django.template.response import TemplateResponse
from django.urls import path, reverse

from apps.ml.models import PredictionModel, ProductionProfile
from apps.ml.uploads import install_uploaded_model
from apps.spatial.models import SpatialMachine


def machines_for_admin(user):
    queryset = SpatialMachine.objects.filter(
        is_active=True,
        tenant__is_active=True,
        layout__factory__is_active=True,
    ).select_related("tenant", "layout__factory")
    if user.is_superuser:
        return queryset.order_by("layout__factory__code", "code", "name")
    allowed = Q(
        tenant__memberships__user=user,
        tenant__memberships__is_active=True,
        tenant__memberships__all_factories=True,
    ) | Q(
        layout__factory__memberships__user=user,
        layout__factory__memberships__is_active=True,
    )
    return queryset.filter(allowed).distinct().order_by(
        "layout__factory__code", "code", "name"
    )


class ModelPackageUploadForm(forms.Form):
    machine = forms.ModelChoiceField(queryset=SpatialMachine.objects.none())
    profile = forms.ModelChoiceField(
        queryset=ProductionProfile.objects.none(),
        help_text=(
            "Choose an existing production profile. SKU, feature contract and prediction "
            "checkpoint are copied from it."
        ),
    )
    name = forms.SlugField(
        max_length=80,
        help_text="Lowercase kebab-case, for example quality-risk.",
    )
    version = forms.CharField(
        max_length=40,
        help_text="Immutable semantic version, for example 1.0.0.",
    )
    stage = forms.ChoiceField(
        choices=(("available", "Available (do not serve)"), ("production", "Production")),
        initial="available",
    )
    threshold = forms.FloatField(min_value=0, max_value=1, initial=0.5)
    metrics = forms.JSONField(
        required=False,
        initial=dict,
        widget=forms.Textarea(attrs={"rows": 5}),
        help_text='Optional JSON object, for example {"balanced_accuracy": 0.91}.',
    )
    package = forms.FileField(
        help_text=(
            "ZIP containing exactly one trusted .joblib pipeline. Vulcan generates the manifest "
            "and canonical destination automatically."
        )
    )

    def __init__(self, *args, user, **kwargs):
        super().__init__(*args, **kwargs)
        machines = machines_for_admin(user)
        profiles = (
            ProductionProfile.objects.filter(machine__in=machines)
            .select_related("tenant", "machine__layout__factory", "sku")
            .order_by("machine__layout__factory__code", "machine__code", "sku__code", "-version")
        )
        self.fields["machine"].queryset = machines
        self.fields["machine"].label_from_instance = lambda machine: (
            f"{machine.layout.factory.code} / {machine.code or machine.name} — {machine.name}"
        )
        self.fields["profile"].queryset = profiles
        self.fields["profile"].label_from_instance = lambda profile: (
            f"{profile.machine.layout.factory.code} / "
            f"{profile.machine.code or profile.machine.name} / {profile.sku.code} — "
            f"profile v{profile.version}, {profile.checkpoint_phase} "
            f"second {profile.checkpoint_second}"
        )

    def clean(self):
        cleaned = super().clean()
        machine = cleaned.get("machine")
        profile = cleaned.get("profile")
        if machine and profile and profile.machine_id != machine.id:
            raise forms.ValidationError(
                "The selected production profile belongs to another machine."
            )
        cleaned["metrics"] = cleaned.get("metrics") or {}
        return cleaned


@admin.register(ProductionProfile)
class ProductionProfileAdmin(admin.ModelAdmin):
    list_display = (
        "machine_code",
        "factory_code",
        "sku_code",
        "version",
        "checkpoint_phase",
        "checkpoint_second",
    )
    search_fields = ("machine__code", "machine__name", "sku__code", "sku__name")
    list_filter = ("machine__layout__factory", "checkpoint_phase")
    readonly_fields = (
        "id",
        "tenant",
        "machine",
        "sku",
        "version",
        "ranges",
        "checkpoint_phase",
        "checkpoint_second",
        "fields",
        "contract",
    )

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .filter(machine__in=machines_for_admin(request.user))
            .select_related("machine__layout__factory", "sku")
        )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description="Machine", ordering="machine__code")
    def machine_code(self, obj):
        return obj.machine.code or obj.machine.name

    @admin.display(description="Factory", ordering="machine__layout__factory__code")
    def factory_code(self, obj):
        return obj.machine.layout.factory.code

    @admin.display(description="SKU", ordering="sku__code")
    def sku_code(self, obj):
        return obj.sku.code


@admin.register(PredictionModel)
class PredictionModelAdmin(admin.ModelAdmin):
    change_list_template = "admin/ml/predictionmodel/change_list.html"
    list_display = (
        "name",
        "version",
        "machine_code",
        "factory_code",
        "sku_code",
        "runtime",
        "threshold",
        "active",
        "updated_at",
    )
    list_filter = ("active", "runtime", "profile__machine__layout__factory")
    search_fields = (
        "name",
        "version",
        "profile__machine__code",
        "profile__machine__name",
        "profile__sku__code",
    )
    readonly_fields = (
        "id",
        "tenant",
        "profile",
        "name",
        "version",
        "runtime",
        "metrics",
        "artifact_key",
        "manifest_key",
        "checksum",
        "threshold",
        "active",
        "created_at",
        "updated_at",
    )

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .filter(profile__machine__in=machines_for_admin(request.user))
            .select_related("profile__machine__layout__factory", "profile__sku")
        )

    def get_urls(self):
        return [
            path(
                "upload-package/",
                self.admin_site.admin_view(self.upload_package),
                name="ml_predictionmodel_upload",
            )
        ] + super().get_urls()

    def changelist_view(self, request, extra_context=None):
        extra_context = {
            **(extra_context or {}),
            "model_upload_url": reverse("admin:ml_predictionmodel_upload"),
        }
        return super().changelist_view(request, extra_context=extra_context)

    def add_view(self, request, form_url="", extra_context=None):
        if not self.has_add_permission(request):
            raise PermissionDenied
        return HttpResponseRedirect(reverse("admin:ml_predictionmodel_upload"))

    def upload_package(self, request):
        if not self.has_add_permission(request):
            raise PermissionDenied
        form = ModelPackageUploadForm(
            request.POST or None,
            request.FILES or None,
            user=request.user,
        )
        if request.method == "POST" and form.is_valid():
            try:
                model = install_uploaded_model(
                    profile=form.cleaned_data["profile"],
                    name=form.cleaned_data["name"],
                    version=form.cleaned_data["version"],
                    stage=form.cleaned_data["stage"],
                    threshold=form.cleaned_data["threshold"],
                    metrics=form.cleaned_data["metrics"],
                    upload=form.cleaned_data["package"],
                )
            except PermissionError:
                form.add_error(
                    None,
                    "The model repository is read-only. Allow the backend service to write its "
                    "model mount, then try again.",
                )
            except (OSError, ValueError) as exc:
                form.add_error(None, str(exc))
            else:
                state = "active production model" if model.active else "available model"
                self.message_user(
                    request,
                    f"Uploaded {model.name} v{model.version} as an {state}.",
                    level=messages.SUCCESS,
                )
                return HttpResponseRedirect(reverse("admin:ml_predictionmodel_changelist"))
        context = {
            **self.admin_site.each_context(request),
            "opts": self.model._meta,
            "title": "Upload prediction model",
            "form": form,
            "media": self.media + form.media,
        }
        return TemplateResponse(
            request,
            "admin/ml/predictionmodel/upload_package.html",
            context,
        )

    def has_delete_permission(self, request, obj=None):
        # Deleting only the database row is misleading because the registry would recreate it.
        return False

    @admin.display(description="Machine", ordering="profile__machine__code")
    def machine_code(self, obj):
        return obj.profile.machine.code or obj.profile.machine.name

    @admin.display(description="Factory", ordering="profile__machine__layout__factory__code")
    def factory_code(self, obj):
        return obj.profile.machine.layout.factory.code

    @admin.display(description="SKU", ordering="profile__sku__code")
    def sku_code(self, obj):
        return obj.profile.sku.code
