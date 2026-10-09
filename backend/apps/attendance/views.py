from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from config.pagination import DefaultPagination

from .models import Attendance
from .permissions import CanCheckin, CanManageAttendance, IsEventOrganizer
from .serializers import (
    AttendanceCheckinSerializer,
    AttendanceDetailSerializer,
    AttendanceListSerializer,
)
from .services import AttendanceService


@api_view(['GET'])
@permission_classes([IsAuthenticated & CanManageAttendance])
def attendance_list(request):
    attendances = AttendanceService.list_attendances(
        request.user, request.query_params,
    )
    paginator = DefaultPagination()
    page = paginator.paginate_queryset(attendances, request)
    serializer = AttendanceListSerializer(page, many=True)
    return paginator.get_paginated_response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated & CanCheckin])
def attendance_checkin(request):
    serializer = AttendanceCheckinSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    qr_code = serializer.validated_data['qr_code']
    invitation = AttendanceService.resolve_invitation_from_qr(qr_code)

    if not CanCheckin().has_object_permission(request, None, invitation.event):
        raise PermissionDenied(
            'No tienes permiso para registrar asistencia en este evento.',
        )

    expected_event = serializer.validated_data.get('event')
    if expected_event is not None and invitation.event_id != expected_event:
        raise ValidationError({
            'detail': (
                f'Este código es de {invitation.full_name}, invitado a otro evento '
                f'("{invitation.event.title}"). No se registró el ingreso.'
            ),
        })

    already_checked_in = Attendance.objects.filter(invitation=invitation).exists()
    attendance = AttendanceService.checkin(invitation)
    data = dict(AttendanceDetailSerializer(attendance).data)
    data['already_checked_in'] = already_checked_in
    return Response(data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def attendance_detail(request, pk):
    attendance = AttendanceService.get_attendance(pk, request.user)

    if not IsEventOrganizer().has_object_permission(request, None, attendance):
        raise PermissionDenied(
            'No tienes permiso para ver esta asistencia.',
        )

    serializer = AttendanceDetailSerializer(attendance)
    return Response(serializer.data)
