from django.contrib import admin

from apps.streams.models import (
    DataInputStream,
    DataStreamChannel,
    MachineCycleOutcome,
    MachineStreamBinding,
    MachineTelemetrySample,
)

admin.site.register(DataInputStream)
admin.site.register(DataStreamChannel)
admin.site.register(MachineStreamBinding)
admin.site.register(MachineTelemetrySample)
admin.site.register(MachineCycleOutcome)
