from django.test.runner import DiscoverRunner

# Las apps viven en backend/apps/ y se importan como `users`, `events`, etc.
# El descubrimiento por defecto las importaria como `apps.users`, lo que rompe
# los modelos. Sin argumentos, se testean estas apps por su nombre real.
LOCAL_APPS = ['users', 'events', 'invitations', 'attendance', 'dashboard']


class LocalAppsTestRunner(DiscoverRunner):
    def build_suite(self, test_labels=None, **kwargs):
        return super().build_suite(test_labels or LOCAL_APPS, **kwargs)
