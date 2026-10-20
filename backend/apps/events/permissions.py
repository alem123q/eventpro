from rest_framework.permissions import SAFE_METHODS, BasePermission

from .access import can_work_door, is_organizer


class IsEventOrganizer(BasePermission):
    """Lectura: organizador, administrador o colaborador del evento.
    Cambios: solo organizador o administrador."""

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return can_work_door(request.user, obj)
        return is_organizer(request.user, obj)


class CanCreateEvent(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return request.user.is_authenticated and request.user.role in ('admin', 'organizer')


class CanDeleteEvent(BasePermission):
    def has_object_permission(self, request, view, obj):
        return is_organizer(request.user, obj)
