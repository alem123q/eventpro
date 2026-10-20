from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from config.pagination import DefaultPagination
from config.throttles import PublicInvitationThrottle
from events.models import Event

from .models import Invitation
from .permissions import CanManageGuests, IsEventOrganizer
from .serializers import InvitationSerializer, PublicInvitationSerializer
from .services import InvitationExportService, InvitationService, PublicInvitationService


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated & CanManageGuests])
def invitation_list_create(request):
    if request.method == 'GET':
        invitations = InvitationService.list_invitations(
            request.user, request.query_params,
        )
        paginator = DefaultPagination()
        page = paginator.paginate_queryset(invitations, request)
        serializer = InvitationSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    event_id = request.data.get('event') or request.data.get('event_id')
    if event_id:
        try:
            event = Event.objects.select_related('organizer').get(id=event_id)
        except Event.DoesNotExist:
            raise NotFound('Evento no encontrado.')
        if not (request.user.role == 'admin' or event.organizer == request.user):
            raise PermissionDenied(
                'No tienes permiso para gestionar invitados de este evento.',
            )

    if isinstance(request.data.get('guests'), list):
        created, errors = InvitationService.create_invitations_batch(request.data)
        serializer = InvitationSerializer(created, many=True)
        response_data = {'created': serializer.data}
        if errors:
            response_data['errors'] = errors
            return Response(response_data, status=status.HTTP_207_MULTI_STATUS)
        return Response(response_data, status=status.HTTP_201_CREATED)

    invitation = InvitationService.create_invitation(request.data)
    serializer = InvitationSerializer(invitation)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def invitation_detail(request, pk):
    try:
        invitation = Invitation.objects.select_related(
            'event__organizer', 'attendance',
        ).get(id=pk)
    except Invitation.DoesNotExist:
        raise NotFound('Invitación no encontrada.')

    if not IsEventOrganizer().has_object_permission(request, None, invitation):
        raise PermissionDenied(
            'No tienes permiso para gestionar este invitado.',
        )

    if request.method == 'GET':
        serializer = InvitationSerializer(invitation)
        return Response(serializer.data)

    if request.method in ('PUT', 'PATCH'):
        invitation = InvitationService.update_invitation(invitation, request.data)
        serializer = InvitationSerializer(invitation)
        return Response(serializer.data)

    if request.method == 'DELETE':
        InvitationService.delete_invitation(invitation)
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def invitation_rsvp(request, pk):
    try:
        invitation = Invitation.objects.select_related('event__organizer').get(id=pk)
    except Invitation.DoesNotExist:
        raise NotFound('Invitación no encontrada.')

    if not IsEventOrganizer().has_object_permission(request, None, invitation):
        raise PermissionDenied(
            'No tienes permiso para cambiar el RSVP de este invitado.',
        )

    new_status = request.data.get('rsvp_status')
    if not new_status:
        return Response(
            {'error': 'El campo "rsvp_status" es obligatorio.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    valid_statuses = dict(Invitation.RSVPStatus.choices)
    if new_status not in valid_statuses:
        return Response(
            {'error': f'Estado inválido. Opciones: {", ".join(valid_statuses.keys())}'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    invitation = InvitationService.change_rsvp(invitation, new_status)
    serializer = InvitationSerializer(invitation)
    return Response(serializer.data)


def _get_own_invitation(request, pk):
    try:
        invitation = Invitation.objects.select_related(
            'event__organizer', 'attendance',
        ).get(id=pk)
    except Invitation.DoesNotExist:
        raise NotFound('Invitación no encontrada.')
    if not IsEventOrganizer().has_object_permission(request, None, invitation):
        raise PermissionDenied('No tienes permiso para gestionar este invitado.')
    return invitation


@api_view(['POST'])
@permission_classes([IsAuthenticated & CanManageGuests])
def invitation_send(request, pk):
    """Envia (o reenvia) la invitacion de un invitado por correo."""
    invitation = _get_own_invitation(request, pk)
    invitation = InvitationService.send_invitation(invitation)
    return Response(InvitationSerializer(invitation).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated & CanManageGuests])
def invitation_send_pending(request):
    """Envia la invitacion a todos los invitados del evento que todavia no la recibieron."""
    event_id = request.data.get('event')
    try:
        event = Event.objects.select_related('organizer').get(id=event_id)
    except (Event.DoesNotExist, ValueError, TypeError):
        raise NotFound('Evento no encontrado.')
    if not (request.user.role == 'admin' or event.organizer == request.user):
        raise PermissionDenied('No tienes permiso para gestionar invitados de este evento.')
    result = InvitationService.send_pending_invitations(event)
    return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated & CanManageGuests])
def invitation_export(request):
    """Descarga en Excel los invitados del evento, con su respuesta y su ingreso."""
    event_id = request.query_params.get('event')
    try:
        event = Event.objects.select_related('organizer').get(id=event_id)
    except (Event.DoesNotExist, ValueError, TypeError):
        raise NotFound('Evento no encontrado.')
    if not (request.user.role == 'admin' or event.organizer == request.user):
        raise PermissionDenied('No tienes permiso para descargar los invitados de este evento.')
    return InvitationExportService.guests_xlsx(event)


# ----------------------------------------------------------------------
# Pagina publica del invitado (sin cuenta)
# ----------------------------------------------------------------------
@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([PublicInvitationThrottle])
def public_invitation(request, code):
    invitation = PublicInvitationService.get(code)
    return Response(PublicInvitationSerializer(invitation).data)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PublicInvitationThrottle])
def public_invitation_respond(request, code):
    invitation = PublicInvitationService.get(code)
    invitation = PublicInvitationService.respond(invitation, request.data.get('rsvp_status'))
    return Response(PublicInvitationSerializer(invitation).data)
