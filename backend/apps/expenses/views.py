from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from config.pagination import DefaultPagination

from .models import Expense
from .permissions import CanManageExpenses
from .serializers import ExpenseSerializer
from .services import ExpenseService


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated & CanManageExpenses])
def expense_list_create(request):
    if request.method == 'GET':
        expenses = ExpenseService.list_expenses(request.user, request.query_params)
        paginator = DefaultPagination()
        page = paginator.paginate_queryset(expenses, request)
        serializer = ExpenseSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    ExpenseService.get_event(request.data.get('event'), request.user)
    serializer = ExpenseSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated & CanManageExpenses])
def expense_detail(request, pk):
    expense = ExpenseService.get_expense(pk, request.user)

    if request.method == 'GET':
        return Response(ExpenseSerializer(expense).data)

    if request.method in ('PUT', 'PATCH'):
        serializer = ExpenseSerializer(
            expense, data=request.data, partial=request.method == 'PATCH',
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    expense.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
@permission_classes([IsAuthenticated & CanManageExpenses])
def expense_summary(request):
    event = ExpenseService.get_event(request.query_params.get('event'), request.user)
    return Response(ExpenseService.summary(event))


@api_view(['GET'])
@permission_classes([IsAuthenticated & CanManageExpenses])
def expense_categories(request):
    return Response([
        {'value': value, 'label': label} for value, label in Expense.Category.choices
    ])
