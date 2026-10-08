from django.db.models import Count, Q
from django.db.models.functions import TruncMonth

from attendance.models import Attendance
from events.models import Event
from invitations.models import Invitation


class DashboardService:
    @staticmethod
    def get_user_stats(user):
        if user.role == 'admin':
            events_qs = Event.objects.all()
        else:
            events_qs = Event.objects.filter(organizer=user)

        total_events = events_qs.count()
        active_events = events_qs.filter(status=Event.Status.ACTIVE).count()
        finished_events = events_qs.filter(status=Event.Status.FINISHED).count()
        draft_events = events_qs.filter(status=Event.Status.DRAFT).count()

        upcoming_events = (
            events_qs.filter(status=Event.Status.ACTIVE)
            .select_related('organizer')
            .annotate(
                guest_count=Count('invitations', distinct=True),
                confirmed_count=Count(
                    'invitations',
                    filter=Q(invitations__rsvp_status=Invitation.RSVPStatus.CONFIRMED),
                    distinct=True,
                ),
            )
            .order_by('event_date')[:5]
        )

        event_ids = events_qs.values_list('id', flat=True)

        invitations_qs = Invitation.objects.filter(event_id__in=event_ids)
        total_guests = invitations_qs.count()
        confirmed_guests = invitations_qs.filter(
            rsvp_status=Invitation.RSVPStatus.CONFIRMED,
        ).count()
        pending_guests = invitations_qs.filter(
            rsvp_status=Invitation.RSVPStatus.PENDING,
        ).count()
        rejected_guests = invitations_qs.filter(
            rsvp_status=Invitation.RSVPStatus.REJECTED,
        ).count()

        attendances_qs = Attendance.objects.filter(event_id__in=event_ids)
        total_attendances = attendances_qs.count()

        attendance_rate = 0
        if confirmed_guests > 0:
            attendance_rate = round(
                (total_attendances / confirmed_guests) * 100, 1,
            )

        events_by_category = dict(
            events_qs.values('category')
            .annotate(count=Count('id'))
            .values_list('category', 'count'),
        )

        # Las claves se pasan a texto ('2026-12'): JSON no admite fechas como clave
        events_by_month = {
            month.strftime('%Y-%m'): count
            for month, count in events_qs.annotate(
                month=TruncMonth('event_date'),
            )
            .values('month')
            .annotate(count=Count('id'))
            .order_by('month')
            .values_list('month', 'count')
        }

        upcoming = []
        for e in upcoming_events:
            upcoming.append({
                'id': e.id,
                'title': e.title,
                'event_date': e.event_date.isoformat(),
                'guest_count': e.guest_count,
                'confirmed_count': e.confirmed_count,
            })

        return {
            'total_events': total_events,
            'active_events': active_events,
            'finished_events': finished_events,
            'draft_events': draft_events,
            'upcoming_events': upcoming,
            'total_guests': total_guests,
            'confirmed_guests': confirmed_guests,
            'pending_guests': pending_guests,
            'rejected_guests': rejected_guests,
            'total_attendances': total_attendances,
            'attendance_rate': attendance_rate,
            'events_by_category': events_by_category,
            'events_by_month': events_by_month,
        }
