from rest_framework import serializers

from invitations.models import Invitation

from .models import Attendance


class AttendanceListSerializer(serializers.ModelSerializer):
    invitation_name = serializers.SerializerMethodField()
    invitation_email = serializers.SerializerMethodField()
    event_title = serializers.SerializerMethodField()
    rsvp_status = serializers.SerializerMethodField()

    class Meta:
        model = Attendance
        fields = [
            'id', 'invitation_name', 'invitation_email',
            'event_title', 'rsvp_status', 'checkin_time',
        ]

    def get_invitation_name(self, obj):
        return obj.invitation.full_name

    def get_invitation_email(self, obj):
        return obj.invitation.email

    def get_event_title(self, obj):
        return obj.event.title

    def get_rsvp_status(self, obj):
        return obj.invitation.rsvp_status


class AttendanceDetailSerializer(serializers.ModelSerializer):
    invitation_name = serializers.SerializerMethodField()
    invitation_email = serializers.SerializerMethodField()
    invitation_phone = serializers.SerializerMethodField()
    event_title = serializers.SerializerMethodField()
    rsvp_status = serializers.SerializerMethodField()

    class Meta:
        model = Attendance
        fields = [
            'id', 'invitation_name', 'invitation_email',
            'invitation_phone', 'event_title', 'rsvp_status',
            'qr_code', 'checkin_time',
        ]
        read_only_fields = ['qr_code', 'checkin_time']

    def get_invitation_name(self, obj):
        return obj.invitation.full_name

    def get_invitation_email(self, obj):
        return obj.invitation.email

    def get_invitation_phone(self, obj):
        return obj.invitation.phone

    def get_event_title(self, obj):
        return obj.event.title

    def get_rsvp_status(self, obj):
        return obj.invitation.rsvp_status


class AttendanceCheckinSerializer(serializers.Serializer):
    qr_code = serializers.CharField(max_length=255)
    # Evento en el que se esta haciendo el check-in. Si se envia, el codigo
    # tiene que pertenecer a ese evento.
    event = serializers.IntegerField(required=False)

    def validate_qr_code(self, value):
        if not value.strip():
            raise serializers.ValidationError(
                'El código QR no puede estar vacío.',
            )
        return value.strip()
