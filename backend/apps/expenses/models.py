from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class Expense(models.Model):
    class Category(models.TextChoices):
        VENUE = 'venue', _('Lugar')
        CATERING = 'catering', _('Catering')
        SOUND_LIGHTING = 'sound_lighting', _('Sonido e iluminación')
        DECORATION = 'decoration', _('Decoración')
        PRINTING = 'printing', _('Impresión')
        TRANSPORT = 'transport', _('Transporte')
        OTHER = 'other', _('Otro')

    event = models.ForeignKey(
        'events.Event',
        on_delete=models.CASCADE,
        related_name='expenses',
        verbose_name=_('evento'),
    )
    concept = models.CharField(_('concepto'), max_length=200)
    category = models.CharField(
        _('categoría'),
        max_length=30,
        choices=Category.choices,
        default=Category.OTHER,
    )
    amount = models.DecimalField(
        _('monto'),
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
    )
    paid_by = models.CharField(_('pagado por'), max_length=150, blank=True)
    expense_date = models.DateField(_('fecha del gasto'), default=timezone.localdate)
    notes = models.TextField(_('notas'), blank=True)
    created_at = models.DateTimeField(_('fecha de creación'), auto_now_add=True)
    updated_at = models.DateTimeField(_('fecha de actualización'), auto_now=True)

    class Meta:
        verbose_name = _('gasto')
        verbose_name_plural = _('gastos')
        ordering = ['-expense_date', '-created_at']
        indexes = [
            models.Index(fields=['event'], name='idx_expense_event'),
            models.Index(fields=['category'], name='idx_expense_category'),
        ]

    def __str__(self):
        return f'{self.concept} - ${self.amount}'
