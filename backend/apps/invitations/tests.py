import hashlib

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from events.models import Event
from users.models import User

from .models import Invitation


class InvitationQrCodeTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='org@test.com', username='org', password='Pass1234',
            first_name='Org', last_name='User',
        )
        self.event = Event.objects.create(
            title='Evento', event_date='2026-12-01', organizer=self.user,
        )

    def _crear(self, n):
        return Invitation.objects.create(
            first_name=f'G{n}', last_name='X', email=f'g{n}@test.com', event=self.event,
        )

    def test_each_invitation_gets_unique_code(self):
        codigos = {self._crear(n).qr_hash for n in range(20)}
        self.assertEqual(len(codigos), 20)
        self.assertTrue(all(len(c) == 32 for c in codigos))

    def test_code_is_not_derived_from_id(self):
        # Antes el codigo era sha256('event-checkin-<id>'): cualquiera podia calcularlo
        inv = self._crear(1)
        predecible = hashlib.sha256(f'event-checkin-{inv.id}'.encode()).hexdigest()[:32]
        self.assertNotEqual(inv.qr_hash, predecible)

    def test_organizer_sees_code_in_api(self):
        inv = self._crear(1)
        client = APIClient()
        client.force_authenticate(self.user)

        response = client.get(reverse('invitation-detail', args=[inv.id]))

        self.assertEqual(response.data['qr_hash'], inv.qr_hash)

    def test_code_cannot_be_changed_through_api(self):
        inv = self._crear(1)
        original = inv.qr_hash
        client = APIClient()
        client.force_authenticate(self.user)

        client.patch(
            reverse('invitation-detail', args=[inv.id]),
            {'qr_hash': 'a' * 32}, format='json',
        )

        inv.refresh_from_db()
        self.assertEqual(inv.qr_hash, original)
