from django.db import IntegrityError, transaction
from django.db.models import Q

from events.models import Event
from invitations.models import Invitation
from rest_framework.exceptions import NotFound, ValidationError

from .models import Attendance


class AttendanceService:
    @staticmethod
    def list_attendances(user, params):
        queryset = Attendance.objects.select_related(
            'invitation', 'event__organizer',
        )

        event_id = params.get('event')
        if event_id:
            queryset = queryset.filter(event_id=event_id)

        search = params.get('search')
        if search:
            queryset = queryset.filter(
                Q(invitation__first_name__icontains=search) |
                Q(invitation__last_name__icontains=search) |
                Q(invitation__email__icontains=search),
            )

        if user.role != 'admin':
            queryset = queryset.filter(event__organizer=user)

        return queryset.order_by('-checkin_time')

    @staticmethod
    def resolve_invitation_from_qr(qr_code):
        invitation = Invitation.objects.select_related(
            'event__organizer',
        ).filter(qr_hash=qr_code).first()

        if invitation is None:
            raise ValidationError({
                'detail': 'Código QR inválido. No se encontró una invitación que coincida.',
            })
        return invitation

    @staticmethod
    def checkin(invitation):
        with transaction.atomic():
            inv = Invitation.objects.select_related(
                'event',
            ).select_for_update().get(id=invitation.id)

            if inv.rsvp_status != Invitation.RSVPStatus.CONFIRMED:
                raise ValidationError({
                    'detail': (
                        f'{inv.full_name} todavía no confirmó asistencia (RSVP no confirmado). '
                        'Marcalo como confirmado en la lista de invitados para registrar su ingreso.'
                    ),
                })

            if inv.event.status != Event.Status.ACTIVE:
                raise ValidationError({
                    'detail': 'El evento no está activo. Activalo desde el detalle del evento para hacer el check-in.',
                })

            attendance = Attendance.objects.filter(invitation=inv).first()
            if attendance is not None:
                return attendance

            try:
                attendance = Attendance.objects.create(
                    invitation=inv,
                    event=inv.event,
                )
            except IntegrityError:
                attendance = Attendance.objects.get(invitation=inv)

        return attendance

    @staticmethod
    def get_attendance(pk, user):
        try:
            attendance = Attendance.objects.select_related(
                'invitation', 'event__organizer',
            ).get(id=pk)
        except Attendance.DoesNotExist:
            raise NotFound('Asistencia no encontrada.')
        return attendance
