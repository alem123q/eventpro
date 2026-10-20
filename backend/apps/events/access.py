"""Quien puede hacer que en un evento.

- Organizador (o administrador): todo.
- Colaborador del evento: ver el evento, hacer el check-in y ver la asistencia.
"""
from django.db.models import Q

from .models import Event, EventCollaborator


def is_admin(user):
    return user.is_authenticated and user.role == 'admin'


def is_organizer(user, event):
    return is_admin(user) or event.organizer_id == user.id


def is_collaborator(user, event):
    return EventCollaborator.objects.filter(event=event, user=user).exists()


def can_work_door(user, event):
    """Puede ver el evento, registrar ingresos y ver la asistencia."""
    return is_organizer(user, event) or is_collaborator(user, event)


def role_in(user, event):
    if event.organizer_id == user.id:
        return 'organizer'
    if is_admin(user):
        return 'admin'
    if is_collaborator(user, event):
        return 'collaborator'
    return None


def door_events_filter(user, prefix=''):
    """Filtro de los eventos que el usuario organiza o donde colabora.
    `prefix` permite usarlo desde otros modelos (p. ej. 'event__')."""
    return Q(**{f'{prefix}organizer': user}) | Q(**{f'{prefix}collaborators__user': user})


def visible_events(user):
    if is_admin(user):
        return Event.objects.all()
    return Event.objects.filter(door_events_filter(user)).distinct()
