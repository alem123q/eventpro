from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from .models import EmailVerificationToken, PasswordResetToken, User


class AuthAPITestCase(TestCase):
    def setUp(self):
        cache.clear()  # los limites por minuto se cuentan en la cache
        self.client = APIClient()
        self.register_url = reverse('auth:auth-register')
        self.login_url = reverse('auth:auth-login')
        self.logout_url = reverse('auth:auth-logout')
        self.refresh_url = reverse('auth:auth-refresh')
        self.profile_url = reverse('users:user-profile')
        self.change_password_url = reverse('auth:auth-change-password')
        self.forgot_password_url = reverse('auth:auth-forgot-password')
        self.reset_password_url = reverse('auth:auth-reset-password')
        self.verify_email_url = reverse('auth:auth-verify-email')
        self.resend_verification_url = reverse('auth:auth-resend-verification')

        self.user_data = {
            'email': 'test@example.com',
            'username': 'testuser',
            'password': 'TestPass123',
            'password_confirm': 'TestPass123',
            'first_name': 'Test',
            'last_name': 'User',
        }

    def _create_user(self, **kwargs):
        data = {**self.user_data, **kwargs}
        return self.client.post(self.register_url, data, format='json')

    def _login(self, email=None, password=None):
        return self.client.post(self.login_url, {
            'email': email or self.user_data['email'],
            'password': password or self.user_data['password'],
        }, format='json')

    def _get_tokens(self, email=None, password=None):
        response = self._login(email, password)
        return response.data

    def _authenticated_client(self, email=None, password=None):
        tokens = self._get_tokens(email, password)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        return client, tokens

    def test_register_success(self):
        response = self._create_user()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('id', response.data)
        self.assertEqual(response.data['email'], self.user_data['email'])
        self.assertEqual(response.data['username'], self.user_data['username'])
        self.assertFalse(response.data['email_verified'])

    def test_register_duplicate_email(self):
        self._create_user()
        response = self._create_user()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    def test_register_duplicate_username(self):
        self._create_user()
        response = self._create_user(email='other@example.com')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)

    def test_register_password_mismatch(self):
        response = self.client.post(self.register_url, {
            **self.user_data,
            'password_confirm': 'DifferentPass1',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password_confirm', response.data)

    def test_register_weak_password(self):
        response = self.client.post(self.register_url, {
            **self.user_data,
            'password': 'weak',
            'password_confirm': 'weak',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_success(self):
        self._create_user()
        response = self._login()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertIn('user', response.data)
        self.assertEqual(response.data['user']['email'], self.user_data['email'])

    def test_login_invalid_credentials(self):
        self._create_user()
        response = self._login(password='WrongPass123')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_inactive_user(self):
        self._create_user()
        User.objects.update(is_active=False)
        response = self._login()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_logout_success(self):
        self._create_user()
        client, tokens = self._authenticated_client()
        response = client.post(self.logout_url, {'refresh': tokens['refresh']}, format='json')
        self.assertEqual(response.status_code, status.HTTP_205_RESET_CONTENT)

    def test_logout_missing_refresh(self):
        self._create_user()
        client, _ = self._authenticated_client()
        response = client.post(self.logout_url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_logout_unauthenticated(self):
        response = self.client.post(self.logout_url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_success(self):
        self._create_user()
        tokens = self._get_tokens()
        response = self.client.post(self.refresh_url, {'refresh': tokens['refresh']}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)

    def test_refresh_invalid(self):
        response = self.client.post(self.refresh_url, {'refresh': 'invalidtoken'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_missing(self):
        response = self.client.post(self.refresh_url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_get_profile(self):
        self._create_user()
        client, _ = self._authenticated_client()
        response = client.get(self.profile_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], self.user_data['email'])

    def test_get_profile_unauthenticated(self):
        response = self.client.get(self.profile_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_update_profile(self):
        self._create_user()
        client, _ = self._authenticated_client()
        response = client.put(self.profile_url, {
            'first_name': 'Updated',
            'last_name': 'Name',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['first_name'], 'Updated')
        self.assertEqual(response.data['last_name'], 'Name')

    def test_change_password_success(self):
        self._create_user()
        client, _ = self._authenticated_client()
        response = client.post(self.change_password_url, {
            'old_password': 'TestPass123',
            'new_password': 'NewPass456',
            'new_password_confirm': 'NewPass456',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self._login(password='NewPass456')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_change_password_wrong_old(self):
        self._create_user()
        client, _ = self._authenticated_client()
        response = client.post(self.change_password_url, {
            'old_password': 'WrongPass',
            'new_password': 'NewPass456',
            'new_password_confirm': 'NewPass456',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_password_mismatch(self):
        self._create_user()
        client, _ = self._authenticated_client()
        response = client.post(self.change_password_url, {
            'old_password': 'TestPass123',
            'new_password': 'NewPass456',
            'new_password_confirm': 'DifferentPass',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_forgot_password_creates_token_and_sends_email(self):
        self._create_user()
        response = self.client.post(self.forgot_password_url, {
            'email': self.user_data['email'],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('message', response.data)

        token_exists = PasswordResetToken.objects.filter(
            user__email=self.user_data['email'], used=False,
        ).exists()
        self.assertTrue(token_exists)

    def test_forgot_password_nonexistent_email(self):
        response = self.client.post(self.forgot_password_url, {
            'email': 'noexist@example.com',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_reset_password_success(self):
        self._create_user()
        self.client.post(self.forgot_password_url, {
            'email': self.user_data['email'],
        }, format='json')
        token = PasswordResetToken.objects.get(
            user__email=self.user_data['email'], used=False,
        )
        response = self.client.post(self.reset_password_url, {
            'token': token.token,
            'password': 'NewPass789',
            'password_confirm': 'NewPass789',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response = self._login(password='NewPass789')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_reset_password_invalid_token(self):
        response = self.client.post(self.reset_password_url, {
            'token': 'invalidtoken',
            'password': 'NewPass789',
            'password_confirm': 'NewPass789',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reset_password_mismatch(self):
        self._create_user()
        self.client.post(self.forgot_password_url, {
            'email': self.user_data['email'],
        }, format='json')
        token = PasswordResetToken.objects.get(
            user__email=self.user_data['email'], used=False,
        )
        response = self.client.post(self.reset_password_url, {
            'token': token.token,
            'password': 'NewPass789',
            'password_confirm': 'DifferentPass',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reset_password_token_used_once(self):
        self._create_user()
        self.client.post(self.forgot_password_url, {
            'email': self.user_data['email'],
        }, format='json')
        token = PasswordResetToken.objects.get(
            user__email=self.user_data['email'], used=False,
        )
        self.client.post(self.reset_password_url, {
            'token': token.token,
            'password': 'NewPass789',
            'password_confirm': 'NewPass789',
        }, format='json')
        response = self.client.post(self.reset_password_url, {
            'token': token.token,
            'password': 'AnotherPass1',
            'password_confirm': 'AnotherPass1',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_verify_email_success(self):
        self._create_user()
        token = EmailVerificationToken.objects.get(user__email=self.user_data['email'])
        response = self.client.post(self.verify_email_url, {
            'token': token.token,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user = User.objects.get(email=self.user_data['email'])
        self.assertTrue(user.email_verified)

    def test_verify_email_invalid_token(self):
        response = self.client.post(self.verify_email_url, {
            'token': 'invalidtoken',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_resend_verification(self):
        self._create_user()
        EmailVerificationToken.objects.filter(user__email=self.user_data['email']).delete()
        response = self.client.post(self.resend_verification_url, {
            'email': self.user_data['email'],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        new_token = EmailVerificationToken.objects.filter(
            user__email=self.user_data['email'],
        ).first()
        self.assertIsNotNone(new_token)

    def test_resend_verification_nonexistent_email(self):
        response = self.client.post(self.resend_verification_url, {
            'email': 'noexist@example.com',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_authenticated_endpoints_require_auth(self):
        protected_urls = [
            self.logout_url,
            self.change_password_url,
            self.profile_url,
        ]
        for url in protected_urls:
            response = self.client.get(url)
            self.assertIn(
                response.status_code,
                [status.HTTP_401_UNAUTHORIZED, status.HTTP_405_METHOD_NOT_ALLOWED],
            )


class AdminUserManagementTestCase(TestCase):
    def setUp(self):
        cache.clear()  # los limites por minuto se cuentan en la cache
        self.client = APIClient()

        self.admin = User.objects.create_superuser(
            email='admin@example.com',
            username='admin',
            password='AdminPass123',
            first_name='Admin',
            last_name='User',
        )

        self.user = User.objects.create_user(
            email='user@example.com',
            username='regularuser',
            password='UserPass123',
            first_name='Regular',
            last_name='User',
        )

        tokens = self._get_tokens('admin@example.com', 'AdminPass123')
        self.admin_client = APIClient()
        self.admin_client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        tokens = self._get_tokens('user@example.com', 'UserPass123')
        self.user_client = APIClient()
        self.user_client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        self.user_list_url = reverse('users:user-list')

    def _get_tokens(self, email, password):
        response = self.client.post(reverse('auth:auth-login'), {
            'email': email,
            'password': password,
        }, format='json')
        return response.data

    def _user_detail_url(self, user_id):
        return reverse('users:user-detail', args=[user_id])

    def test_admin_list_users(self):
        response = self.admin_client.get(self.user_list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)
        self.assertIn('count', response.data)

    def test_non_admin_cannot_list_users(self):
        response = self.user_client.get(self.user_list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_get_user_detail(self):
        response = self.admin_client.get(self._user_detail_url(self.user.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], 'user@example.com')

    def test_admin_update_user(self):
        response = self.admin_client.put(self._user_detail_url(self.user.id), {
            'role': 'admin',
            'is_active': False,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, 'admin')
        self.assertFalse(self.user.is_active)

    def test_admin_delete_user(self):
        response = self.admin_client.delete(self._user_detail_url(self.user.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(id=self.user.id).exists())

    def test_admin_get_nonexistent_user(self):
        response = self.admin_client.get(self._user_detail_url(99999))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class ProfileValidationTestCase(TestCase):
    def setUp(self):
        cache.clear()  # los limites por minuto se cuentan en la cache
        self.client = APIClient()
        self.register_url = reverse('auth:auth-register')
        self.profile_url = reverse('users:user-profile')

        self.client.post(self.register_url, {
            'email': 'test@example.com',
            'username': 'testuser',
            'password': 'TestPass123',
            'password_confirm': 'TestPass123',
            'first_name': 'Test',
            'last_name': 'User',
        }, format='json')

        response = self.client.post(reverse('auth:auth-login'), {
            'email': 'test@example.com',
            'password': 'TestPass123',
        }, format='json')
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {response.data['access']}",
        )

    def test_update_profile_with_valid_chilean_phone(self):
        response = self.client.put(self.profile_url, {
            'phone': '+56912345678',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_update_profile_with_valid_chilean_phone_no_prefix(self):
        response = self.client.put(self.profile_url, {
            'phone': '56912345678',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_update_profile_with_invalid_phone_returns_400(self):
        response = self.client.put(self.profile_url, {
            'phone': '12345',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_update_profile_with_empty_phone(self):
        response = self.client.put(self.profile_url, {
            'phone': '',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_update_profile_without_phone(self):
        response = self.client.put(self.profile_url, {
            'first_name': 'NewName',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_update_profile_with_foreign_phone_returns_400(self):
        response = self.client.put(self.profile_url, {
            'phone': '+34987654321',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_with_weak_password_returns_400(self):
        response = self.client.post(self.register_url, {
            'email': 'weak@example.com',
            'username': 'weakuser',
            'password': 'onlylowercase',
            'password_confirm': 'onlylowercase',
            'first_name': 'Weak',
            'last_name': 'User',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_password_no_number_returns_400(self):
        response = self.client.post(self.register_url, {
            'email': 'nonumber@example.com',
            'username': 'nonumber',
            'password': 'NoDigitsHere',
            'password_confirm': 'NoDigitsHere',
            'first_name': 'No',
            'last_name': 'Number',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_password_no_uppercase_returns_400(self):
        response = self.client.post(self.register_url, {
            'email': 'nouppercase@example.com',
            'username': 'nouppercase',
            'password': 'lowercase1',
            'password_confirm': 'lowercase1',
            'first_name': 'No',
            'last_name': 'Uppercase',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ThrottleTests(TestCase):
    """Los limites por minuto se aplican de verdad (antes no se aplicaban)."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def test_login_is_rate_limited(self):
        url = reverse('auth:auth-login')
        codes = [
            self.client.post(url, {'email': 'x@x.com', 'password': 'mala'}, format='json').status_code
            for _ in range(11)
        ]
        self.assertNotIn(429, codes[:10])
        self.assertEqual(codes[10], 429)

    def test_register_is_rate_limited(self):
        url = reverse('auth:auth-register')
        codes = [self.client.post(url, {}, format='json').status_code for _ in range(4)]
        self.assertEqual(codes[3], 429)
