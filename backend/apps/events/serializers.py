from rest_framework import serializers

from .models import Event, EventCollaborator
from .validators import validate_event_date_not_past


class MyRoleMixin(serializers.Serializer):
    """Agrega `my_role` (organizer, admin o collaborator) segun quien pide.
    Al colaborador no se le muestra el presupuesto: los gastos son del organizador."""
    my_role = serializers.SerializerMethodField()

    def get_my_role(self, obj):
        user = self.context.get('user')
        if user is None:
            return None
        if obj.organizer_id == user.id:
            return 'organizer'
        if user.role == 'admin':
            return 'admin'
        # Si lo esta viendo y no lo organiza, es porque colabora
        return 'collaborator'

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get('my_role') == 'collaborator':
            data['budget'] = None
        return data


class EventListSerializer(MyRoleMixin, serializers.ModelSerializer):
    organizer_name = serializers.SerializerMethodField()
    guest_count = serializers.IntegerField(read_only=True)
    confirmed_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Event
        fields = [
            'id', 'title', 'description', 'event_date', 'event_time', 'location',
            'category', 'image', 'budget', 'status', 'organizer_name',
            'guest_count', 'confirmed_count', 'created_at', 'my_role',
        ]

    def get_organizer_name(self, obj):
        return obj.organizer.get_full_name()


class EventDetailSerializer(MyRoleMixin, serializers.ModelSerializer):
    organizer_name = serializers.SerializerMethodField()
    guest_count = serializers.IntegerField(read_only=True)
    confirmed_count = serializers.IntegerField(read_only=True)
    attendance_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Event
        fields = [
            'id', 'title', 'description', 'event_date', 'event_time',
            'location', 'category', 'image', 'budget', 'status',
            'organizer', 'organizer_name',
            'guest_count', 'confirmed_count', 'attendance_count',
            'created_at', 'updated_at', 'my_role',
        ]
        read_only_fields = ['organizer', 'created_at', 'updated_at']

    def get_organizer_name(self, obj):
        return obj.organizer.get_full_name()


class EventCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = [
            'title', 'description', 'event_date', 'event_time',
            'location', 'category', 'image', 'budget',
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
            'location', 'category', 'image', 'budget',
        ]

    def validate_event_date(self, value):
        validate_event_date_not_past(value)
        return value


class EventStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Event.Status.choices)


class EventCollaboratorSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source='user.id', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    name = serializers.SerializerMethodField()

    class Meta:
        model = EventCollaborator
        fields = ['id', 'email', 'name', 'added_at']

    def get_name(self, obj):
        return obj.user.get_full_name()
