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


# ----------------------------------------------------------------------
# Envio de invitaciones por correo y pagina publica del invitado
# ----------------------------------------------------------------------
from django.core import mail  # noqa: E402
from django.core.cache import cache  # noqa: E402

from attendance.models import Attendance  # noqa: E402


class InvitationEmailTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email='org@test.com', username='org', password='Pass1234',
            first_name='Ana', last_name='Organizadora',
        )
        self.other = User.objects.create_user(
            email='otro@test.com', username='otro', password='Pass1234',
        )
        self.event = Event.objects.create(
            title='Fiesta UNRaf', event_date='2026-12-01', organizer=self.user,
            status=Event.Status.ACTIVE, location='Salón Central',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _crear(self, n, **extra):
        return Invitation.objects.create(
            first_name=f'G{n}', last_name='X', email=f'g{n}@test.com', event=self.event, **extra,
        )

    def test_send_one_invitation(self):
        inv = self._crear(1)

        response = self.client.post(reverse('invitation-send', args=[inv.id]))

        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data['invited_at'])
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertEqual(msg.to, ['g1@test.com'])
        self.assertIn('Fiesta UNRaf', msg.subject)
        self.assertIn(f'/invitacion/{inv.qr_hash}', msg.body)
        html = msg.alternatives[0][0]
        self.assertIn('?respuesta=si', html)
        self.assertIn('cid:qr-invitacion', html)
        # El QR va como imagen incrustada en el correo
        images = [a for a in msg.attachments if getattr(a, 'get_content_type', lambda: '')() == 'image/png']
        self.assertEqual(len(images), 1)

    def test_send_pending_only_sends_to_new_guests(self):
        self._crear(1)
        self._crear(2)
        self.client.post(reverse('invitation-send-pending'), {'event': self.event.id}, format='json')
        self._crear(3)

        response = self.client.post(reverse('invitation-send-pending'), {'event': self.event.id}, format='json')

        self.assertEqual(response.data, {'sent': 1, 'failed': 0})
        self.assertEqual(len(mail.outbox), 3)

    def test_send_pending_skips_guests_who_already_attended(self):
        inv = self._crear(1, rsvp_status=Invitation.RSVPStatus.CONFIRMED)
        Attendance.objects.create(invitation=inv, event=self.event, qr_code=inv.qr_hash)

        response = self.client.post(reverse('invitation-send-pending'), {'event': self.event.id}, format='json')

        self.assertEqual(response.data['sent'], 0)

    def test_list_filter_not_invited(self):
        self._crear(1)
        sent = self._crear(2)
        self.client.post(reverse('invitation-send', args=[sent.id]))

        response = self.client.get(reverse('invitation-list'), {'event': self.event.id, 'not_invited': 'true'})

        self.assertEqual([g['email'] for g in response.data['results']], ['g1@test.com'])

    def test_cannot_send_from_draft_event(self):
        self.event.status = Event.Status.DRAFT
        self.event.save()
        inv = self._crear(1)

        response = self.client.post(reverse('invitation-send', args=[inv.id]))

        self.assertEqual(response.status_code, 400)
        self.assertIn('activo', response.data['detail'])
        self.assertEqual(len(mail.outbox), 0)

    def test_other_organizer_cannot_send(self):
        inv = self._crear(1)
        client = APIClient()
        client.force_authenticate(self.other)

        r1 = client.post(reverse('invitation-send', args=[inv.id]))
        r2 = client.post(reverse('invitation-send-pending'), {'event': self.event.id}, format='json')

        self.assertEqual(r1.status_code, 403)
        self.assertEqual(r2.status_code, 403)
        self.assertEqual(len(mail.outbox), 0)


class PublicInvitationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email='org@test.com', username='org', password='Pass1234',
            first_name='Ana', last_name='Organizadora',
        )
        self.event = Event.objects.create(
            title='Fiesta UNRaf', event_date='2026-12-01', organizer=self.user,
            status=Event.Status.ACTIVE,
        )
        self.inv = Invitation.objects.create(
            first_name='Eloy', last_name='Kirov', email='eloy@test.com', event=self.event,
        )
        Invitation.objects.create(
            first_name='Otra', last_name='Persona', email='otra@test.com', event=self.event,
        )
        self.client = APIClient()  # sin sesion

    def url(self, code=None):
        return reverse('public:public-invitation', args=[code or self.inv.qr_hash])

    def rsvp_url(self, code=None):
        return reverse('public:public-invitation-rsvp', args=[code or self.inv.qr_hash])

    def test_guest_sees_invitation_without_login(self):
        response = self.client.get(self.url())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['first_name'], 'Eloy')
        self.assertEqual(response.data['event']['title'], 'Fiesta UNRaf')
        self.assertEqual(response.data['event']['organizer_name'], 'Ana Organizadora')
        self.assertTrue(response.data['can_respond'])

    def test_page_does_not_expose_other_data(self):
        response = self.client.get(self.url())

        self.assertNotIn('email', response.data)
        self.assertNotIn('Otra', str(response.data))
        self.assertNotIn('org@test.com', str(response.data))

    def test_qr_only_shown_after_confirming(self):
        self.assertIsNone(self.client.get(self.url()).data['qr_code'])

        response = self.client.post(self.rsvp_url(), {'rsvp_status': 'confirmed'}, format='json')

        self.assertEqual(response.data['qr_code'], self.inv.qr_hash)
        self.inv.refresh_from_db()
        self.assertEqual(self.inv.rsvp_status, 'confirmed')
        self.assertIsNotNone(self.inv.responded_at)

    def test_guest_can_change_mind(self):
        self.client.post(self.rsvp_url(), {'rsvp_status': 'confirmed'}, format='json')
        response = self.client.post(self.rsvp_url(), {'rsvp_status': 'rejected'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['rsvp_status'], 'rejected')
        self.assertIsNone(response.data['qr_code'])

    def test_guest_cannot_set_pending_or_other_values(self):
        for value in ('pending', 'attended', '', None):
            response = self.client.post(self.rsvp_url(), {'rsvp_status': value}, format='json')
            self.assertEqual(response.status_code, 400)

    def test_unknown_code_returns_404(self):
        self.assertEqual(self.client.get(self.url('0' * 32)).status_code, 404)
        self.assertEqual(
            self.client.post(self.rsvp_url('0' * 32), {'rsvp_status': 'confirmed'}, format='json').status_code,
            404,
        )

    def test_draft_event_is_hidden(self):
        self.event.status = Event.Status.DRAFT
        self.event.save()

        self.assertEqual(self.client.get(self.url()).status_code, 404)

    def test_cannot_respond_after_event_finished(self):
        self.event.status = Event.Status.FINISHED
        self.event.save()

        page = self.client.get(self.url())
        response = self.client.post(self.rsvp_url(), {'rsvp_status': 'confirmed'}, format='json')

        self.assertFalse(page.data['can_respond'])
        self.assertEqual(page.data['closed_reason'], 'El evento ya finalizó.')
        self.assertEqual(response.status_code, 400)

    def test_cannot_respond_after_checking_in(self):
        self.inv.rsvp_status = Invitation.RSVPStatus.CONFIRMED
        self.inv.save()
        Attendance.objects.create(invitation=self.inv, event=self.event, qr_code=self.inv.qr_hash)

        response = self.client.post(self.rsvp_url(), {'rsvp_status': 'rejected'}, format='json')

        self.assertEqual(response.status_code, 400)
        self.inv.refresh_from_db()
        self.assertEqual(self.inv.rsvp_status, 'confirmed')

    def test_confirmed_guest_can_check_in(self):
        self.client.post(self.rsvp_url(), {'rsvp_status': 'confirmed'}, format='json')
        organizer = APIClient()
        organizer.force_authenticate(self.user)

        response = organizer.post(
            reverse('attendance-checkin'),
            {'qr_code': self.inv.qr_hash, 'event': self.event.id}, format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['already_checked_in'])

    def test_organizer_change_clears_guest_response_mark(self):
        self.client.post(self.rsvp_url(), {'rsvp_status': 'confirmed'}, format='json')
        organizer = APIClient()
        organizer.force_authenticate(self.user)

        organizer.patch(reverse('invitation-rsvp', args=[self.inv.id]), {'rsvp_status': 'pending'}, format='json')

        self.inv.refresh_from_db()
        self.assertIsNone(self.inv.responded_at)

    def test_public_endpoints_are_rate_limited(self):
        codes = [self.client.get(self.url()).status_code for _ in range(31)]

        self.assertEqual(codes[-1], 429)
