from django.db.models import Q
from rest_framework.exceptions import ValidationError

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
        invitation.save()
        return invitation
