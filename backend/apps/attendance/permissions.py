from rest_framework.permissions import BasePermission

from events.access import can_work_door
from events.models import Event


class CanManageAttendance(BasePermission):
    """Ver la asistencia: organizador, administrador o colaborador del evento."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        event_id = request.query_params.get('event')
        if event_id:
            try:
                event = Event.objects.get(id=event_id)
            except (Event.DoesNotExist, ValueError):
                return False
            return can_work_door(request.user, event)
        return True


class CanCheckin(BasePermission):
    """Registrar ingresos: organizador, administrador o colaborador del evento."""

    def has_permission(self, request, view):
        return request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        event = obj if isinstance(obj, Event) else obj.event
        return can_work_door(request.user, event)


class IsEventOrganizer(BasePermission):
    def has_object_permission(self, request, view, obj):
        return can_work_door(request.user, obj.event)
