from django.urls import path

from . import views

# Rutas sin autenticacion: las usa el invitado desde el enlace del correo
urlpatterns = [
    path('<str:code>/', views.public_invitation, name='public-invitation'),
    path('<str:code>/rsvp/', views.public_invitation_respond, name='public-invitation-rsvp'),
]
