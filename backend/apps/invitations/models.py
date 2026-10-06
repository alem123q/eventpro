import secrets

from django.db import models
from django.utils.translation import gettext_lazy as _


def generate_qr_hash():
    """Codigo QR aleatorio (128 bits). No se puede deducir a partir del id."""
    return secrets.token_hex(16)


class Invitation(models.Model):
    class RSVPStatus(models.TextChoices):
        PENDING = 'pending', _('Pendiente')
        CONFIRMED = 'confirmed', _('Confirmado')
        REJECTED = 'rejected', _('Rechazado')

    first_name = models.CharField(_('nombres'), max_length=150)
    last_name = models.CharField(_('apellidos'), max_length=150)
    email = models.EmailField(_('correo electrónico'), max_length=254)
    phone = models.CharField(_('teléfono'), max_length=20, blank=True, null=True)
    rsvp_status = models.CharField(
        _('estado RSVP'),
        max_length=20,
        choices=RSVPStatus.choices,
        default=RSVPStatus.PENDING,
    )
    event = models.ForeignKey(
        'events.Event',
        on_delete=models.CASCADE,
        related_name='invitations',
        verbose_name=_('evento'),
    )
    qr_hash = models.CharField(
        _('hash QR'),
        max_length=32,
        unique=True,
        default=generate_qr_hash,
        editable=False,
    )
    created_at = models.DateTimeField(_('fecha de creación'), auto_now_add=True)
    updated_at = models.DateTimeField(_('fecha de actualización'), auto_now=True)

    class Meta:
        verbose_name = _('invitación')
        verbose_name_plural = _('invitaciones')
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['event', 'email'],
                name='uq_event_email',
                violation_error_message='Este invitado ya fue agregado a este evento.',
            ),
        ]
        indexes = [
            models.Index(fields=['event'], name='idx_invitation_event'),
            models.Index(fields=['rsvp_status'], name='idx_invitation_rsvp'),
            models.Index(fields=['email'], name='idx_invitation_email'),
        ]

    def __str__(self):
        return f'{self.full_name} - {self.event.title}'

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()

