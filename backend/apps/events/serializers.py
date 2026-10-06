from rest_framework import serializers

from .models import Event
from .validators import validate_event_date_not_past


class EventListSerializer(serializers.ModelSerializer):
    organizer_name = serializers.SerializerMethodField()
    guest_count = serializers.IntegerField(read_only=True)
    confirmed_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Event
        fields = [
            'id', 'title', 'description', 'event_date', 'event_time', 'location',
            'category', 'image', 'status', 'organizer_name',
            'guest_count', 'confirmed_count', 'created_at',
        ]

    def get_organizer_name(self, obj):
        return obj.organizer.get_full_name()


class EventDetailSerializer(serializers.ModelSerializer):
    organizer_name = serializers.SerializerMethodField()
    guest_count = serializers.IntegerField(read_only=True)
    confirmed_count = serializers.IntegerField(read_only=True)
    attendance_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Event
        fields = [
            'id', 'title', 'description', 'event_date', 'event_time',
            'location', 'category', 'image', 'status',
            'organizer', 'organizer_name',
            'guest_count', 'confirmed_count', 'attendance_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['organizer', 'created_at', 'updated_at']

    def get_organizer_name(self, obj):
        return obj.organizer.get_full_name()


class EventCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = [
            'title', 'description', 'event_date', 'event_time',
            'location', 'category', 'image',
        ]

    def validate_event_date(self, value):
        validate_event_date_not_past(value)
        return value

    def create(self, validated_data):
        validated_data['organizer'] = self.context['request'].user
        return super().create(validated_data)


class EventUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = [
            'title', 'description', 'event_date', 'event_time',
            'location', 'category', 'image',
        ]

    def validate_event_date(self, value):
        validate_event_date_not_past(value)
        return value


class EventStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Event.Status.choices)
