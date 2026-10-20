from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from config.pagination import DefaultPagination

from .models import Event
from .access import is_organizer
from .permissions import CanCreateEvent, CanDeleteEvent, IsEventOrganizer
from .serializers import EventCollaboratorSerializer, EventDetailSerializer, EventListSerializer
from .services import CollaboratorService, EventService


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated & CanCreateEvent])
def event_list_create(request):
    if request.method == 'GET':
        events = EventService.list_events(request.user, request.query_params)
        paginator = DefaultPagination()
        page = paginator.paginate_queryset(events, request)
        serializer = EventListSerializer(page, many=True, context={'user': request.user})
        return paginator.get_paginated_response(serializer.data)

    event = EventService.create_event(request.user, request.data)
    event = EventService._base_queryset().get(id=event.id)
    serializer = EventDetailSerializer(event, context={'user': request.user})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def event_detail(request, pk):
    try:
        event = EventService.get_event(pk, request.user)
    except Event.DoesNotExist:
        raise NotFound('Evento no encontrado.')

    if request.method == 'GET':
        if not IsEventOrganizer().has_object_permission(request, None, event):
            raise PermissionDenied('No tienes permiso para ver este evento.')
        serializer = EventDetailSerializer(event, context={'user': request.user})
        return Response(serializer.data)

    if request.method in ('PUT', 'PATCH'):
        if not IsEventOrganizer().has_object_permission(request, None, event):
            raise PermissionDenied('No tienes permiso para modificar este evento.')
        event = EventService.update_event(event, request.data)
        serializer = EventDetailSerializer(event, context={'user': request.user})
        return Response(serializer.data)

    if request.method == 'DELETE':
        if not CanDeleteEvent().has_object_permission(request, None, event):
            raise PermissionDenied('No tienes permiso para eliminar este evento.')
        EventService.delete_event(event)
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def event_change_status(request, pk):
    try:
        event = EventService._base_queryset().get(id=pk)
    except Event.DoesNotExist:
        raise NotFound('Evento no encontrado.')

    if not IsEventOrganizer().has_object_permission(request, None, event):
        raise PermissionDenied('No tienes permiso para cambiar el estado de este evento.')

    new_status = request.data.get('status')
    if not new_status:
        return Response(
            {'error': 'El campo "status" es obligatorio.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    event = EventService.change_status(event, new_status)
    serializer = EventDetailSerializer(event, context={'user': request.user})
    return Response(serializer.data)


def _get_own_event(request, pk):
    """Evento que el usuario organiza (o cualquiera, si es administrador)."""
    try:
        event = Event.objects.select_related('organizer').get(id=pk)
    except Event.DoesNotExist:
        raise NotFound('Evento no encontrado.')
    if not is_organizer(request.user, event):
        raise PermissionDenied('Solo el organizador puede gestionar los colaboradores.')
    return event


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def event_collaborators(request, pk):
    event = _get_own_event(request, pk)
    if request.method == 'POST':
        collaborator = CollaboratorService.add(event, request.data.get('email'))
        return Response(EventCollaboratorSerializer(collaborator).data, status=status.HTTP_201_CREATED)
    collaborators = CollaboratorService.list(event)
    return Response(EventCollaboratorSerializer(collaborators, many=True).data)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def event_collaborator_remove(request, pk, user_id):
    event = _get_own_event(request, pk)
    CollaboratorService.remove(event, user_id)
    return Response(status=status.HTTP_204_NO_CONTENT)
