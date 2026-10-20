from django.urls import path

from . import views

urlpatterns = [
    path('', views.invitation_list_create, name='invitation-list'),
    path('send/', views.invitation_send_pending, name='invitation-send-pending'),
    path('<int:pk>/send/', views.invitation_send, name='invitation-send'),
    path('<int:pk>/', views.invitation_detail, name='invitation-detail'),
    path('<int:pk>/rsvp/', views.invitation_rsvp, name='invitation-rsvp'),
]
