from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from events.models import Event
from invitations.models import Invitation
from users.models import User


class DashboardStatsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='org@test.com', username='org', password='Pass1234',
            first_name='Org', last_name='User',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = reverse('dashboard-stats')

    def test_requires_authentication(self):
        response = APIClient().get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_empty_dashboard(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_events'], 0)
        self.assertEqual(response.data['events_by_month'], {})

    def test_with_events_returns_month_keys_as_text(self):
        # Antes fallaba con error 500: las claves del JSON eran fechas
        Event.objects.create(title='A', event_date='2026-12-01', organizer=self.user)
        Event.objects.create(title='B', event_date='2026-12-20', organizer=self.user)
        Event.objects.create(title='C', event_date='2027-01-05', organizer=self.user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['events_by_month'], {'2026-12': 2, '2027-01': 1})

    def test_counts_guests_by_rsvp(self):
        event = Event.objects.create(title='A', event_date='2026-12-01', organizer=self.user)
        for i, rsvp in enumerate(['confirmed', 'confirmed', 'pending', 'rejected']):
            Invitation.objects.create(
                first_name=f'G{i}', last_name='X', email=f'g{i}@test.com',
                event=event, rsvp_status=rsvp,
            )

        data = self.client.get(self.url).data

        self.assertEqual(data['total_guests'], 4)
        self.assertEqual(data['confirmed_guests'], 2)
        self.assertEqual(data['pending_guests'], 1)
        self.assertEqual(data['rejected_guests'], 1)

    def test_only_counts_own_events(self):
        other = User.objects.create_user(
            email='otro@test.com', username='otro', password='Pass1234',
            first_name='Otro', last_name='User',
        )
        Event.objects.create(title='Ajeno', event_date='2026-12-01', organizer=other)

        self.assertEqual(self.client.get(self.url).data['total_events'], 0)

    def test_attendance_rate_never_exceeds_100(self):
        # Caso real: un invitado ingreso y despues quedo como pendiente
        from attendance.models import Attendance
        event = Event.objects.create(
            title='A', event_date='2026-12-01', organizer=self.user, status='active',
        )
        confirmado = Invitation.objects.create(
            first_name='C', last_name='X', email='c@test.com',
            event=event, rsvp_status='confirmed',
        )
        pendiente = Invitation.objects.create(
            first_name='P', last_name='X', email='p@test.com',
            event=event, rsvp_status='confirmed',
        )
        Attendance.objects.create(invitation=confirmado, event=event)
        Attendance.objects.create(invitation=pendiente, event=event)
        Invitation.objects.filter(id=pendiente.id).update(rsvp_status='pending')

        data = self.client.get(self.url).data

        self.assertEqual(data['attendance_rate'], 100.0)
        self.assertEqual(data['expected_guests'], 2)

    def test_attendance_rate_partial(self):
        from attendance.models import Attendance
        event = Event.objects.create(
            title='A', event_date='2026-12-01', organizer=self.user, status='active',
        )
        invs = [
            Invitation.objects.create(
                first_name=f'G{i}', last_name='X', email=f'g{i}@test.com',
                event=event, rsvp_status='confirmed',
            )
            for i in range(4)
        ]
        Attendance.objects.create(invitation=invs[0], event=event)

        self.assertEqual(self.client.get(self.url).data['attendance_rate'], 25.0)
