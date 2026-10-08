"""
Reemplaza los codigos QR derivados del id (sha256 de 'event-checkin-<id>',
faciles de adivinar) por codigos aleatorios, y hace el campo obligatorio.
"""

import secrets

from django.db import migrations, models

import invitations.models


def regenerate_qr_hashes(apps, schema_editor):
    Invitation = apps.get_model('invitations', 'Invitation')
    Attendance = apps.get_model('attendance', 'Attendance')
    for inv in Invitation.objects.iterator():
        new_hash = secrets.token_hex(16)
        Invitation.objects.filter(id=inv.id).update(qr_hash=new_hash)
        Attendance.objects.filter(invitation_id=inv.id).update(qr_code=new_hash)


class Migration(migrations.Migration):

    dependencies = [
        ('invitations', '0003_populate_qr_hash'),
        ('attendance', '0002_initial'),
    ]

    operations = [
        migrations.RunPython(regenerate_qr_hashes, reverse_code=migrations.RunPython.noop),
        migrations.AlterField(
            model_name='invitation',
            name='qr_hash',
            field=models.CharField(
                default=invitations.models.generate_qr_hash,
                editable=False,
                max_length=32,
                unique=True,
                verbose_name='hash QR',
            ),
        ),
    ]
