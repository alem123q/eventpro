from rest_framework.throttling import SimpleRateThrottle


class FixedScopeThrottle(SimpleRateThrottle):
    """Limite de pedidos por minuto con un nombre fijo por clase.

    `ScopedRateThrottle` de DRF toma el nombre del limite de la vista
    (`throttle_scope`) e ignora el de la clase: con vistas de funcion el limite
    nunca se aplicaba. Aca el nombre es el de la clase y se cuenta por usuario
    o, si no hay sesion, por direccion IP.
    """

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            ident = request.user.pk
        else:
            ident = self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}


class RegisterThrottle(FixedScopeThrottle):
    scope = 'register'


class LoginThrottle(FixedScopeThrottle):
    scope = 'login'


class ForgotPasswordThrottle(FixedScopeThrottle):
    scope = 'forgot_password'


class ResendVerificationThrottle(FixedScopeThrottle):
    scope = 'resend_verification'


class PublicInvitationThrottle(FixedScopeThrottle):
    scope = 'public_invitation'
