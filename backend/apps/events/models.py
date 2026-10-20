from django.core.validators import MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _


class Event(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', _('Borrador')
        ACTIVE = 'active', _('Activo')
        FINISHED = 'finished', _('Finalizado')

    class Category(models.TextChoices):
        CONFERENCE = 'conference', _('Conferencia')
        WORKSHOP = 'workshop', _('Taller')
        SEMINAR = 'seminar', _('Seminario')
        NETWORKING = 'networking', _('Networking')
        SOCIAL = 'social', _('Social')
        CORPORATE = 'corporate', _('Corporativo')
        OTHER = 'other', _('Otro')

    VALID_TRANSITIONS = {
        Status.DRAFT: [Status.ACTIVE],
        Status.ACTIVE: [Status.FINISHED],
        Status.FINISHED: [],
    }

    title = models.CharField(_('título'), max_length=200)
    description = models.TextField(_('descripción'), blank=True, null=True)
    event_date = models.DateField(_('fecha del evento'))
    event_time = models.TimeField(_('hora del evento'), blank=True, null=True)
    location = models.CharField(_('ubicación'), max_length=255, blank=True, null=True)
    category = models.CharField(
        _('categoría'),
        max_length=100,
        choices=Category.choices,
        default=Category.OTHER,
    )
    budget = models.DecimalField(
        _('presupuesto'),
        max_digits=12,
        decimal_places=2,
        blank=True,
        null=True,
        validators=[MinValueValidator(0)],
    )
    image = models.ImageField(
        _('imagen'),
        upload_to='events/',
        blank=True,
        null=True,
    )
    status = models.CharField(
        _('estado'),
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    organizer = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='organized_events',
        verbose_name=_('organizador'),
    )
    created_at = models.DateTimeField(_('fecha de creación'), auto_now_add=True)
    updated_at = models.DateTimeField(_('fecha de actualización'), auto_now=True)

    class Meta:
        verbose_name = _('evento')
        verbose_name_plural = _('eventos')
        ordering = ['-event_date', 'event_time']
        indexes = [
            models.Index(fields=['event_date'], name='idx_event_date'),
            models.Index(fields=['status'], name='idx_event_status'),
            models.Index(fields=['category'], name='idx_event_category'),
            models.Index(fields=['organizer'], name='idx_event_organizer'),
        ]

    def __str__(self):
        return self.title

    def can_transition_to(self, new_status):
        return new_status in self.VALID_TRANSITIONS.get(self.status, [])


class EventCollaborator(models.Model):
    """Persona que ayuda en la puerta de un evento: puede hacer el check-in y
    ver la asistencia, pero no modificar el evento, los invitados ni los gastos."""

    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name='collaborators',
        verbose_name=_('evento'),
    )
    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='collaborations',
        verbose_name=_('usuario'),
    )
    added_at = models.DateTimeField(_('agregado el'), auto_now_add=True)

    class Meta:
        verbose_name = _('colaborador')
        verbose_name_plural = _('colaboradores')
        ordering = ['added_at']
        constraints = [
            models.UniqueConstraint(fields=['event', 'user'], name='uq_event_collaborator'),
        ]

    def __str__(self):
        return f'{self.user.email} en {self.event.title}'
