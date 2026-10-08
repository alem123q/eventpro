# EventPro

Aplicación web para organizar eventos de punta a punta: crear el evento, invitar a los asistentes, recibir sus confirmaciones y registrar el ingreso el día del evento.

Proyecto de la materia Programación — Universidad Nacional de Rafaela (UNRaf).

> 🚧 **En desarrollo.** Algunas funciones todavía están en construcción.

---

## Funcionalidades

- **Cuentas de usuario:** registro, inicio de sesión con JWT, recuperación y cambio de contraseña, y perfil de usuario.
- **Roles:** administrador, organizador y colaborador.
- **Eventos:** alta, edición y baja de eventos con fecha, hora, ubicación, categoría e imagen. Cada evento pasa por los estados borrador → activo → finalizado.
- **Invitados:** carga de invitados por evento y seguimiento de su respuesta (pendiente, confirmado o rechazado).
- **Asistencia:** check-in de invitados con código único e historial de ingresos.
- **Dashboard:** métricas generales de eventos, invitaciones y asistencia.
- **Calendario:** vista de los eventos por fecha.

## Tecnologías

| Capa | Stack |
|---|---|
| Backend | Python · Django · Django REST Framework · Simple JWT |
| Frontend | React · Vite · React Router · Axios |
| Base de datos | SQLite |
| Entorno | Docker · Docker Compose |

## Arquitectura

```
eventpro/
├── backend/            API REST en Django
│   ├── config/         Configuración del proyecto (settings, urls, paginación, throttling)
│   └── apps/
│       ├── users/        Autenticación, perfiles y roles
│       ├── events/       Gestión de eventos
│       ├── invitations/  Invitados y confirmaciones (RSVP)
│       ├── attendance/   Check-in e historial de asistencia
│       └── dashboard/    Estadísticas
├── frontend/           Interfaz en React
│   └── src/
│       ├── pages/        Pantallas (login, dashboard, eventos, invitados, check-in…)
│       ├── components/   Componentes reutilizables
│       └── services/     Comunicación con la API
└── docker-compose.yml
```

Cada app del backend separa la lógica de negocio (`services.py`) de las vistas, los serializers, los permisos y las validaciones. El modelo de datos completo está en [`backend/DB_DIAGRAM.md`](backend/DB_DIAGRAM.md).

### Endpoints principales

| Recurso | Ruta |
|---|---|
| Autenticación | `/api/auth/` (register, login, logout, refresh, forgot-password, reset-password…) |
| Usuarios | `/api/users/` |
| Eventos | `/api/events/` |
| Invitaciones | `/api/invitations/` |
| Asistencia | `/api/attendance/` |
| Estadísticas | `/api/dashboard/stats/` |

## Cómo ejecutarlo

Requisitos: Docker y Docker Compose.

```bash
git clone https://github.com/alem123q/eventpro.git
cd eventpro
docker compose up --build
```

Al arrancar, el backend aplica las migraciones automáticamente. Para entrar al panel de administración, en otra terminal crear un usuario administrador:

```bash
docker compose exec backend python manage.py createsuperuser
```

| Servicio | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API | http://localhost:8000/api/ |
| Panel de administración | http://localhost:8000/admin/ |

Más comandos útiles (logs, acceso a contenedores, migraciones) en [`README_DOCKER.md`](README_DOCKER.md).
