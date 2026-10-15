from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from users import urls as users_urls

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include((users_urls.auth_urlpatterns, 'auth'))),
    path('api/users/', include((users_urls.user_urlpatterns, 'users'))),
    path('api/events/', include('events.urls')),
    path('api/invitations/', include('invitations.urls')),
    path('api/dashboard/', include('dashboard.urls')),
    path('api/attendance/', include('attendance.urls')),
    path('api/expenses/', include('expenses.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
