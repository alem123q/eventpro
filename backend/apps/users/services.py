import logging
import secrets

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from config.emails import show_dev_link as _show_dev_link

logger = logging.getLogger(__name__)

from .models import EmailVerificationToken, PasswordResetToken, User
from .serializers import (
    AdminUserUpdateSerializer,
    ChangePasswordSerializer,
    EmailVerificationSerializer,
    ForgotPasswordSerializer,
    LoginSerializer,
    ProfileSerializer,
    RegisterSerializer,
    ResetPasswordSerializer,
    UserListSerializer,
    UserSerializer,
)


class AuthService:
    @staticmethod
    def register(data):
        serializer = RegisterSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        AuthService._send_verification_email(user)
        return UserSerializer(user).data

    @staticmethod
    def login(data):
        serializer = LoginSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']

        refresh = RefreshToken.for_user(user)

        return {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data,
        }

    @staticmethod
    def logout(refresh_token_value):
        try:
            token = RefreshToken(refresh_token_value)
            token.blacklist()
            return True
        except TokenError:
            return False

    @staticmethod
    def refresh(refresh_token_value):
        try:
            token = RefreshToken(refresh_token_value)
            return {'access': str(token.access_token)}
        except TokenError:
            return None

    @staticmethod
    def change_password(user, data):
        serializer = ChangePasswordSerializer(
            data=data,
            context={'user': user},
        )
        serializer.is_valid(raise_exception=True)
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        return True

    @staticmethod
    def forgot_password(data):
        serializer = ForgotPasswordSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        try:
            user = User.objects.get(email=email, is_active=True)
        except User.DoesNotExist:
            return {'message': 'Si el email existe, recibirás instrucciones para restablecer tu contraseña.'}

        PasswordResetToken.objects.filter(user=user, used=False).delete()

        token = secrets.token_urlsafe(48)
        PasswordResetToken.objects.create(user=user, token=token)

        reset_url = f"{settings.FRONTEND_URL or 'http://localhost:5173'}/reset-password?token={token}"
        _show_dev_link('Enlace para restablecer la contraseña', user.email, reset_url)

        try:
            send_mail(
                subject='Restablece tu contraseña',
                message=f'Haz clic en el siguiente enlace para restablecer tu contraseña: {reset_url}',
                html_message=render_to_string('users/password_reset_email.html', {
                    'user': user,
                    'reset_url': reset_url,
                }),
                from_email=settings.DEFAULT_FROM_EMAIL or 'noreply@example.com',
                recipient_list=[user.email],
                fail_silently=False,
            )
        except Exception as e:
            logger.warning('Error al enviar email de restablecimiento de contraseña a %s: %s', email, e)

        return {'message': 'Si el email existe, recibirás instrucciones para restablecer tu contraseña.'}

    @staticmethod
    def get_profile(user):
        return UserSerializer(user).data

    @staticmethod
    def update_profile(user, data):
        serializer = ProfileSerializer(user, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return UserSerializer(user).data

    @staticmethod
    def reset_password(data):
        serializer = ResetPasswordSerializer(data=data)
        serializer.is_valid(raise_exception=True)

        token = serializer.validated_data['token']

        try:
            reset_token = PasswordResetToken.objects.get(token=token, used=False)
        except PasswordResetToken.DoesNotExist:
            raise ValueError('El token es inválido o ya fue utilizado.')

        user = reset_token.user
        user.set_password(serializer.validated_data['password'])
        user.save()

        reset_token.used = True
        reset_token.save()

        PasswordResetToken.objects.filter(user=user, used=False).delete()

        return {'message': 'Contraseña restablecida exitosamente.'}

    @staticmethod
    def verify_email(data):
        serializer = EmailVerificationSerializer(data=data)
        serializer.is_valid(raise_exception=True)

        token = serializer.validated_data['token']

        try:
            verification = EmailVerificationToken.objects.get(token=token)
        except EmailVerificationToken.DoesNotExist:
            raise ValueError('El token de verificación es inválido.')

        user = verification.user
        user.email_verified = True
        user.save()
        verification.delete()

        return {'message': 'Email verificado exitosamente.'}

    @staticmethod
    def resend_verification(data):
        from .serializers import ResendVerificationSerializer
        serializer = ResendVerificationSerializer(data=data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']

        try:
            user = User.objects.get(email=email, is_active=True)
        except User.DoesNotExist:
            return {'message': 'Si el email existe, recibirás un nuevo enlace de verificación.'}

        if user.email_verified:
            return {'message': 'El email ya está verificado.'}

        AuthService._send_verification_email(user)

        return {'message': 'Si el email existe, recibirás un nuevo enlace de verificación.'}

    @staticmethod
    def _send_verification_email(user):
        EmailVerificationToken.objects.filter(user=user).delete()

        token = secrets.token_urlsafe(48)
        EmailVerificationToken.objects.create(user=user, token=token)

        verify_url = f"{settings.FRONTEND_URL or 'http://localhost:5173'}/verify-email?token={token}"
        _show_dev_link('Enlace de verificación de email', user.email, verify_url)

        try:
            send_mail(
                subject='Verifica tu correo electrónico',
                message=f'Haz clic en el siguiente enlace para verificar tu email: {verify_url}',
                html_message=render_to_string('users/email_verification.html', {
                    'user': user,
                    'verify_url': verify_url,
                }),
                from_email=settings.DEFAULT_FROM_EMAIL or 'noreply@example.com',
                recipient_list=[user.email],
                fail_silently=False,
            )
        except Exception as e:
            logger.warning('Error al enviar email de verificación a %s: %s', user.email, e)

    @staticmethod
    def list_users(request):
        users = User.objects.all().order_by('-created_at')
        page = request.query_params.get('page', 1)
        page_size = request.query_params.get('page_size', 20)

        from django.core.paginator import Paginator
        paginator = Paginator(users, page_size)
        page_obj = paginator.get_page(page)

        serializer = UserListSerializer(page_obj, many=True)
        return {
            'count': paginator.count,
            'num_pages': paginator.num_pages,
            'current_page': page_obj.number,
            'results': serializer.data,
        }

    @staticmethod
    def get_user_detail(user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            raise ValueError('Usuario no encontrado.')
        return UserListSerializer(user).data

    @staticmethod
    def update_user(user_id, data):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            raise ValueError('Usuario no encontrado.')

        serializer = AdminUserUpdateSerializer(user, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return UserListSerializer(user).data

    @staticmethod
    def delete_user(user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            raise ValueError('Usuario no encontrado.')
        user.delete()
        return True
