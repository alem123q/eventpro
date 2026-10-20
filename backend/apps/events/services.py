import logging

from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Count, Q
from rest_framework.exceptions import ValidationError

from config.emails import show_dev_link
from users.models import User

from .models import Event, EventCollaborator
from .serializers import (
    EventCreateSerializer,
    EventDetailSerializer,
    EventListSerializer,
    EventStatusSerializer,
    EventUpdateSerializer,
)


class EventService:
    @staticmethod
    def _base_queryset():
        return Event.objects.select_related('organizer').annotate(
            guest_count=Count('invitations', distinct=True),
            confirmed_count=Count(
                'invitations',
                filter=Q(invitations__rsvp_status='confirmed'),
                distinct=True,
            ),
            attendance_count=Count('attendances', distinct=True),
        )

    @staticmethod
    def list_events(user, params):
        queryset = EventService._base_queryset()

        queryset = EventService._visible(queryset, user)

        # ?my_role=organizer|collaborator: solo los propios o solo donde colabora
        my_role = params.get('my_role')
        if my_role == 'organizer':
            queryset = queryset.filter(organizer=user)
        elif my_role == 'collaborator':
            queryset = queryset.exclude(organizer=user)

        status = params.get('status')
        if status:
            queryset = queryset.filter(status=status)

        category = params.get('category')
        if category:
            queryset = queryset.filter(category=category)

        search = params.get('search')
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) |
                Q(description__icontains=search) |
                Q(location__icontains=search),
            )

        ordering = params.get('ordering', '-event_date')
        allowed_ordering = [
            'event_date', '-event_date', 'created_at', '-created_at',
            'title', '-title', 'status', '-status',
        ]
        if ordering in allowed_ordering:
            queryset = queryset.order_by(ordering)

        return queryset

    @staticmethod
    def _visible(queryset, user):
        """Eventos que el usuario organiza o donde colabora (todos, si es admin)."""
        if user.role == 'admin':
            return queryset
        collaborations = EventCollaborator.objects.filter(user=user).values('event_id')
        return queryset.filter(Q(organizer=user) | Q(id__in=collaborations))

    @staticmethod
    def get_event(event_id, user):
        return EventService._visible(EventService._base_queryset(), user).get(id=event_id)

    @staticmethod
    def create_event(user, data):
        serializer = EventCreateSerializer(
            data=data,
            context={'request': type('Req', (), {'user': user})()},
        )
        serializer.is_valid(raise_exception=True)
        event = serializer.save()
        return event

    @staticmethod
    def update_event(event, data):
        serializer = EventUpdateSerializer(event, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        return serializer.save()

    @staticmethod
    def delete_event(event):
        event.delete()
        return True

    @staticmethod
    def change_status(event, new_status):
        serializer = EventStatusSerializer(data={'status': new_status})
        serializer.is_valid(raise_exception=True)

        if not event.can_transition_to(new_status):
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                f'No es posible cambiar de "{event.get_status_display()}" '
                f'a "{dict(Event.Status.choices).get(new_status, new_status)}".',
            )

        event.status = new_status
        event.save()
        return event


logger = logging.getLogger(__name__)


class CollaboratorService:
    @staticmethod
    def list(event):
        return event.collaborators.select_related('user')

    @staticmethod
    def add(event, email):
        email = (email or '').strip().lower()
        if not email:
            raise ValidationError({'detail': 'Ingresá el email de la persona.'})
        try:
            user = User.objects.get(email__iexact=email, is_active=True)
        except User.DoesNotExist:
            raise ValidationError({
                'detail': 'No hay ninguna cuenta con ese email. Pedile que se registre en '
                          'EventPro y después agregala.',
            })
        if user.id == event.organizer_id:
            raise ValidationError({'detail': 'Sos el organizador de este evento: ya tenés acceso a todo.'})
        if EventCollaborator.objects.filter(event=event, user=user).exists():
            raise ValidationError({'detail': 'Esa persona ya es colaboradora de este evento.'})
        collaborator = EventCollaborator.objects.create(event=event, user=user)
        CollaboratorService._notify(collaborator)
        return collaborator

    @staticmethod
    def remove(event, user_id):
        deleted, _ = EventCollaborator.objects.filter(event=event, user_id=user_id).delete()
        if not deleted:
            raise ValidationError({'detail': 'Esa persona no es colaboradora de este evento.'})

    @staticmethod
    def _notify(collaborator):
        event = collaborator.event
        url = f"{settings.FRONTEND_URL or 'https://localhost:5173'}/events/{event.id}"
        organizer = event.organizer.get_full_name() or event.organizer.email
        show_dev_link('Aviso de colaborador', collaborator.user.email, url)
        try:
            send_mail(
                subject=f'Te agregaron como colaborador: {event.title}',
                message=(
                    f'Hola {collaborator.user.first_name}:\n\n'
                    f'{organizer} te agregó como colaborador del evento «{event.title}» '
                    f'({event.event_date:%d/%m/%Y}). Vas a poder registrar el ingreso de los '
                    f'invitados desde la pantalla de check-in.\n\nEntrá desde: {url}\n'
                ),
                from_email=settings.DEFAULT_FROM_EMAIL or 'noreply@example.com',
                recipient_list=[collaborator.user.email],
                fail_silently=False,
            )
        except Exception as e:  # noqa: BLE001
            logger.warning('Error al avisar al colaborador %s: %s', collaborator.user.email, e)
