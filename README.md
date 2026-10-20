# EventPro

Aplicación web para organizar eventos de punta a punta: crear el evento, invitar a los asistentes, recibir sus confirmaciones y registrar el ingreso el día del evento.

Proyecto de la materia Programación — Universidad Nacional de Rafaela (UNRaf).

> 🚧 **En desarrollo.** Algunas funciones todavía están en construcción.

---

## Funcionalidades

- **Cuentas de usuario:** registro con verificación de email, inicio de sesión con JWT, recuperación y cambio de contraseña, y perfil de usuario.
- **Roles:** administrador, organizador y colaborador.
- **Eventos:** alta, edición y baja de eventos con fecha, hora, ubicación, categoría e imagen. Cada evento pasa por los estados borrador → activo → finalizado.
- **Invitados:** carga de invitados por evento y seguimiento de su respuesta (pendiente, confirmado o rechazado).
- **Invitaciones por correo:** cada invitado recibe un mail con su código QR y un enlace a una página pública (sin cuenta) donde confirma o rechaza su asistencia.
- **Asistencia:** check-in de invitados con código QR único (se puede ver, descargar o imprimir), escaneándolo con la cámara —también desde el celular— o leyéndolo desde una foto, e historial de ingresos.
- **Diseño adaptable:** la aplicación se puede usar desde el celular, con menú desplegable.
- **Gastos:** registro de gastos por evento con categorías, presupuesto opcional y control de lo gastado contra lo presupuestado.
- **Reportes:** descarga de invitados y asistencia, y de gastos, en archivos de Excel (.xlsx) con formato de moneda y fechas.
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
│       ├── expenses/     Gastos y presupuesto por evento
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
| Autenticación | `/api/auth/` (register, login, logout, refresh, verify-email, resend-verification, forgot-password, reset-password…) |
| Usuarios | `/api/users/` |
| Eventos | `/api/events/` |
| Invitaciones | `/api/invitations/` (`send/` para enviarlas por correo, `export/?event=<id>` para el Excel) |
| Invitación pública | `/api/public/invitations/<código>/` (sin autenticación) |
| Asistencia | `/api/attendance/` |
| Gastos | `/api/expenses/` (`summary/?event=<id>` y `export/?event=<id>` para el Excel) |
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
| Frontend | https://localhost:5173 |
| API | http://localhost:8000/api/ |
| Panel de administración | http://localhost:8000/admin/ |

El frontend usa HTTPS con un certificado de desarrollo autofirmado (la cámara del navegador solo funciona con HTTPS). La primera vez el navegador muestra un aviso de seguridad: elegir «Configuración avanzada» → «Continuar a localhost».

### Usarlo desde el celular

Para escanear los QR con la cámara del celular, con el celular conectado a la misma red WiFi que la computadora:

1. En la computadora, averiguar su IP local (en Windows: `ipconfig`, dato «Dirección IPv4», por ejemplo `192.168.0.15`).
2. En el navegador del celular, abrir `https://<IP>:5173` (por ejemplo `https://192.168.0.15:5173`) y aceptar el aviso del certificado.
3. Si no carga, permitir el acceso en el Firewall de Windows (Docker Desktop / puerto 5173 en redes privadas).

### Emails en desarrollo

En desarrollo los emails no se envían: se imprimen en la consola de Docker (`docker compose logs backend`). Los enlaces de verificación de email, de recuperación de contraseña y de las invitaciones aparecen además en una línea aparte, listos para copiar:

```
>>> Enlace de verificación de email para usuario@correo.com:
>>> https://localhost:5173/verify-email?token=...
```

Más comandos útiles (logs, acceso a contenedores, migraciones) en [`README_DOCKER.md`](README_DOCKER.md).
