from rest_framework.permissions import SAFE_METHODS, BasePermission

from events.access import is_organizer


class IsEventOrganizer(BasePermission):
    def has_object_permission(self, request, view, obj):
        return is_organizer(request.user, obj.event)


class CanManageGuests(BasePermission):
    """Ver la lista: cualquier usuario con sesion (el servicio filtra los
    eventos que organiza o donde colabora, para el check-in).
    Agregar o cambiar invitados: organizadores y administradores."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.role in ('admin', 'organizer')
