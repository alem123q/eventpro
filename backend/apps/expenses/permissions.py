from rest_framework.permissions import BasePermission


class CanManageExpenses(BasePermission):
    """Solo organizadores y administradores trabajan con gastos."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ('admin', 'organizer')


def can_manage_event_expenses(user, event):
    return user.role == 'admin' or event.organizer_id == user.id
