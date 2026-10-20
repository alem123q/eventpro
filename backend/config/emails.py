from django.conf import settings


def show_dev_link(title, email, url):
    """En desarrollo los mails se imprimen en la consola codificados
    (quoted-printable: el enlace aparece cortado y con '=3D'). Se muestra
    ademas el enlace limpio para poder copiarlo."""
    if 'console' in settings.EMAIL_BACKEND:
        print(f'\n>>> {title} para {email}:\n>>> {url}\n', flush=True)
