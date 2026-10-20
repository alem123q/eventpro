from django.urls import path

from . import views

urlpatterns = [
    path('', views.expense_list_create, name='expense-list'),
    path('summary/', views.expense_summary, name='expense-summary'),
    path('export/', views.expense_export, name='expense-export'),
    path('categories/', views.expense_categories, name='expense-categories'),
    path('<int:pk>/', views.expense_detail, name='expense-detail'),
]
