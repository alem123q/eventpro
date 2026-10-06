from django.db import models
from django.utils.translation import gettext_lazy as _


class Attendance(models.Model):
    invitation = models.OneToOneField(
        'invitations.Invitation',
        on_delete=models.CASCADE,
        related_name='attendance',
        verbose_name=_('invitación'),
    )
    event = models.ForeignKey(
        'events.Event',
        on_delete=models.CASCADE,
        related_name='attendances',
        verbose_name=_('evento'),
    )
    qr_code = models.CharField(
        _('código QR'),
        max_length=255,
        unique=True,
        editable=False,
    )
    checkin_time = models.DateTimeField(
        _('fecha y hora de ingreso'),
        auto_now_add=True,
    )

    class Meta:
        verbose_name = _('asistencia')
        verbose_name_plural = _('asistencias')
        ordering = ['-checkin_time']
        indexes = [
            models.Index(fields=['qr_code'], name='idx_attendance_qr'),
            models.Index(fields=['event'], name='idx_attendance_event'),
            models.Index(fields=['checkin_time'], name='idx_attendance_checkin'),
        ]

    def __str__(self):
        return f'{self.invitation.full_name} - {self.event.title}'

    def save(self, *args, **kwargs):
        if not self.qr_code:
            self.qr_code = self.invitation.qr_hash
        super().save(*args, **kwargs)
