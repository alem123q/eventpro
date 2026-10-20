"""Envio de la invitacion por correo, con el codigo QR y el enlace para
que el invitado confirme o rechace su asistencia."""
import io
import logging
from email.message import MIMEPart

import qrcode
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone

from config.emails import show_dev_link

logger = logging.getLogger(__name__)

QR_CONTENT_ID = 'qr-invitacion'


def invitation_url(invitation):
    base = settings.FRONTEND_URL or 'https://localhost:5173'
    return f'{base}/invitacion/{invitation.qr_hash}'


def qr_png(code):
    """Imagen PNG del codigo QR, igual a la que muestra la aplicacion."""
    img = qrcode.make(code, box_size=8, border=3)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def send_invitation_email(invitation):
    """Envia la invitacion y registra la fecha de envio.

    Devuelve True si el correo se envio. Un error de envio no corta el envio
    de las demas invitaciones: se registra y se informa como no enviado.
    """
    event = invitation.event
    url = invitation_url(invitation)
    context = {
        'invitation': invitation,
        'event': event,
        'organizer_name': event.organizer.get_full_name() or event.organizer.email,
        'url': url,
        'confirm_url': f'{url}?respuesta=si',
        'reject_url': f'{url}?respuesta=no',
        'qr_cid': QR_CONTENT_ID,
    }
    subject = f'Invitación: {event.title}'
    text = render_to_string('invitations/invitation_email.txt', context)
    html = render_to_string('invitations/invitation_email.html', context)

    message = EmailMultiAlternatives(
        subject=subject,
        body=text,
        from_email=settings.DEFAULT_FROM_EMAIL or 'noreply@example.com',
        to=[invitation.email],
    )
    message.attach_alternative(html, 'text/html')
    # La imagen va "incrustada" en el correo (Content-ID) para que se vea en
    # el cuerpo del mensaje y no solo como archivo adjunto
    image = MIMEPart()
    image.set_content(
        qr_png(invitation.qr_hash), maintype='image', subtype='png',
        disposition='inline', filename='codigo-qr.png', cid=f'<{QR_CONTENT_ID}>',
    )
    message.attach(image)

    show_dev_link('Invitación', invitation.email, url)
    try:
        message.send(fail_silently=False)
    except Exception as e:  # noqa: BLE001 - cualquier falla del servidor de correo
        logger.warning('Error al enviar la invitación a %s: %s', invitation.email, e)
        return False

    invitation.invited_at = timezone.now()
    invitation.save(update_fields=['invited_at', 'updated_at'])
    return True
