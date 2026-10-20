from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from config import csv_export
from events.models import Event

from .emails import send_invitation_email
from .models import Invitation
from .serializers import (
    InvitationBatchSerializer,
    InvitationCreateSerializer,
    InvitationSerializer,
    InvitationUpdateSerializer,
)


class InvitationService:
    @staticmethod
    def list_invitations(user, params):
        queryset = Invitation.objects.select_related('event__organizer', 'attendance')

        event_id = params.get('event')
        if event_id:
            queryset = queryset.filter(event_id=event_id)

        rsvp_status = params.get('rsvp_status')
        if rsvp_status:
            queryset = queryset.filter(rsvp_status=rsvp_status)

        # ?not_invited=true: los que todavia no recibieron la invitacion (y no ingresaron)
        if params.get('not_invited') == 'true':
            queryset = queryset.filter(invited_at__isnull=True, attendance__isnull=True)

        search = params.get('search')
        if search:
            queryset = queryset.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(email__icontains=search),
            )

        if user.role != 'admin':
            queryset = queryset.filter(event__organizer=user)

        return queryset.order_by('-created_at')

    @staticmethod
    def create_invitation(data):
        serializer = InvitationCreateSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        return serializer.save()

    @staticmethod
    def create_invitations_batch(data):
        serializer = InvitationBatchSerializer(data=data)
        serializer.is_valid(raise_exception=True)

        event = serializer.validated_data['event']
        guests_data = serializer.validated_data['guests']

        created = []
        errors = []

        for i, guest in enumerate(guests_data):
            guest['event'] = event.id
            gs = InvitationCreateSerializer(data=guest)
            if gs.is_valid():
                created.append(gs.save())
            else:
                flat_errors = {}
                for field, msgs in gs.errors.items():
                    flat_errors[field] = msgs[0] if isinstance(msgs, list) else msgs
                errors.append({'index': i, 'errors': flat_errors})

        return created, errors

    @staticmethod
    def update_invitation(invitation, data):
        serializer = InvitationUpdateSerializer(invitation, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        return serializer.save()

    @staticmethod
    def delete_invitation(invitation):
        invitation.delete()
        return True

    @staticmethod
    def change_rsvp(invitation, new_status):
        already_attended = hasattr(invitation, 'attendance')
        if already_attended and new_status != Invitation.RSVPStatus.CONFIRMED:
            raise ValidationError({
                'detail': 'Este invitado ya ingresó al evento: no se puede quitar su confirmación.',
            })
        invitation.rsvp_status = new_status
        # La respuesta pasa a ser del organizador, ya no la del invitado
        invitation.responded_at = None
        invitation.save()
        return invitation


    # ------------------------------------------------------------------
    # Envio por correo
    # ------------------------------------------------------------------
    @staticmethod
    def _check_can_send(event):
        if event.status != Event.Status.ACTIVE:
            raise ValidationError({
                'detail': 'Solo se pueden enviar invitaciones de un evento activo. '
                          'Activá el evento antes de enviarlas.',
            })

    @staticmethod
    def send_invitation(invitation):
        InvitationService._check_can_send(invitation.event)
        if hasattr(invitation, 'attendance'):
            raise ValidationError({'detail': 'Este invitado ya ingresó al evento.'})
        if not send_invitation_email(invitation):
            raise ValidationError({'detail': 'No se pudo enviar el correo. Probá de nuevo más tarde.'})
        return invitation

    @staticmethod
    def send_pending_invitations(event):
        """Envia la invitacion a quienes todavia no la recibieron."""
        InvitationService._check_can_send(event)
        pending = event.invitations.filter(invited_at__isnull=True, attendance__isnull=True)
        sent = failed = 0
        for invitation in pending.select_related('event__organizer'):
            if send_invitation_email(invitation):
                sent += 1
            else:
                failed += 1
        return {'sent': sent, 'failed': failed}


class InvitationExportService:
    HEADER = [
        'Nombre', 'Apellido', 'Email', 'Teléfono', 'Respuesta',
        'Respondió el invitado', 'Invitación enviada', 'Ingresó', 'Hora de ingreso',
    ]

    @staticmethod
    def guests_csv(event):
        labels = dict(Invitation.RSVPStatus.choices)
        invitations = (
            event.invitations.select_related('attendance')
            .order_by('last_name', 'first_name')
        )
        rows = []
        for inv in invitations:
            # Sin ingreso, Django lanza un error que hereda de AttributeError
            attendance = getattr(inv, 'attendance', None)
            rows.append([
                inv.first_name,
                inv.last_name,
                inv.email,
                inv.phone or '',
                labels.get(inv.rsvp_status, inv.rsvp_status),
                csv_export.yes_no(inv.responded_at),
                csv_export.datetime_local(inv.invited_at),
                csv_export.yes_no(attendance),
                csv_export.datetime_local(attendance.checkin_time) if attendance else '',
            ])
        return csv_export.csv_response(
            csv_export.filename_for('invitados', event.title),
            InvitationExportService.HEADER, rows,
        )


class PublicInvitationService:
    """Lo que puede ver y hacer el invitado desde el enlace de su invitacion,
    sin cuenta. El codigo del enlace es el mismo codigo QR (128 bits al azar)."""

    RESPONSES = (Invitation.RSVPStatus.CONFIRMED, Invitation.RSVPStatus.REJECTED)

    @staticmethod
    def get(code):
        try:
            invitation = Invitation.objects.select_related(
                'event__organizer', 'attendance',
            ).get(qr_hash=code)
        except (Invitation.DoesNotExist, ValueError):
            raise NotFound('Invitación no encontrada.')
        # Un borrador todavia se esta armando: no se muestra
        if invitation.event.status == Event.Status.DRAFT:
            raise NotFound('Invitación no encontrada.')
        return invitation

    @staticmethod
    def closed_reason(invitation):
        """Motivo por el que el invitado ya no puede cambiar su respuesta."""
        if hasattr(invitation, 'attendance'):
            return 'Ya ingresaste al evento.'
        if invitation.event.status == Event.Status.FINISHED:
            return 'El evento ya finalizó.'
        return None

    @staticmethod
    def respond(invitation, new_status):
        if new_status not in PublicInvitationService.RESPONSES:
            raise ValidationError({'detail': 'Respuesta inválida.'})
        reason = PublicInvitationService.closed_reason(invitation)
        if reason:
            raise ValidationError({'detail': f'{reason} Ya no se puede cambiar la respuesta.'})
        invitation.rsvp_status = new_status
        invitation.responded_at = timezone.now()
        invitation.save(update_fields=['rsvp_status', 'responded_at', 'updated_at'])
        return invitation
