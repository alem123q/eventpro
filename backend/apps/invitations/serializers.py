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
            'attended', 'qr_hash', 'created_at', 'updated_at',
        ]
        read_only_fields = ['rsvp_status', 'qr_hash', 'created_at', 'updated_at']

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
