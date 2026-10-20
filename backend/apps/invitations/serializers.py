from events.models import Event
from rest_framework import serializers

from .models import Invitation
from .validators import validate_unique_guest


class InvitationSerializer(serializers.ModelSerializer):
    event_title = serializers.SerializerMethodField()
    attended = serializers.SerializerMethodField()

    class Meta:
        model = Invitation
        fields = [
            'id', 'first_name', 'last_name', 'email', 'phone',
            'rsvp_status', 'event', 'event_title',
            'attended', 'qr_hash', 'invited_at', 'responded_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'rsvp_status', 'qr_hash', 'invited_at', 'responded_at',
            'created_at', 'updated_at',
        ]

    def get_event_title(self, obj):
        return obj.event.title

    def get_attended(self, obj):
        return hasattr(obj, 'attendance') and obj.attendance is not None


class InvitationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invitation
        fields = ['first_name', 'last_name', 'email', 'phone', 'event']

    def validate(self, data):
        validate_unique_guest(data['event'].id, data['email'])
        return data


class InvitationBatchSerializer(serializers.Serializer):
    event = serializers.PrimaryKeyRelatedField(
        queryset=Event.objects.all(),
    )
    guests = serializers.ListField(
        child=serializers.DictField(),
        min_length=1,
        max_length=100,
    )

    def validate_guests(self, value):
        errors = []
        for i, guest in enumerate(value):
            guest_errors = {}
            if not guest.get('first_name'):
                guest_errors['first_name'] = 'Este campo es obligatorio.'
            if not guest.get('last_name'):
                guest_errors['last_name'] = 'Este campo es obligatorio.'
            if not guest.get('email'):
                guest_errors['email'] = 'Este campo es obligatorio.'
            if guest_errors:
                errors.append({'index': i, 'errors': guest_errors})
        if errors:
            raise serializers.ValidationError(errors)
        return value


class InvitationUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invitation
        fields = ['first_name', 'last_name', 'email', 'phone']

    def validate(self, data):
        if self.instance and 'email' in data:
            validate_unique_guest(
                self.instance.event_id,
                data['email'],
                exclude_id=self.instance.id,
            )
        return data


class InvitationRSVPSerializer(serializers.Serializer):
    rsvp_status = serializers.ChoiceField(choices=Invitation.RSVPStatus.choices)


class PublicInvitationSerializer(serializers.ModelSerializer):
    """Datos que ve el invitado en su pagina. No incluye datos de otros
    invitados ni del organizador mas alla de su nombre."""
    event = serializers.SerializerMethodField()
    attended = serializers.SerializerMethodField()
    can_respond = serializers.SerializerMethodField()
    closed_reason = serializers.SerializerMethodField()
    qr_code = serializers.SerializerMethodField()

    class Meta:
        model = Invitation
        fields = [
            'first_name', 'last_name', 'rsvp_status', 'responded_at',
            'attended', 'can_respond', 'closed_reason', 'qr_code', 'event',
        ]

    def get_event(self, obj):
        e = obj.event
        organizer = e.organizer.get_full_name() or e.organizer.email
        return {
            'title': e.title,
            'description': e.description,
            'event_date': e.event_date,
            'event_time': e.event_time,
            'location': e.location,
            'image': e.image.url if e.image else None,
            'status': e.status,
            'organizer_name': organizer,
        }

    def get_attended(self, obj):
        return hasattr(obj, 'attendance')

    def _closed(self, obj):
        from .services import PublicInvitationService
        return PublicInvitationService.closed_reason(obj)

    def get_can_respond(self, obj):
        return self._closed(obj) is None

    def get_closed_reason(self, obj):
        return self._closed(obj)

    def get_qr_code(self, obj):
        # El codigo solo sirve para ingresar si el invitado confirmo
        return obj.qr_hash if obj.rsvp_status == Invitation.RSVPStatus.CONFIRMED else None
