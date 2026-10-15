from rest_framework import serializers

from .models import Expense


class ExpenseSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source='get_category_display', read_only=True)
    event_title = serializers.CharField(source='event.title', read_only=True)

    class Meta:
        model = Expense
        fields = [
            'id', 'event', 'event_title', 'concept', 'category', 'category_label',
            'amount', 'paid_by', 'expense_date', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate_concept(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El concepto no puede estar vacío.')
        return value

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('El monto debe ser mayor a cero.')
        return value

    def update(self, instance, validated_data):
        # Un gasto no se puede mover a otro evento
        validated_data.pop('event', None)
        return super().update(instance, validated_data)
