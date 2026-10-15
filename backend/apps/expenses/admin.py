from django.contrib import admin

from .models import Expense


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ['concept', 'event', 'category', 'amount', 'paid_by', 'expense_date']
    list_filter = ['category', 'event']
    search_fields = ['concept', 'paid_by', 'event__title']
    ordering = ['-expense_date']
    readonly_fields = ['created_at', 'updated_at']
