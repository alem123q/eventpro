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
