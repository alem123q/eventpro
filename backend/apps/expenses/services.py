from decimal import Decimal

from django.db.models import Count, Sum
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from config import csv_export
from events.models import Event

from .models import Expense
from .permissions import can_manage_event_expenses


class ExpenseService:
    @staticmethod
    def get_event(event_id, user):
        if not event_id:
            raise ValidationError({'detail': 'Falta indicar el evento (parámetro "event").'})
        try:
            event = Event.objects.select_related('organizer').get(id=event_id)
        except (Event.DoesNotExist, ValueError, TypeError):
            raise NotFound('Evento no encontrado.')
        if not can_manage_event_expenses(user, event):
            raise PermissionDenied('No tienes permiso para gestionar los gastos de este evento.')
        return event

    @staticmethod
    def list_expenses(user, params):
        queryset = Expense.objects.select_related('event')
        if user.role != 'admin':
            queryset = queryset.filter(event__organizer=user)

        event_id = params.get('event')
        if event_id:
            queryset = queryset.filter(event_id=event_id)

        category = params.get('category')
        if category:
            queryset = queryset.filter(category=category)
        return queryset

    @staticmethod
    def get_expense(pk, user):
        try:
            expense = Expense.objects.select_related('event__organizer').get(id=pk)
        except Expense.DoesNotExist:
            raise NotFound('Gasto no encontrado.')
        if not can_manage_event_expenses(user, expense.event):
            raise PermissionDenied('No tienes permiso para gestionar este gasto.')
        return expense

    @staticmethod
    def summary(event):
        """Total gastado, presupuesto, saldo y desglose por categoria."""
        expenses = Expense.objects.filter(event=event)
        total = expenses.aggregate(total=Sum('amount'))['total'] or Decimal('0')
        labels = dict(Expense.Category.choices)
        by_category = [
            {
                'category': row['category'],
                'label': labels.get(row['category'], row['category']),
                'total': row['total'],
                'count': row['count'],
            }
            for row in expenses.values('category')
            .annotate(total=Sum('amount'), count=Count('id'))
            .order_by('-total')
        ]

        budget = event.budget
        remaining = None
        percentage_used = None
        if budget is not None:
            remaining = budget - total
            percentage_used = round(float(total / budget * 100), 1) if budget > 0 else None

        return {
            'event': event.id,
            'event_title': event.title,
            'budget': budget,
            'total': total,
            'remaining': remaining,
            'percentage_used': percentage_used,
            'over_budget': budget is not None and total > budget,
            'count': expenses.count(),
            'by_category': by_category,
        }


class ExpenseExportService:
    HEADER = ['Fecha', 'Concepto', 'Categoría', 'Pagado por', 'Monto', 'Notas']

    @staticmethod
    def expenses_csv(event):
        labels = dict(Expense.Category.choices)
        expenses = Expense.objects.filter(event=event).order_by('expense_date', 'created_at')
        rows = [
            [
                csv_export.date(e.expense_date),
                e.concept,
                labels.get(e.category, e.category),
                e.paid_by,
                csv_export.money(e.amount),
                e.notes,
            ]
            for e in expenses
        ]
        summary = ExpenseService.summary(event)
        rows.append([])
        rows.append(['', 'Total gastado', '', '', csv_export.money(summary['total']), ''])
        if summary['budget'] is not None:
            rows.append(['', 'Presupuesto', '', '', csv_export.money(summary['budget']), ''])
            rows.append(['', 'Disponible', '', '', csv_export.money(summary['remaining']), ''])
        return csv_export.csv_response(
            csv_export.filename_for('gastos', event.title),
            ExpenseExportService.HEADER, rows,
        )
