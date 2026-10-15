"""
Corrige datos inconsistentes: invitados que registraron su ingreso pero
quedaron con RSVP pendiente o rechazado (antes se permitia cambiarlo
despues del check-in). Si ingresaron, asistieron: se marcan confirmados.
"""

from django.db import migrations


def confirm_attended(apps, schema_editor):
    Invitation = apps.get_model('invitations', 'Invitation')
    Invitation.objects.filter(attendance__isnull=False).exclude(
        rsvp_status='confirmed',
    ).update(rsvp_status='confirmed')


class Migration(migrations.Migration):

    dependencies = [
        ('attendance', '0002_initial'),
        ('invitations', '0004_random_qr_hash'),
    ]

    operations = [
        migrations.RunPython(confirm_attended, reverse_code=migrations.RunPython.noop),
    ]
