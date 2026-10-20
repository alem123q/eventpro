from django.urls import path

from . import views

urlpatterns = [
    path('', views.event_list_create, name='event-list'),
    path('<int:pk>/', views.event_detail, name='event-detail'),
    path('<int:pk>/status/', views.event_change_status, name='event-change-status'),
    path('<int:pk>/collaborators/', views.event_collaborators, name='event-collaborators'),
    path(
        '<int:pk>/collaborators/<int:user_id>/',
        views.event_collaborator_remove, name='event-collaborator-remove',
    ),
]
