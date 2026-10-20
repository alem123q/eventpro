from datetime import date, timedelta

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from invitations.models import Invitation
from users.models import User

from .models import Event, EventCollaborator
from .permissions import IsEventOrganizer
from .serializers import EventCreateSerializer, EventStatusSerializer
from .services import EventService


def _make_organizer(email='org@test.com'):
    return User.objects.create_user(
        email=email,
        username=email,
        password='Pass1234',
        role='organizer',
        first_name='Org',
        last_name='Test',
    )


class EventCreateSerializerTest(TestCase):
    def setUp(self):
        self.user = _make_organizer()
        self.valid_data = {
            'title': 'Test Event',
            'description': 'Description',
            'event_date': date.today() + timedelta(days=10),
            'event_time': '15:00',
            'location': 'Sala A',
            'category': 'conference',
        }

    def _build_serializer(self, data):
        factory = APIRequestFactory()
        request = factory.post('/')
        request.user = self.user
        return EventCreateSerializer(data=data, context={'request': request})

    def test_create_serializer_excludes_status_from_validated_data(self):
        data = {**self.valid_data, 'status': 'active'}
        serializer = self._build_serializer(data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertNotIn('status', serializer.validated_data)

    def test_create_serializer_accepts_without_status(self):
        serializer = self._build_serializer(self.valid_data)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_create_serializer_rejects_future_status_field(self):
        serializer = self._build_serializer(
            {**self.valid_data, 'status': 'non-existent'}
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertNotIn('status', serializer.validated_data)


class EventCreateServiceTest(TestCase):
    def setUp(self):
        self.user = _make_organizer()

    def test_created_event_is_always_draft(self):
        event = EventService.create_event(self.user, {
            'title': 'New Event',
            'event_date': date.today() + timedelta(days=5),
            'category': 'workshop',
        })
        self.assertEqual(event.status, Event.Status.DRAFT)

    def test_created_event_with_status_in_data_is_still_draft(self):
        event = EventService.create_event(self.user, {
            'title': 'New Event',
            'event_date': date.today() + timedelta(days=5),
            'category': 'workshop',
            'status': 'active',
        })
        self.assertEqual(event.status, Event.Status.DRAFT)

    def test_create_event_sets_organizer(self):
        event = EventService.create_event(self.user, {
            'title': 'New Event',
            'event_date': date.today() + timedelta(days=5),
            'category': 'workshop',
        })
        self.assertEqual(event.organizer, self.user)

    def test_create_event_rejects_past_date(self):
        with self.assertRaises(Exception):
            EventService.create_event(self.user, {
                'title': 'Past Event',
                'event_date': date.today() - timedelta(days=1),
                'category': 'workshop',
            })


class EventStatusTransitionTest(TestCase):
    def setUp(self):
        self.user = _make_organizer()
        self.event = EventService.create_event(self.user, {
            'title': 'Transition Event',
            'event_date': date.today() + timedelta(days=10),
            'category': 'conference',
        })

    def test_draft_to_active_valid(self):
        result = EventService.change_status(self.event, 'active')
        self.assertEqual(result.status, Event.Status.ACTIVE)

    def test_active_to_finished_valid(self):
        self.event.status = Event.Status.ACTIVE
        self.event.save()
        result = EventService.change_status(self.event, 'finished')
        self.assertEqual(result.status, Event.Status.FINISHED)

    def test_draft_to_finished_invalid(self):
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            EventService.change_status(self.event, 'finished')

    def test_finished_to_active_invalid(self):
        from rest_framework.exceptions import ValidationError
        self.event.status = Event.Status.FINISHED
        self.event.save()
        with self.assertRaises(ValidationError):
            EventService.change_status(self.event, 'active')

    def test_finished_to_draft_invalid(self):
        from rest_framework.exceptions import ValidationError
        self.event.status = Event.Status.FINISHED
        self.event.save()
        with self.assertRaises(ValidationError):
            EventService.change_status(self.event, 'draft')

    def test_invalid_status_value_raises_error(self):
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            EventService.change_status(self.event, 'invalid-status')

    def test_same_status_is_rejected(self):
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            EventService.change_status(self.event, 'draft')


class EventStatusSerializerTest(TestCase):
    def test_valid_status_accepted(self):
        serializer = EventStatusSerializer(data={'status': 'active'})
        self.assertTrue(serializer.is_valid())

    def test_invalid_status_rejected(self):
        serializer = EventStatusSerializer(data={'status': 'bogus'})
        self.assertFalse(serializer.is_valid())

    def test_empty_status_rejected(self):
        serializer = EventStatusSerializer(data={})
        self.assertFalse(serializer.is_valid())

    def test_none_status_rejected(self):
        serializer = EventStatusSerializer(data={'status': None})
        self.assertFalse(serializer.is_valid())


class CollaboratorEventServiceTest(TestCase):
    def setUp(self):
        self.organizer = User.objects.create_user(
            email='org@test.com',
            username='org',
            password='Pass1234',
            role='organizer',
        )
        self.collaborator = User.objects.create_user(
            email='col@test.com',
            username='col',
            password='Pass1234',
            role='collaborator',
        )
        self.other_collaborator = User.objects.create_user(
            email='other@test.com',
            username='other',
            password='Pass1234',
            role='collaborator',
        )
        self.event = EventService.create_event(self.organizer, {
            'title': 'Collaborator Event',
            'event_date': date.today() + timedelta(days=5),
            'category': 'workshop',
        })
        # Colaborador asignado al evento (antes bastaba con estar invitado)
        EventCollaborator.objects.create(event=self.event, user=self.collaborator)
        Invitation.objects.create(
            event=self.event,
            email='unrelated@test.com',
            first_name='Other',
            last_name='Guest',
        )

    def test_collaborator_lists_assigned_event(self):
        events = EventService.list_events(self.collaborator, {})
        self.assertIn(self.event, events)

    def test_collaborator_list_excludes_unassigned_event(self):
        other_event = EventService.create_event(self.organizer, {
            'title': 'Other Event',
            'event_date': date.today() + timedelta(days=10),
            'category': 'conference',
        })
        events = EventService.list_events(self.collaborator, {})
        self.assertNotIn(other_event, events)

    def test_other_collaborator_not_assigned_sees_no_events(self):
        events = EventService.list_events(self.other_collaborator, {})
        self.assertNotIn(self.event, events)

    def test_collaborator_gets_assigned_event_by_id(self):
        event = EventService.get_event(self.event.id, self.collaborator)
        self.assertEqual(event, self.event)

    def test_collaborator_cannot_get_unassigned_event(self):
        other_event = EventService.create_event(self.organizer, {
            'title': 'Other Event',
            'event_date': date.today() + timedelta(days=10),
            'category': 'conference',
        })
        with self.assertRaises(Event.DoesNotExist):
            EventService.get_event(other_event.id, self.collaborator)

    def test_assigned_collaborator_can_view_event_list(self):
        events = EventService.list_events(self.collaborator, {})
        self.assertEqual(len(events), 1)

    def test_collaborator_list_sees_no_events_when_not_assigned(self):
        new_user = User.objects.create_user(
            email='new@test.com',
            username='new',
            password='Pass1234',
            role='collaborator',
        )
        events = EventService.list_events(new_user, {})
        self.assertEqual(len(events), 0)


class CollaboratorPermissionTest(TestCase):
    def setUp(self):
        self.organizer = User.objects.create_user(
            email='org@test.com',
            username='org',
            password='Pass1234',
            role='organizer',
        )
        self.collaborator = User.objects.create_user(
            email='col@test.com',
            username='col',
            password='Pass1234',
            role='collaborator',
        )
        self.event = EventService.create_event(self.organizer, {
            'title': 'Permission Event',
            'event_date': date.today() + timedelta(days=5),
            'category': 'workshop',
        })

    def _make_request(self, method='GET', user=None):
        factory = APIRequestFactory()
        request = factory.generic(method, '/')
        request.user = user or self.collaborator
        return request

    def test_assigned_collaborator_can_view(self):
        EventCollaborator.objects.create(event=self.event, user=self.collaborator)
        request = self._make_request('GET')
        self.assertTrue(
            IsEventOrganizer().has_object_permission(request, None, self.event)
        )

    def test_collaborator_not_invited_cannot_view(self):
        request = self._make_request('GET')
        self.assertFalse(
            IsEventOrganizer().has_object_permission(request, None, self.event)
        )

    def test_being_a_guest_does_not_give_access(self):
        # La regla anterior daba acceso a quien figuraba como invitado
        Invitation.objects.create(
            event=self.event,
            email=self.collaborator.email,
            first_name='Col',
            last_name='Test',
        )
        request = self._make_request('GET')
        self.assertFalse(
            IsEventOrganizer().has_object_permission(request, None, self.event)
        )

    def test_collaborator_cannot_modify(self):
        EventCollaborator.objects.create(event=self.event, user=self.collaborator)
        for method in ('PUT', 'PATCH', 'DELETE'):
            request = self._make_request(method)
            self.assertFalse(
                IsEventOrganizer().has_object_permission(request, None, self.event),
                f'collaborator should not {method}',
            )

    def test_organizer_can_modify(self):
        request = self._make_request('PUT', user=self.organizer)
        self.assertTrue(
            IsEventOrganizer().has_object_permission(request, None, self.event)
        )


# ----------------------------------------------------------------------
# Colaboradores por evento (API completa)
# ----------------------------------------------------------------------
from decimal import Decimal  # noqa: E402

from django.core import mail  # noqa: E402
from django.urls import reverse  # noqa: E402
from rest_framework.test import APIClient  # noqa: E402

from attendance.models import Attendance  # noqa: E402
from expenses.models import Expense  # noqa: E402


class CollaboratorApiTests(TestCase):
    def setUp(self):
        self.organizer = User.objects.create_user(
            email='org@test.com', username='org', password='Pass1234',
            first_name='Francisco', last_name='Alemandi',
        )
        self.helper = User.objects.create_user(
            email='eloy@test.com', username='eloy', password='Pass1234',
            first_name='Eloy', last_name='Kirov',
        )
        self.stranger = User.objects.create_user(
            email='otro@test.com', username='otro', password='Pass1234',
        )
        self.event = Event.objects.create(
            title='Asado', event_date=date.today() + timedelta(days=5),
            organizer=self.organizer, status=Event.Status.ACTIVE, budget=Decimal('5000'),
        )
        self.guest = Invitation.objects.create(
            event=self.event, first_name='Ana', last_name='B', email='ana@test.com',
            rsvp_status=Invitation.RSVPStatus.CONFIRMED,
        )
        Expense.objects.create(event=self.event, concept='Carne', amount=Decimal('100'))
        self.org = APIClient()
        self.org.force_authenticate(self.organizer)
        self.col = APIClient()
        self.col.force_authenticate(self.helper)
        self.collab_url = reverse('event-collaborators', args=[self.event.id])

    def _add(self, email='eloy@test.com'):
        return self.org.post(self.collab_url, {'email': email}, format='json')

    # --- alta y baja ---
    def test_organizer_adds_collaborator_by_email(self):
        response = self._add('ELOY@test.com ')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['email'], 'eloy@test.com')
        self.assertEqual(response.data['name'], 'Eloy Kirov')
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('colaborador', mail.outbox[0].subject)
        listed = self.org.get(self.collab_url).data
        self.assertEqual([c['email'] for c in listed], ['eloy@test.com'])

    def test_add_validations(self):
        self.assertIn('registre', self._add('nadie@test.com').data['detail'])
        self.assertIn('organizador', self._add('org@test.com').data['detail'])
        self._add()
        self.assertIn('ya es colaboradora', self._add().data['detail'])

    def test_only_organizer_manages_collaborators(self):
        self._add()
        stranger = APIClient()
        stranger.force_authenticate(self.stranger)

        self.assertEqual(stranger.get(self.collab_url).status_code, 403)
        self.assertEqual(stranger.post(self.collab_url, {'email': 'otro@test.com'}, format='json').status_code, 403)
        # Un colaborador tampoco puede sumar a otros
        self.assertEqual(self.col.post(self.collab_url, {'email': 'otro@test.com'}, format='json').status_code, 403)

    # --- lo que puede el colaborador ---
    def test_collaborator_sees_event_with_role_and_without_budget(self):
        self._add()

        events = self.col.get(reverse('event-list')).data['results']
        detail = self.col.get(reverse('event-detail', args=[self.event.id])).data

        self.assertEqual([e['id'] for e in events], [self.event.id])
        self.assertEqual(events[0]['my_role'], 'collaborator')
        self.assertIsNone(events[0]['budget'])
        self.assertEqual(detail['my_role'], 'collaborator')
        self.assertIsNone(detail['budget'])
        own = self.org.get(reverse('event-detail', args=[self.event.id])).data
        self.assertEqual(own['my_role'], 'organizer')
        self.assertEqual(Decimal(own['budget']), Decimal('5000'))

    def test_event_list_filter_by_my_role(self):
        self._add()
        Event.objects.create(title='Propio', event_date=date.today() + timedelta(days=9), organizer=self.helper)

        mine = self.col.get(reverse('event-list'), {'my_role': 'organizer'}).data['results']
        helping = self.col.get(reverse('event-list'), {'my_role': 'collaborator'}).data['results']

        self.assertEqual([e['title'] for e in mine], ['Propio'])
        self.assertEqual([e['title'] for e in helping], ['Asado'])

    def test_collaborator_can_work_the_door(self):
        self._add()

        guests = self.col.get(reverse('invitation-list'), {'event': self.event.id})
        checkin = self.col.post(reverse('attendance-checkin'),
                                {'qr_code': self.guest.qr_hash, 'event': self.event.id}, format='json')
        history = self.col.get(reverse('attendance-list'), {'event': self.event.id})

        self.assertEqual(guests.status_code, 200)
        self.assertEqual(guests.data['count'], 1)
        self.assertEqual(checkin.status_code, 200)
        self.assertTrue(Attendance.objects.filter(invitation=self.guest).exists())
        self.assertEqual(history.status_code, 200)
        self.assertEqual(history.data['count'], 1)

    def test_collaborator_cannot_change_anything_else(self):
        self._add()
        e = self.event.id
        forbidden = [
            self.col.patch(reverse('event-detail', args=[e]), {'title': 'X'}, format='json'),
            self.col.patch(reverse('event-change-status', args=[e]), {'status': 'finished'}, format='json'),
            self.col.delete(reverse('event-detail', args=[e])),
            self.col.post(reverse('invitation-list'),
                          {'event': e, 'first_name': 'A', 'last_name': 'B', 'email': 'x@t.com'}, format='json'),
            self.col.patch(reverse('invitation-rsvp', args=[self.guest.id]), {'rsvp_status': 'rejected'}, format='json'),
            self.col.delete(reverse('invitation-detail', args=[self.guest.id])),
            self.col.post(reverse('invitation-send', args=[self.guest.id])),
            self.col.post(reverse('invitation-send-pending'), {'event': e}, format='json'),
            self.col.get(reverse('invitation-export'), {'event': e}),
            self.col.get(reverse('expense-summary'), {'event': e}),
            self.col.get(reverse('expense-export'), {'event': e}),
            self.col.post(reverse('expense-list'), {'event': e, 'concept': 'X', 'amount': '1'}, format='json'),
        ]
        for response in forbidden:
            self.assertEqual(response.status_code, 403, response.wsgi_request.path)
        self.event.refresh_from_db()
        self.assertEqual(self.event.title, 'Asado')
        self.assertEqual(self.event.status, Event.Status.ACTIVE)
        # La lista de gastos no muestra los del evento
        self.assertEqual(self.col.get(reverse('expense-list')).data['count'], 0)

    def test_collaboration_does_not_count_in_own_dashboard(self):
        self._add()

        stats = self.col.get(reverse('dashboard-stats')).data

        self.assertEqual(stats['total_events'], 0)
        self.assertEqual(stats['total_guests'], 0)

    def test_removed_collaborator_loses_access(self):
        self._add()
        response = self.org.delete(reverse('event-collaborator-remove', args=[self.event.id, self.helper.id]))

        checkin = self.col.post(reverse('attendance-checkin'),
                                {'qr_code': self.guest.qr_hash, 'event': self.event.id}, format='json')

        self.assertEqual(response.status_code, 204)
        self.assertEqual(checkin.status_code, 403)
        self.assertEqual(self.col.get(reverse('event-detail', args=[self.event.id])).status_code, 404)
        self.assertEqual(self.col.get(reverse('invitation-list'), {'event': self.event.id}).data['count'], 0)

    def test_stranger_cannot_check_in(self):
        stranger = APIClient()
        stranger.force_authenticate(self.stranger)

        response = stranger.post(reverse('attendance-checkin'),
                                 {'qr_code': self.guest.qr_hash, 'event': self.event.id}, format='json')

        self.assertEqual(response.status_code, 403)
