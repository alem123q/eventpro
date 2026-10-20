# EventPro: funcionalidades y plan de pruebas

Este documento resume qué ofrece EventPro y cómo probar cada funcionalidad a mano. Son 11 grupos de funcionalidades y 85 pruebas; cada una indica los pasos y el resultado esperado.

## Índice

- [Qué ofrece EventPro](#qué-ofrece-eventpro)
- [Antes de empezar](#antes-de-empezar)
- [1. Cuentas y acceso](#1-cuentas-y-acceso)
- [2. Panel de control](#2-panel-de-control)
- [3. Eventos](#3-eventos)
- [4. Invitados y códigos QR](#4-invitados-y-códigos-qr)
- [5. Invitaciones por correo y página del invitado](#5-invitaciones-por-correo-y-página-del-invitado)
- [6. Check-in y asistencia](#6-check-in-y-asistencia)
- [7. Gastos y presupuesto](#7-gastos-y-presupuesto)
- [8. Reportes en Excel](#8-reportes-en-excel)
- [9. Colaboradores en la puerta](#9-colaboradores-en-la-puerta)
- [10. Uso desde el celular](#10-uso-desde-el-celular)
- [11. Seguridad y permisos](#11-seguridad-y-permisos)
- [Pruebas automatizadas](#pruebas-automatizadas)

## Qué ofrece EventPro

| Grupo | Qué se puede hacer |
|---|---|
| Cuentas y acceso | Registro con verificación de email, inicio de sesión con renovación automática, recuperación y cambio de contraseña, perfil. |
| Panel de control | Eventos por estado, invitados, confirmaciones, tasa de asistencia y total gastado, con accesos directos. |
| Eventos | Alta y edición con imagen y presupuesto opcional; estados borrador → activo → finalizado; búsqueda, filtros y calendario. |
| Invitados y QR | Carga uno por uno o desde CSV, respuesta (pendiente, confirmado, rechazado) y un código QR único por invitado. |
| Invitaciones por correo | Envío del QR por mail y página pública donde el invitado confirma o rechaza sin crear cuenta. |
| Check-in y asistencia | Registro del ingreso con la cámara, una foto, el código en texto o un botón; validaciones e historial. |
| Gastos y presupuesto | Gastos por categoría y barra que compara lo gastado con el presupuesto. |
| Reportes en Excel | Invitados y asistencia, y gastos, con formato de moneda, fechas, filtros y totales. |
| Colaboradores | Personas que hacen el check-in en la puerta sin acceso a invitados, gastos ni reportes. |
| Uso desde el celular | HTTPS, acceso por la IP de la computadora y diseño adaptado a pantallas chicas. |
| Seguridad | Cada organizador ve solo sus eventos, códigos QR imposibles de adivinar y límites de intentos por minuto. |

## Antes de empezar

1. En la carpeta del proyecto: `docker compose up --build` (ver [README](../README.md)).
2. Abrir `https://localhost:5173` y aceptar el aviso del certificado (Configuración avanzada → Continuar).
3. Tener dos cuentas: la del **organizador** y una segunda para probar **colaboradores** (por ejemplo, `colaborador@test.com`).
4. Para las pruebas de cámara: en el celular, conectado a la misma WiFi, abrir `https://<IP de la computadora>:5173` (en Windows, la IP sale de `ipconfig`, «Dirección IPv4»).
5. Los correos no se envían de verdad: aparecen en la consola de Docker (`docker compose logs backend`), con el enlace limpio en las líneas que empiezan con `>>>`.

## 1. Cuentas y acceso

| N.º | Prueba | Pasos | Resultado esperado |
|---|---|---|---|
| 1.1 | Registro | Entrar a «Regístrate» y completar los datos con una contraseña de 8 caracteres o más. | Se crea la cuenta y en la consola aparece el enlace de verificación. |
| 1.2 | Registro con errores | Registrarse con contraseñas distintas o con un email ya usado. | Mensaje de error en el campo; no se crea la cuenta. |
| 1.3 | Verificar el email | Abrir el enlace `>>> …/verify-email?token=…` de la consola. | «¡Email verificado!» |
| 1.4 | Enlace ya usado | Abrir el mismo enlace otra vez. | «Enlace inválido» y opción de pedir uno nuevo. |
| 1.5 | Inicio de sesión | Ingresar email y contraseña correctos. | Entra al Panel de control. |
| 1.6 | Contraseña incorrecta | Ingresar una contraseña equivocada. | Mensaje de error; no entra. |
| 1.7 | Rutas protegidas | Cerrar sesión y abrir `https://localhost:5173/dashboard`. | Redirige al inicio de sesión. |
| 1.8 | Recuperar la contraseña | «¿Olvidaste tu contraseña?» → email → abrir el enlace `>>>` → nueva contraseña. | Entra con la contraseña nueva. |
| 1.9 | Cambiar la contraseña | Mi Perfil → Cambiar contraseña. | Entra con la contraseña nueva. |
| 1.10 | Editar el perfil | Mi Perfil → Editar perfil → cambiar nombre o teléfono. | Los datos se guardan y el nombre cambia en la barra superior. |
| 1.11 | Reenviar la verificación | Con una cuenta sin verificar: Mi Perfil → «Reenviar enlace». | Mensaje de envío y enlace nuevo en la consola. |
| 1.12 | Cerrar sesión | Menú del avatar → Cerrar sesión. | Vuelve al inicio de sesión. |

## 2. Panel de control

| N.º | Prueba | Pasos | Resultado esperado |
|---|---|---|---|
| 2.1 | Panel vacío | Entrar con una cuenta nueva, sin eventos. | Todas las métricas en 0, sin errores. |
| 2.2 | Métricas | Con eventos, invitados y gastos cargados, comparar las tarjetas con los datos. | Las cantidades coinciden (eventos por estado, invitados, confirmados, pendientes, total gastado). |
| 2.3 | Tasa de asistencia | Registrar el ingreso de 1 de 3 confirmados. | Muestra 33 % y debajo «1 de 3 ingresaron»; nunca supera 100 %. |
| 2.4 | Accesos directos | Tocar la tarjeta «Eventos activos». | Abre la lista de eventos filtrada por ese estado. |
| 2.5 | Próximos eventos y categorías | Revisar las listas de abajo. | Aparecen los eventos activos próximos y la cantidad por categoría. |

## 3. Eventos

| N.º | Prueba | Pasos | Resultado esperado |
|---|---|---|---|
| 3.1 | Crear un evento | Eventos → Nuevo evento, con imagen y presupuesto. | Se crea en estado Borrador y se ve con su imagen. |
| 3.2 | Fecha correcta | Crear un evento para el 1 de diciembre. | Se muestra el 1 de diciembre (no el día anterior). |
| 3.3 | Fecha pasada | Intentar crear un evento con una fecha anterior a hoy. | Mensaje de error; no se crea. |
| 3.4 | Buscar y filtrar | Usar el buscador y los filtros de categoría y estado. | La lista muestra solo los eventos que coinciden. |
| 3.5 | Editar | Detalle → Editar → cambiar título o ubicación. | Los cambios se guardan. |
| 3.6 | Activar | En un borrador: «Activar evento» y confirmar. | Pasa a Activo; el botón cambia a «Finalizar evento». |
| 3.7 | Finalizar | En un evento activo: «Finalizar evento» y confirmar. | Pasa a Finalizado; ya no tiene botón de estado. |
| 3.8 | Campos obligatorios | Nuevo evento → dejar el título vacío y guardar. | Mensaje de campo obligatorio; no se crea. |
| 3.9 | Calendario | Calendario → navegar con las flechas. | Los eventos aparecen en su día; hoy está marcado. |

## 4. Invitados y códigos QR

| N.º | Prueba | Pasos | Resultado esperado |
|---|---|---|---|
| 4.1 | Agregar invitado | Invitados → Añadir invitado. | Aparece en la tabla como Pendiente y «Sin enviar». |
| 4.2 | Email repetido | Agregar otro invitado con el mismo email en el mismo evento. | Mensaje «ya fue agregado a este evento». |
| 4.3 | Importar CSV | Importar CSV → pegar líneas `nombre,apellido,email`. | Se crean todos; las líneas con errores se informan por número. |
| 4.4 | Editar y eliminar | Usar ✏️ y 🗑️ en un invitado. | Se actualiza o desaparece de la tabla. |
| 4.5 | Cambiar la respuesta | Cambiar el desplegable a Confirmado o Rechazado. | La etiqueta cambia de color y de texto. |
| 4.6 | Buscar | Escribir parte de un nombre o email. | La tabla muestra solo los que coinciden. |
| 4.7 | Ver el QR | Tocar 🔳 en un invitado. | Ventana con el QR, el código y los botones Copiar, Descargar e Imprimir. |
| 4.8 | Descargar e imprimir el QR | Descargar PNG e Imprimir desde la ventana. | Se descarga la imagen y se abre la vista de impresión. |
| 4.9 | Quitar la confirmación a quien ingresó | Pasar a Pendiente a un invitado que ya ingresó. | Aviso de que ya ingresó; la respuesta no cambia. |

## 5. Invitaciones por correo y página del invitado

| N.º | Prueba | Pasos | Resultado esperado |
|---|---|---|---|
| 5.1 | Evento en borrador | Abrir Invitados de un evento en borrador. | «Enviar invitaciones» deshabilitado, con el aviso de activar el evento. |
| 5.2 | Enviar todas | En un evento activo: «✉️ Enviar invitaciones (N sin enviar)». | «Se enviaron N invitaciones»; la columna Invitación dice «Enviada» con fecha y hora. |
| 5.3 | Contenido del mail | Revisar la consola de Docker. | Mail con datos del evento, QR como imagen y botones Confirmo / No voy; enlace limpio en `>>> Invitación para …`. |
| 5.4 | Reenviar una | Tocar ✉️ en un invitado que ya la recibió. | Pide confirmación y la reenvía; se actualiza la fecha. |
| 5.5 | Confirmar desde el celular | Abrir el enlace en el celular (cambiando `localhost` por la IP) → «Confirmo asistencia». | «Confirmaste tu asistencia» y aparece el QR con botón para descargarlo. |
| 5.6 | Rechazar | Con otro invitado: «No voy a poder ir». | «Respondiste que no vas a poder ir»; no muestra QR. |
| 5.7 | Cambiar de idea | Volver a abrir el enlace y cambiar la respuesta. | La respuesta se actualiza. |
| 5.8 | Lo ve el organizador | Recargar Invitados en la computadora. | La respuesta del invitado, con «por el invitado» debajo. |
| 5.9 | Después de ingresar | Registrar su ingreso y abrir su enlace otra vez. | «Ya ingresaste al evento»; ya no puede cambiar la respuesta. |
| 5.10 | Enlace inválido | Abrir el enlace con un carácter cambiado. | «Invitación no disponible». |

## 6. Check-in y asistencia

| N.º | Prueba | Pasos | Resultado esperado |
|---|---|---|---|
| 6.1 | Grupos | Abrir Check-in de un evento activo con confirmados y pendientes. | Tres grupos: Por ingresar, Sin confirmar y Ya ingresaron. |
| 6.2 | Código en texto | Pegar el código de un confirmado y tocar Registrar. | «✓ Ingreso registrado: &lt;nombre&gt;»; pasa a Ya ingresaron. |
| 6.3 | Botón junto al nombre | Tocar Registrar en un invitado de Por ingresar. | Ingreso registrado. |
| 6.4 | Código repetido | Registrar otra vez el mismo código. | «ya había ingresado (a las HH:MM)»; no se duplica. |
| 6.5 | Código de otro evento | Pegar el código de un invitado de otro evento. | Rechazo que dice de quién es y de qué evento. |
| 6.6 | Código inventado | Escribir un código cualquiera. | «Código QR inválido». |
| 6.7 | Invitado sin confirmar | Pegar el código de un invitado pendiente. | Rechazo: todavía no confirmó su asistencia. |
| 6.8 | Escanear con la cámara | En el celular: Escanear con cámara → apuntar al QR de la pantalla de la computadora. | Vibra, registra el ingreso y el escáner sigue abierto para el siguiente. |
| 6.9 | Leer desde una foto | En el celular: Leer desde una foto → sacar la foto al QR (de lejos y de cerca). | Lee el código y registra el ingreso. |
| 6.10 | Evento no activo | Intentar el check-in en un evento finalizado. | Rechazo: el evento no está activo. |
| 6.11 | Contador | Revisar el subtítulo después de varios ingresos. | «N de M confirmados ingresaron» con los números correctos. |
| 6.12 | Historial | Detalle del evento → Historial. | Lista de ingresos con nombre, email y hora. |

## 7. Gastos y presupuesto

| N.º | Prueba | Pasos | Resultado esperado |
|---|---|---|---|
| 7.1 | Agregar gasto | Gastos → Agregar gasto con concepto, categoría, monto y quién pagó. | Aparece en la tabla y suma al total. |
| 7.2 | Validaciones | Guardar con el concepto vacío o un monto negativo o en 0. | Mensajes de error en los campos; no se guarda. |
| 7.3 | Editar y eliminar | Usar ✏️ y 🗑️ en un gasto. | Se actualiza o desaparece, y el total cambia. |
| 7.4 | Barra del presupuesto | Cargar gastos hasta pasar el 80 % y después el 100 %. | La barra pasa de verde a amarillo y a rojo, con «Excedido». |
| 7.5 | Sin presupuesto | Abrir Gastos de un evento sin presupuesto. | Muestra solo el total gastado, sin barra. |
| 7.6 | Totales por categoría | Cargar gastos de varias categorías. | Aparece el total de cada categoría. |
| 7.7 | Total en el panel | Volver al Panel de control. | «Total gastado» suma los gastos de todos los eventos. |

## 8. Reportes en Excel

| N.º | Prueba | Pasos | Resultado esperado |
|---|---|---|---|
| 8.1 | Excel de invitados | Invitados (o Historial) → ⬇️ Descargar Excel → abrirlo. | Un invitado por fila con respuesta, envío, ingreso y hora; columnas anchas, sin `####`. |
| 8.2 | Excel de gastos | Gastos → ⬇️ Descargar Excel → abrirlo. | Monto con formato `$ 28.500,50`; Total gastado, Presupuesto y Disponible al final. |
| 8.3 | Fórmulas | En el Excel de gastos, cambiar un monto. | El total y lo disponible se recalculan solos. |
| 8.4 | Encabezado y filtros | Bajar en la hoja y usar el filtro de una columna. | El encabezado queda fijo y el filtro funciona. |

## 9. Colaboradores en la puerta

Requiere la segunda cuenta.

| N.º | Prueba | Pasos | Resultado esperado |
|---|---|---|---|
| 9.1 | Email sin cuenta | Detalle del evento → Colaboradores → un email no registrado. | «No hay ninguna cuenta con ese email…» |
| 9.2 | Agregar | Agregar el email de la segunda cuenta. | Aparece en la lista; en la consola, el aviso al colaborador. |
| 9.3 | Lo que ve el colaborador | Entrar con la segunda cuenta → Eventos. | El evento con la etiqueta «Colaborador · Organiza …». |
| 9.4 | Detalle limitado | Abrir el evento como colaborador. | Aviso de colaborador; solo Check-in e Historial, sin Editar, Invitados, Gastos ni presupuesto. |
| 9.5 | Check-in del colaborador | Escanear el QR de un invitado confirmado. | Ingreso registrado. |
| 9.6 | Sin reportes | Historial como colaborador. | No aparece el botón de Excel. |
| 9.7 | Quitar | El organizador toca 🗑️; el colaborador recarga Eventos. | El evento desaparece de su lista; si lo abre: «ya no tenés acceso». |

## 10. Uso desde el celular

| N.º | Prueba | Pasos | Resultado esperado |
|---|---|---|---|
| 10.1 | Entrar desde el celular | Abrir `https://<IP de la computadora>:5173` y aceptar el aviso del certificado. | Se abre el inicio de sesión. |
| 10.2 | Menú ☰ | Tocar ☰, elegir una sección; abrirlo de nuevo y tocar fuera. | El menú se abre, lleva a la sección y se cierra. |
| 10.3 | Pantallas sin desbordes | Recorrer Panel, Eventos, Invitados, Gastos y Check-in. | Nada queda cortado; las tablas se deslizan dentro de su recuadro. |
| 10.4 | Permiso de cámara | Primer uso de Escanear con cámara. | El navegador pide permiso; si se niega, el escáner explica cómo habilitarlo. |
| 10.5 | Computadora sin cambios | Abrir la aplicación en la computadora. | Menú lateral fijo, sin botón ☰. |

## 11. Seguridad y permisos

| N.º | Prueba | Pasos | Resultado esperado |
|---|---|---|---|
| 11.1 | Datos de otro organizador | Con la segunda cuenta, abrir `https://localhost:5173/events/<id de un evento del organizador>`. | «Este evento no existe o ya no tenés acceso a él». |
| 11.2 | Límite de inicio de sesión | Equivocar la contraseña 11 veces seguidas. | Desde el intento 11, la solicitud se rechaza; hay que esperar un minuto. |
| 11.3 | Códigos distintos | Ver el QR de dos invitados del mismo evento. | Los códigos de 32 caracteres no tienen relación entre sí. |
| 11.4 | Sesión vencida | Dejar la aplicación abierta más de 30 minutos y seguir usándola. | Sigue funcionando sin pedir de nuevo la contraseña (renovación automática). |
| 11.5 | Pruebas automatizadas | `docker compose exec backend python manage.py test` | 194 pruebas, resultado OK. |

## Pruebas automatizadas

Además de estas pruebas manuales, el backend tiene 194 pruebas automatizadas que verifican la API: permisos, validaciones, el check-in, las invitaciones, los reportes y los colaboradores. Se ejecutan con:

```bash
docker compose exec backend python manage.py test
```
