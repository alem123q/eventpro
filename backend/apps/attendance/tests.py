import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from django.test import TestCase, TransactionTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from events.models import Event
from invitations.models import Invitation
from users.models import User

from .models import Attendance
from .permissions import CanCheckin, CanManageAttendance
from .services import AttendanceService


def _qr(invitation_id):
    return Invitation.objects.get(id=invitation_id).qr_hash


class ResolveInvitationFromQrTests(TestCase):
    def setUp(self):
        self.organizer = User.objects.create_user(
            email='org@test.com',
            username='organizer',
            password='Pass1234',
            first_name='Org',
            last_name='User',
        )
        self.event = Event.objects.create(
            title='Test Event',
            event_date='2026-12-01',
            organizer=self.organizer,
            status=Event.Status.ACTIVE,
        )
        self.invitation = Invitation.objects.create(
            first_name='Juan',
            last_name='Pérez',
            email='juan@test.com',
            event=self.event,
            rsvp_status=Invitation.RSVPStatus.CONFIRMED,
        )

    def test_valid_qr_resolves_invitation(self):
        qr = _qr(self.invitation.id)
        result = AttendanceService.resolve_invitation_from_qr(qr)
        self.assertEqual(result.id, self.invitation.id)

    def test_invalid_qr_raises_error(self):
        with self.assertRaises(ValidationError):
            AttendanceService.resolve_invitation_from_qr('hashinvalido123')

    def test_numeric_invitation_id_not_accepted(self):
        qr = str(self.invitation.id)
        with self.assertRaises(ValidationError):
            AttendanceService.resolve_invitation_from_qr(qr)

    def test_numeric_non_existent_id_not_accepted(self):
        with self.assertRaises(ValidationError):
            AttendanceService.resolve_invitation_from_qr('99999')

    def test_empty_qr_raises_error(self):
        with self.assertRaises(ValidationError):
            AttendanceService.resolve_invitation_from_qr('')

    def test_random_string_not_accepted(self):
        with self.assertRaises(ValidationError):
            AttendanceService.resolve_invitation_from_qr(
                'abcdef1234567890abcdef1234567890',
            )

    def test_qr_from_other_invitation_resolves_own_invitation(self):
        other_event = Event.objects.create(
            title='Other Event',
            event_date='2026-12-15',
            organizer=self.organizer,
            status=Event.Status.ACTIVE,
        )
        other_inv = Invitation.objects.create(
            first_name='Ana',
            last_name='García',
            email='ana@test.com',
            event=other_event,
            rsvp_status=Invitation.RSVPStatus.CONFIRMED,
        )
        qr = _qr(other_inv.id)
        result = AttendanceService.resolve_invitation_from_qr(qr)
        self.assertEqual(result.id, other_inv.id)


class CheckinTests(TestCase):
    def setUp(self):
        self.organizer = User.objects.create_user(
            email='org@test.com',
            username='organizer',
            password='Pass1234',
            first_name='Org',
            last_name='User',
        )
        self.event = Event.objects.create(
            title='Test Event',
            event_date='2026-12-01',
            organizer=self.organizer,
            status=Event.Status.ACTIVE,
        )
        self.invitation = Invitation.objects.create(
            first_name='Juan',
            last_name='Pérez',
            email='juan@test.com',
            event=self.event,
            rsvp_status=Invitation.RSVPStatus.CONFIRMED,
        )

    def test_checkin_creates_attendance(self):
        attendance = AttendanceService.checkin(self.invitation)
        self.assertEqual(attendance.invitation, self.invitation)
        self.assertEqual(attendance.event, self.event)

    def test_duplicate_checkin_returns_existing(self):
        first = AttendanceService.checkin(self.invitation)
        second = AttendanceService.checkin(self.invitation)
        self.assertEqual(first.id, second.id)

    def test_checkin_without_confirmed_rsvp_raises_error(self):
        pending_inv = Invitation.objects.create(
            first_name='Pedro',
            last_name='López',
            email='pedro@test.com',
            event=self.event,
            rsvp_status=Invitation.RSVPStatus.PENDING,
        )
        with self.assertRaises(ValidationError) as ctx:
            AttendanceService.checkin(pending_inv)
        self.assertIn('RSVP', str(ctx.exception))

    def test_checkin_without_active_event_raises_error(self):
        self.event.status = Event.Status.DRAFT
        self.event.save()
        with self.assertRaises(ValidationError) as ctx:
            AttendanceService.checkin(self.invitation)
        self.assertIn('activo', str(ctx.exception))

    def test_no_record_left_after_validation_error(self):
        self.event.status = Event.Status.DRAFT
        self.event.save()
        count_before = Attendance.objects.count()
        with self.assertRaises(ValidationError):
            AttendanceService.checkin(self.invitation)
        self.assertEqual(Attendance.objects.count(), count_before)


class CheckinPermissionTests(TestCase):
    def setUp(self):
        self.organizer_a = User.objects.create_user(
            email='org_a@test.com',
            username='organizer_a',
            password='Pass1234',
            first_name='OrgA',
            last_name='Test',
            role='organizer',
        )
        self.organizer_b = User.objects.create_user(
            email='org_b@test.com',
            username='organizer_b',
            password='Pass1234',
            first_name='OrgB',
            last_name='Test',
            role='organizer',
        )
        self.admin = User.objects.create_user(
            email='admin@test.com',
            username='admin',
            password='Pass1234',
            first_name='Admin',
            last_name='Test',
            role='admin',
            is_staff=True,
        )
        self.collaborator = User.objects.create_user(
            email='collab@test.com',
            username='collaborator',
            password='Pass1234',
            first_name='Collab',
            last_name='Test',
            role='collaborator',
        )

        self.event_a = Event.objects.create(
            title='Event A',
            event_date='2026-12-01',
            organizer=self.organizer_a,
            status=Event.Status.ACTIVE,
        )
        self.event_b = Event.objects.create(
            title='Event B',
            event_date='2026-12-15',
            organizer=self.organizer_b,
            status=Event.Status.ACTIVE,
        )

        self.invitation_a = Invitation.objects.create(
            first_name='Juan',
            last_name='Pérez',
            email='juan@test.com',
            event=self.event_a,
            rsvp_status=Invitation.RSVPStatus.CONFIRMED,
        )

        self.qr_a = _qr(self.invitation_a.id)
        self.checkin_url = reverse('attendance-checkin')

        self.client_org_a = APIClient()
        self.client_org_a.force_authenticate(user=self.organizer_a)

        self.client_org_b = APIClient()
        self.client_org_b.force_authenticate(user=self.organizer_b)

        self.client_admin = APIClient()
        self.client_admin.force_authenticate(user=self.admin)

        self.client_collab = APIClient()
        self.client_collab.force_authenticate(user=self.collaborator)

    def test_organizer_can_checkin_own_event(self):
        response = self.client_org_a.post(
            self.checkin_url, {'qr_code': self.qr_a}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            Attendance.objects.filter(invitation=self.invitation_a).exists(),
        )

    def test_organizer_cannot_checkin_other_event(self):
        response = self.client_org_b.post(
            self.checkin_url, {'qr_code': self.qr_a}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_no_attendance_created_on_forbidden_checkin(self):
        count_before = Attendance.objects.count()
        response = self.client_org_b.post(
            self.checkin_url, {'qr_code': self.qr_a}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Attendance.objects.count(), count_before)

    def test_admin_can_checkin_any_event(self):
        response = self.client_admin.post(
            self.checkin_url, {'qr_code': self.qr_a}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            Attendance.objects.filter(invitation=self.invitation_a).exists(),
        )

    def test_collaborator_cannot_checkin(self):
        response = self.client_collab.post(
            self.checkin_url, {'qr_code': self.qr_a}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_checkin(self):
        client = APIClient()
        response = client.post(
            self.checkin_url, {'qr_code': self.qr_a}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class CanManageAttendancePermissionTests(TestCase):
    def setUp(self):
        self.organizer = User.objects.create_user(
            email='org@test.com', username='organizer',
            password='Pass1234', role='organizer',
        )
        self.admin = User.objects.create_user(
            email='admin@test.com', username='admin',
            password='Pass1234', role='admin', is_staff=True,
        )
        self.collaborator = User.objects.create_user(
            email='collab@test.com', username='collab',
            password='Pass1234', role='collaborator',
        )
        self.event = Event.objects.create(
            title='My Event', event_date='2026-12-01',
            organizer=self.organizer, status=Event.Status.ACTIVE,
        )
        self.other_event = Event.objects.create(
            title='Other Event', event_date='2026-12-15',
            organizer=self.admin, status=Event.Status.ACTIVE,
        )
        self.permission = CanManageAttendance()

    class _MockRequest:
        def __init__(self, user, query_params=None):
            self.user = user
            self.query_params = query_params or {}

    class _MockView:
        pass

    def test_admin_always_has_permission(self):
        req = self._MockRequest(self.admin)
        self.assertTrue(self.permission.has_permission(req, self._MockView()))

    def test_admin_with_other_event_param_has_permission(self):
        req = self._MockRequest(self.admin, {'event': str(self.other_event.id)})
        self.assertTrue(self.permission.has_permission(req, self._MockView()))

    def test_organizer_without_event_param_has_permission(self):
        req = self._MockRequest(self.organizer)
        self.assertTrue(self.permission.has_permission(req, self._MockView()))

    def test_organizer_with_own_event_param_has_permission(self):
        req = self._MockRequest(self.organizer, {'event': str(self.event.id)})
        self.assertTrue(self.permission.has_permission(req, self._MockView()))

    def test_organizer_with_other_event_param_denied(self):
        req = self._MockRequest(self.organizer, {'event': str(self.other_event.id)})
        self.assertFalse(self.permission.has_permission(req, self._MockView()))

    def test_organizer_with_nonexistent_event_param_denied(self):
        req = self._MockRequest(self.organizer, {'event': '99999'})
        self.assertFalse(self.permission.has_permission(req, self._MockView()))

    def test_collaborator_denied(self):
        req = self._MockRequest(self.collaborator)
        self.assertFalse(self.permission.has_permission(req, self._MockView()))

    def test_collaborator_with_event_param_denied(self):
        req = self._MockRequest(self.collaborator, {'event': str(self.event.id)})
        self.assertFalse(self.permission.has_permission(req, self._MockView()))

    def test_unauthenticated_denied(self):
        anon = type('AnonUser', (), {'is_authenticated': False, 'role': ''})()
        req = self._MockRequest(anon)
        self.assertFalse(self.permission.has_permission(req, self._MockView()))


class CanCheckinPermissionTests(TestCase):
    def setUp(self):
        self.organizer = User.objects.create_user(
            email='org@test.com', username='organizer',
            password='Pass1234', role='organizer',
        )
        self.admin = User.objects.create_user(
            email='admin@test.com', username='admin',
            password='Pass1234', role='admin', is_staff=True,
        )
        self.collaborator = User.objects.create_user(
            email='collab@test.com', username='collab',
            password='Pass1234', role='collaborator',
        )
        self.event = Event.objects.create(
            title='My Event', event_date='2026-12-01',
            organizer=self.organizer, status=Event.Status.ACTIVE,
        )
        self.other_event = Event.objects.create(
            title='Other Event', event_date='2026-12-15',
            organizer=self.admin, status=Event.Status.ACTIVE,
        )
        self.permission = CanCheckin()

    class _MockRequest:
        def __init__(self, user):
            self.user = user

    class _MockView:
        pass

    def test_organizer_has_view_permission(self):
        req = self._MockRequest(self.organizer)
        self.assertTrue(self.permission.has_permission(req, self._MockView()))

    def test_admin_has_view_permission(self):
        req = self._MockRequest(self.admin)
        self.assertTrue(self.permission.has_permission(req, self._MockView()))

    def test_collaborator_lacks_view_permission(self):
        req = self._MockRequest(self.collaborator)
        self.assertFalse(self.permission.has_permission(req, self._MockView()))

    def test_unauthenticated_lacks_view_permission(self):
        anon = type('AnonUser', (), {'is_authenticated': False, 'role': ''})()
        req = self._MockRequest(anon)
        self.assertFalse(self.permission.has_permission(req, self._MockView()))

    def test_organizer_has_object_permission_on_own_event(self):
        req = self._MockRequest(self.organizer)
        self.assertTrue(
            self.permission.has_object_permission(req, self._MockView(), self.event),
        )

    def test_organizer_lacks_object_permission_on_other_event(self):
        req = self._MockRequest(self.organizer)
        self.assertFalse(
            self.permission.has_object_permission(req, self._MockView(), self.other_event),
        )

    def test_admin_has_object_permission_on_any_event(self):
        req = self._MockRequest(self.admin)
        self.assertTrue(
            self.permission.has_object_permission(req, self._MockView(), self.other_event),
        )

    def test_collaborator_lacks_object_permission(self):
        req = self._MockRequest(self.collaborator)
        self.assertFalse(
            self.permission.has_object_permission(req, self._MockView(), self.event),
        )


class CheckinConcurrentTests(TransactionTestCase):
    def setUp(self):
        self.organizer = User.objects.create_user(
            email='org@test.com',
            username='organizer',
            password='Pass1234',
            first_name='Org',
            last_name='User',
        )
        self.event = Event.objects.create(
            title='Test Event',
            event_date='2026-12-01',
            organizer=self.organizer,
            status=Event.Status.ACTIVE,
        )
        self.invitation = Invitation.objects.create(
            first_name='Juan',
            last_name='Pérez',
            email='juan@test.com',
            event=self.event,
            rsvp_status=Invitation.RSVPStatus.CONFIRMED,
        )

    def _checked_in_attendance_count(self):
        return Attendance.objects.filter(invitation=self.invitation).count()

    def test_concurrent_checkin_creates_single_attendance(self):
        results = []

        def _checkin():
            for attempt in range(3):
                try:
                    return AttendanceService.checkin(self.invitation)
                except Exception:
                    if attempt == 2:
                        raise
                    time.sleep(0.2)

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(_checkin) for _ in range(10)]
            for f in as_completed(futures):
                try:
                    results.append(f.result())
                except Exception as e:
                    results.append(e)

        exceptions = [r for r in results if isinstance(r, Exception)]
        attendances = [r for r in results if isinstance(r, Attendance)]

        self.assertEqual(
            exceptions, [],
            f'Concurrent checkins raised {len(exceptions)} exceptions: {exceptions}',
        )
        self.assertEqual(len(set(a.id for a in attendances)), 1)
        self.assertEqual(self._checked_in_attendance_count(), 1)

    def test_concurrent_checkin_after_rsvp_change(self):
        self.invitation.rsvp_status = Invitation.RSVPStatus.REJECTED
        self.invitation.save()
        with self.assertRaises(ValidationError) as ctx:
            AttendanceService.checkin(self.invitation)
        self.assertIn('RSVP', str(ctx.exception))

    def test_concurrent_checkin_after_event_deactivated(self):
        self.event.status = Event.Status.DRAFT
        self.event.save()
        with self.assertRaises(ValidationError) as ctx:
            AttendanceService.checkin(self.invitation)
        self.assertIn('activo', str(ctx.exception))
