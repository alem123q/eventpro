/*
 * Genera el informe del proyecto EventPro en Word (formato APA 7, hoja A4).
 *
 * Uso:  node generar_informe.js [paginas.json]
 * Las imagenes se leen de ./img. El indice se completa en dos pasadas: la
 * primera genera el documento, se convierte a PDF para ubicar en que pagina
 * cae cada titulo, y la segunda escribe esos numeros en el indice.
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  Header, AlignmentType, HeadingLevel, PageNumber, PageBreak, BorderStyle,
  WidthType, ShadingType, LevelFormat, TabStopType, VerticalAlign, LineRuleType,
} = require('docx');

const IMG = path.join(__dirname, 'img');
const pageNumbers = process.argv[2] && fs.existsSync(process.argv[2])
  ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : {};

// ---------- Medidas (A4, margenes de 2,54 cm) ----------
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1440;
const CONTENT_W = PAGE_W - 2 * MARGIN; // 9026 DXA
const MAX_IMG_W = 600;                 // px (~6,25 in)
const MAX_IMG_H = 600;
const FONT = 'Times New Roman';
const DOUBLE = 480, SINGLE = 240;
const INDENT = 720;                    // sangria de primera linea (1,27 cm)

// ---------- Helpers de texto ----------
// Acepta texto con **negrita**, *cursiva* y `codigo`.
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(new TextRun({ text: tok.slice(2, -2), bold: true, ...base }));
    else if (tok.startsWith('`')) out.push(new TextRun({ text: tok.slice(1, -1), font: 'Consolas', size: (base.size || 24) - 2, ...base, }));
    else out.push(new TextRun({ text: tok.slice(1, -1), italics: true, ...base }));
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

const P = (text, opts = {}) => new Paragraph({
  children: runs(text),
  spacing: { line: DOUBLE, lineRule: LineRuleType.AUTO, before: 0, after: 0 },
  indent: opts.noIndent ? undefined : { firstLine: INDENT },
  alignment: opts.align || AlignmentType.LEFT,
  keepNext: opts.keepNext,
});

const bullet = (text, level = 0) => new Paragraph({
  children: runs(text),
  numbering: { reference: 'vinetas', level },
  spacing: { line: DOUBLE, lineRule: LineRuleType.AUTO, before: 0, after: 0 },
});

const numbered = (text, ref = 'numeros') => new Paragraph({
  children: runs(text),
  numbering: { reference: ref, level: 0 },
  spacing: { line: DOUBLE, lineRule: LineRuleType.AUTO, before: 0, after: 0 },
});

const H1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)], pageBreakBefore: true });
const H1same = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
const H3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });

const code = (lines) => lines.map((l, i) => new Paragraph({
  children: [new TextRun({ text: l || ' ', font: 'Consolas', size: 19 })],
  spacing: { line: SINGLE, lineRule: LineRuleType.AUTO, before: i === 0 ? 120 : 0, after: i === lines.length - 1 ? 240 : 0 },
  indent: { left: 360 },
  shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F4F6' },
}));

// ---------- Figuras y tablas (estilo APA) ----------
let figN = 0, tabN = 0;
// Las figuras y tablas se nombran por clave; el numero sale del orden de
// estas listas, asi agregar una figura no obliga a renumerar el texto.
const FIGS = [
  'arquitectura', 'modelo', 'login', 'verificacion', 'dashboard', 'eventos', 'detalle',
  'invitados', 'qr', 'invitacionMail', 'invitacionPublica', 'checkin', 'escaner', 'gastos',
  'gastosExcedido', 'reportesExcel', 'calendario', 'colaboradoresOrganizador',
  'colaboradorCelular', 'celular', 'maqueta', 'flujoCheckin', 'repetido', 'otroEvento',
  'noConfirmado', 'gastosValidacion', 'fotoPantalla',
];
const TABS = [
  'tecnologias', 'api', 'comparacion', 'historial', 'errores', 'fotos', 'problemas',
  'pruebasApi', 'manualCheckin', 'manualCelular', 'manualInvitaciones', 'servicios', 'futuro',
];
const num = (list, k, what) => { const i = list.indexOf(k); if (i < 0) throw new Error(`${what} desconocida: ${k}`); return i + 1; };
const nF = (k) => num(FIGS, k, 'Figura');
const nT = (k) => num(TABS, k, 'Tabla');
const F = (k) => `Figura ${nF(k)}`;
const T = (k) => `Tabla ${nT(k)}`;
function pngSize(file) {
  const buf = fs.readFileSync(file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), buf };
}
function figure(key, file, title, note, maxW = MAX_IMG_W, maxH = MAX_IMG_H) {
  figN += 1;
  if (FIGS[figN - 1] !== key) throw new Error(`Orden de figuras: se esperaba ${FIGS[figN - 1]} y llegó ${key}`);
  const { w, h, buf } = pngSize(path.join(IMG, file));
  let width = maxW, height = Math.round(h * maxW / w);
  if (height > maxH) { height = maxH; width = Math.round(w * maxH / h); }
  const items = [
    new Paragraph({ children: [new TextRun({ text: `Figura ${figN}`, bold: true })], spacing: { before: 240, after: 0, line: DOUBLE, lineRule: LineRuleType.AUTO }, keepNext: true }),
    new Paragraph({ children: [new TextRun({ text: title, italics: true })], spacing: { after: 120, line: DOUBLE, lineRule: LineRuleType.AUTO }, keepNext: true }),
    new Paragraph({
      children: [new ImageRun({ type: 'png', data: buf, transformation: { width, height },
        altText: { title: `Figura ${figN}`, description: title, name: file } })],
      alignment: AlignmentType.CENTER, spacing: { after: 120, line: SINGLE, lineRule: LineRuleType.AUTO }, keepNext: Boolean(note),
    }),
  ];
  if (note) {
    items.push(new Paragraph({
      children: [new TextRun({ text: 'Nota. ', italics: true }), ...runs(note)],
      spacing: { line: DOUBLE, lineRule: LineRuleType.AUTO, after: 240 },
    }));
  }
  return { n: figN, items };
}

const thin = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

function table(key, title, headers, rows, widths, note) {
  tabN += 1;
  if (TABS[tabN - 1] !== key) throw new Error(`Orden de tablas: se esperaba ${TABS[tabN - 1]} y llegó ${key}`);
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = CONTENT_W / total;
  const w = widths.map((x) => Math.floor(x * scale));
  w[w.length - 1] += CONTENT_W - w.reduce((a, b) => a + b, 0);
  const cell = (text, i, isHeader, isLast) => new TableCell({
    width: { size: w[i], type: WidthType.DXA },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    borders: {
      top: isHeader ? thin : none,
      bottom: isHeader || isLast ? thin : none,
      left: none, right: none,
    },
    children: [new Paragraph({
      children: runs(String(text), { size: 20, bold: isHeader || undefined }),
      spacing: { line: SINGLE, lineRule: LineRuleType.AUTO, before: 0, after: 0 },
    })],
  });
  const tbl = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: w,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true, false)) }),
      ...rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false, ri === rows.length - 1)) })),
    ],
  });
  const out = [
    new Paragraph({ children: [new TextRun({ text: `Tabla ${tabN}`, bold: true })], spacing: { before: 240, line: DOUBLE, lineRule: LineRuleType.AUTO }, keepNext: true }),
    new Paragraph({ children: [new TextRun({ text: title, italics: true })], spacing: { line: DOUBLE, lineRule: LineRuleType.AUTO, after: 60 }, keepNext: true }),
    tbl,
  ];
  if (note) out.push(new Paragraph({ children: [new TextRun({ text: 'Nota. ', italics: true }), ...runs(note, { size: 20 })], spacing: { before: 60, after: 240, line: SINGLE, lineRule: LineRuleType.AUTO } }));
  else out.push(new Paragraph({ children: [], spacing: { after: 240 } }));
  return { n: tabN, items: out };
}

// =====================================================================
// CONTENIDO
// =====================================================================
const body = [];
const add = (...xs) => xs.forEach((x) => (Array.isArray(x) ? body.push(...x) : x.items ? body.push(...x.items) : body.push(x)));

// ---------- Portada (APA 7, trabajo de estudiantes) ----------
const blank = () => new Paragraph({ children: [], spacing: { line: DOUBLE, lineRule: LineRuleType.AUTO } });
const center = (text, bold = false) => new Paragraph({ children: [new TextRun({ text, bold })], alignment: AlignmentType.CENTER, spacing: { line: DOUBLE, lineRule: LineRuleType.AUTO } });
const portada = [
  blank(), blank(), blank(),
  center('EventPro: aplicación web para la gestión integral de eventos', true),
  center('Desarrollo full stack con Django REST Framework, React y Docker', true),
  blank(),
  center('Francisco Alemandi, Eloy Kirov y Sebastián Palavecino'),
  center('Ingeniería en Computación, Universidad Nacional de Rafaela'),
  center('Programación'),
  center('Javier Fornari'),
  center('20 de octubre de 2026'),
];

// ---------- Indice (se completa en la segunda pasada) ----------
const TOC = [];
function tocEntry(text, level) { TOC.push({ text, level }); return text; }

// =====================================================================
// 1. Introduccion
// =====================================================================
add(H1(tocEntry('Introducción', 1)));
add(P('Organizar un evento —una conferencia, un taller, una reunión de egresados— implica coordinar tareas que suelen quedar repartidas en planillas, chats y listas en papel: armar la lista de invitados, saber quién confirmó, controlar quién ingresó el día del evento y llevar la cuenta de lo que se gastó. Cuando esa información está dispersa, es difícil saber en qué estado está el evento y se cometen errores, como dejar entrar a alguien sin invitación o pasarse del presupuesto sin notarlo.'));
add(P('**EventPro** es una aplicación web que reúne todo ese ciclo en un solo lugar. Un organizador crea sus eventos y carga a los invitados; cada invitado recibe por correo su código QR y confirma su asistencia desde un enlace. El día del evento, el organizador —o las personas que lo ayudan en la puerta— registra el ingreso de cada uno escaneando ese código con la cámara del celular. Además, puede cargar los gastos del evento, compararlos con un presupuesto y descargar reportes en Excel. Un panel de control resume la actividad de todos sus eventos.'));
add(H2(tocEntry('Objetivo general', 2)));
add(P('Desarrollar una aplicación web completa —interfaz, API y base de datos— que permita gestionar eventos de punta a punta, ejecutable de forma reproducible mediante contenedores Docker.'));
add(H2(tocEntry('Objetivos específicos', 2)));
add(bullet('Implementar una API REST con autenticación por tokens y permisos por rol, de modo que cada organizador acceda solo a sus propios datos.'));
add(bullet('Construir una interfaz web conectada a esa API para gestionar eventos, invitados, asistencia y gastos.'));
add(bullet('Implementar un control de ingreso mediante códigos QR únicos e imposibles de adivinar, que se puedan escanear con la cámara.'));
add(bullet('Incorporar un módulo de gastos con presupuesto por evento.'));
add(bullet('Enviar las invitaciones por correo y permitir que cada invitado confirme o rechace su asistencia sin crear una cuenta.'));
add(bullet('Permitir el uso de la aplicación desde el celular, con un diseño que se adapte a pantallas chicas, y sumar colaboradores que hagan el check-in sin acceso al resto de los datos.'));
add(bullet('Generar reportes en Excel de la asistencia y de los gastos.'));
add(bullet('Verificar el funcionamiento con pruebas automatizadas, pruebas en el navegador y pruebas manuales del grupo, y documentar los errores encontrados y cómo se corrigieron.'));
add(H2(tocEntry('Alcance', 2)));
add(P('La aplicación está pensada para que cada organizador administre sus propios eventos. Quedan fuera del alcance de esta versión los pagos en línea, el envío real de correos electrónicos (en desarrollo los correos, con todo su contenido, se muestran en la consola del servidor) y la publicación de la aplicación en internet. Estas y otras mejoras se detallan en la sección Funciones a futuro.'));

// =====================================================================
// 2. Tecnologias y arquitectura
// =====================================================================
add(H1(tocEntry('Tecnologías y arquitectura', 1)));
add(P('EventPro sigue una arquitectura cliente-servidor. El *frontend* es una aplicación de página única (SPA) que se ejecuta en el navegador; el *backend* expone una API REST que recibe y devuelve datos en formato JSON (Fielding, 2000). Ambos se ejecutan en contenedores separados orquestados con Docker Compose (Docker Inc., s. f.). La ' + T('tecnologias') + ' resume las tecnologías utilizadas.'));
add(table('tecnologias', 'Tecnologías utilizadas en el proyecto',
  ['Capa', 'Tecnología', 'Uso en el proyecto'],
  [
    ['Backend', 'Python 3.12, Django 6.0', 'Modelos, migraciones, panel de administración y lógica de negocio (Django Software Foundation, s. f.).'],
    ['API', 'Django REST Framework', 'Vistas, serializadores, validaciones, paginación y permisos (Encode OSS, s. f.).'],
    ['Autenticación', 'Simple JWT', 'Tokens de acceso (30 min) y de renovación (7 días) con rotación y lista negra (Jones et al., 2015).'],
    ['Base de datos', 'SQLite', 'Almacenamiento de datos en un archivo; suficiente para el alcance del proyecto.'],
    ['Frontend', 'React 19, React Router, Vite 8', 'Interfaz de usuario, navegación y servidor de desarrollo (Meta Open Source, s. f.; Vite, s. f.).'],
    ['Cliente HTTP', 'Axios', 'Envío de pedidos a la API con el token y renovación automática al vencer.'],
    ['Códigos QR', 'qrcode y jsQR (npm); qrcode (Python)', 'Imagen QR en la aplicación y en el correo de invitación; lectura de códigos desde la cámara o una foto (Cozmo, s. f.).'],
    ['Reportes', 'openpyxl', 'Archivos de Excel con formato de moneda, fechas, filtros y fórmulas (openpyxl, s. f.).'],
    ['HTTPS en desarrollo', '@vitejs/plugin-basic-ssl', 'Certificado autofirmado para que el navegador del celular permita usar la cámara.'],
    ['Infraestructura', 'Docker, Docker Compose', 'Ejecución de backend y frontend en contenedores con un solo comando.'],
    ['Pruebas', 'Django TestCase, Playwright', 'Pruebas automatizadas de la API y pruebas de punta a punta en el navegador (Microsoft, s. f.).'],
  ], [16, 26, 58]));

add(H2(tocEntry('Arquitectura de la aplicación', 2)));
add(P('La ' + F('arquitectura') + ' muestra los componentes y cómo viaja un pedido. El usuario interactúa con las páginas de React desde el navegador de la computadora o del celular; cada página usa un módulo de `services/` que envía el pedido con el token JWT en el encabezado `Authorization`. El pedido llega al servidor de Vite por HTTPS, que lo reenvía a la API (función de *proxy*). Así el navegador se comunica con una sola dirección, lo que permite entrar desde otro dispositivo de la red sin configurar nada más. En el backend, Django REST Framework valida el pedido, verifica los permisos y delega la lógica en las aplicaciones de dominio, que leen y escriben en la base de datos.'));
add(figure('arquitectura', 'arquitectura.png', 'Arquitectura de EventPro y flujo de un pedido', 'Cada recuadro de color dentro de «docker compose» es un contenedor. El navegador solo se comunica con el puerto 5173; el servidor de Vite reenvía las rutas /api y /media al backend.', 470, 520));
add(P('El backend está organizado en seis aplicaciones de Django, una por dominio: `users` (cuentas, roles y autenticación), `events` (eventos, sus estados y sus colaboradores), `invitations` (invitados, envío de invitaciones y página pública del invitado), `attendance` (check-in e historial), `expenses` (gastos y presupuesto) y `dashboard` (estadísticas). Cada una separa responsabilidades en archivos: `models.py` define los datos, `serializers.py` valida la entrada y da forma a la salida, `permissions.py` define quién puede hacer qué, `services.py` concentra la lógica de negocio y `views.py` solo coordina. Esta separación hizo posible agregar el módulo de gastos sin modificar los demás.'));

add(H2(tocEntry('Modelo de datos', 2)));
add(P('La ' + F('modelo') + ' presenta las entidades principales. Un usuario organiza muchos eventos y puede colaborar en eventos de otros; cada evento tiene muchos invitados, muchos gastos y muchos colaboradores; cada invitación puede tener, como máximo, un registro de asistencia. En verde se marcan los campos y entidades incorporados durante este trabajo.'));
add(figure('modelo', 'modelo.png', 'Modelo de datos de EventPro', 'PK = clave primaria; FK = clave foránea. La relación 1 : 0..1 entre invitación y asistencia impide registrar dos veces el ingreso de una misma persona. *El rol global «collaborator» quedó en desuso: los colaboradores se asignan por evento.', 560, 500));
add(P('Además de las relaciones, el modelo impone reglas que la base de datos y la API hacen cumplir:'));
add(bullet('Un mismo correo no puede estar invitado dos veces al mismo evento (restricción única sobre evento y correo).'));
add(bullet('Un evento avanza en un solo sentido: borrador → activo → finalizado. Solo un evento activo admite check-in.'));
add(bullet('El código QR de cada invitación es aleatorio y único, y no se puede modificar desde la API.'));
add(bullet('El monto de un gasto debe ser mayor a cero y el presupuesto no puede ser negativo.'));
add(bullet('Una persona no puede ser colaboradora dos veces del mismo evento, ni colaboradora de un evento que organiza.'));

add(H2(tocEntry('API REST', 2)));
add(P('La ' + T('api') + ' resume los recursos de la API. Todas las rutas, excepto las de registro, inicio de sesión, verificación de correo, recuperación de contraseña y la página pública del invitado, requieren un token válido. Cada organizador solo puede ver y modificar los datos de sus propios eventos; un colaborador solo puede ver los eventos donde colabora y registrar sus ingresos.'));
add(table('api', 'Recursos principales de la API',
  ['Ruta', 'Métodos', 'Descripción'],
  [
    ['`/api/auth/`', 'POST', 'Registro, inicio y cierre de sesión, renovación del token, verificación del correo y recuperación de contraseña.'],
    ['`/api/users/profile/`', 'GET, PUT', 'Perfil del usuario autenticado.'],
    ['`/api/events/`', 'GET, POST, PUT, DELETE', 'Alta, consulta, edición y baja de eventos; filtros por estado, categoría y texto.'],
    ['`/api/events/<id>/status/`', 'PATCH', 'Cambio de estado según las transiciones permitidas.'],
    ['`/api/events/<id>/collaborators/`', 'GET, POST, DELETE', 'Colaboradores del evento (solo el organizador).'],
    ['`/api/invitations/`', 'GET, POST, PUT, DELETE', 'Invitados por evento, incluida la carga masiva desde CSV.'],
    ['`/api/invitations/<id>/rsvp/`', 'PATCH', 'Cambio de la respuesta del invitado (pendiente, confirmado o rechazado).'],
    ['`/api/invitations/send/`', 'POST', 'Envío por correo de las invitaciones pendientes (o de una, en `<id>/send/`).'],
    ['`/api/invitations/export/`', 'GET', 'Excel de invitados y asistencia.'],
    ['`/api/public/invitations/<código>/`', 'GET, POST', 'Página del invitado, sin autenticación: ver la invitación y responder.'],
    ['`/api/attendance/checkin/`', 'POST', 'Registro de ingreso a partir del código QR.'],
    ['`/api/attendance/`', 'GET', 'Historial de ingresos por evento.'],
    ['`/api/expenses/`', 'GET, POST, PATCH, DELETE', 'Gastos por evento.'],
    ['`/api/expenses/summary/`', 'GET', 'Total gastado, presupuesto, saldo y desglose por categoría de un evento.'],
    ['`/api/expenses/export/`', 'GET', 'Excel de gastos con totales.'],
    ['`/api/dashboard/stats/`', 'GET', 'Estadísticas generales del organizador.'],
  ], [34, 20, 46]));

// =====================================================================
// 3. Funcionalidades
// =====================================================================
add(H1(tocEntry('Funcionalidades', 1)));
add(P('En esta sección se recorren las pantallas de la aplicación. Las capturas se tomaron de la aplicación en funcionamiento con datos de ejemplo; las de la computadora tienen 1280 píxeles de ancho y las del celular corresponden a una pantalla de 412 píxeles.'));

add(H2(tocEntry('Cuentas y acceso', 2)));
add(P('Para usar EventPro hay que registrarse e iniciar sesión (' + F('login') + '). Al iniciar sesión, la API entrega un token de acceso y uno de renovación; el frontend los guarda y, cuando el token de acceso vence, pide uno nuevo sin que el usuario lo note. Las rutas internas están protegidas: si no hay sesión, redirigen al inicio de sesión. Los intentos de inicio de sesión y de registro están limitados por minuto para dificultar ataques de fuerza bruta.'));
add(figure('login', '01_login.png', 'Pantalla de inicio de sesión'));
add(P('Al registrarse, el sistema envía un correo con un enlace para verificar la dirección. El enlace lleva a una página que confirma la cuenta apenas se abre, con la sesión iniciada o sin ella. Si el enlace ya se usó o fue reemplazado por uno más nuevo, la página lo informa y permite pedir otro. En el perfil se indica si el correo está verificado y, si no lo está, se ofrece reenviar el enlace (' + F('verificacion') + '). Los enlaces son de un solo uso: al pedir uno nuevo, el anterior deja de funcionar.'));
add(figure('verificacion', 'verificacion_email.png', 'Verificación del correo electrónico, vista desde el celular', '(a) Perfil con el correo sin verificar, después de pedir un enlace nuevo. (b) Página a la que lleva el enlace del correo. (c) Perfil con el correo ya verificado.', 560, 420));

add(H2(tocEntry('Panel de control', 2)));
add(P('El panel de control (' + F('dashboard') + ') resume la actividad del organizador: cantidad de eventos por estado, invitados y confirmaciones, tasa de asistencia y total gastado. Las tarjetas de eventos funcionan como accesos directos: al tocarlas se abre la lista de eventos filtrada por ese estado. Debajo se listan los próximos eventos activos y la distribución de eventos por categoría.'));
add(figure('dashboard', '03_dashboard.png', 'Panel de control con datos de ejemplo', 'La tasa de asistencia se calcula como ingresos sobre invitados esperados y muestra el detalle debajo del porcentaje (por ejemplo, «2 de 6 ingresaron»).'));

add(H2(tocEntry('Eventos', 2)));
add(P('La lista de eventos (' + F('eventos') + ') muestra cada evento con su imagen, estado, categoría, fecha y cantidad de invitados, y permite buscar y filtrar. Desde el formulario se cargan el título, la descripción, la fecha y hora, la ubicación, la categoría, una imagen y, de forma opcional, un presupuesto.'));
add(figure('eventos', '04_eventos.png', 'Lista de eventos con filtros por categoría y estado'));
add(P('En el detalle del evento (' + F('detalle') + ') se accede a la gestión de invitados, gastos y asistencia. El botón principal cambia según el estado: en un borrador dice «Activar evento» y en un evento activo, «Finalizar evento». Antes de cambiar el estado se pide confirmación, porque la transición no se puede deshacer.'));
add(figure('detalle', '06_detalle_evento.png', 'Detalle de un evento activo', null, MAX_IMG_W, 620));

add(H2(tocEntry('Invitados y códigos QR', 2)));
add(P('La pantalla de invitados (' + F('invitados') + ') permite agregarlos uno por uno o importarlos desde un archivo CSV, cambiar su respuesta (pendiente, confirmado o rechazado), ver si se les envió la invitación y si ya ingresaron. Cada invitado tiene un botón para ver su código QR (' + F('qr') + '), que se puede copiar, descargar como imagen o imprimir para entregárselo. Si el invitado todavía no confirmó, la ventana avisa que el check-in no va a funcionar hasta que lo haga.'));
add(figure('invitados', '07_invitados.png', 'Gestión de invitados de un evento'));
add(figure('qr', '08_qr_invitado.png', 'Código QR de la invitación de un invitado', 'El código tiene 32 caracteres hexadecimales generados al azar por el servidor (128 bits), por lo que no puede deducirse a partir de otros datos.'));

add(H2(tocEntry('Invitaciones por correo', 2)));
add(P('Con el evento activo, el botón «Enviar invitaciones» manda un correo a cada invitado que todavía no lo recibió; un ícono en cada fila permite enviar o reenviar una sola. La columna Invitación muestra cuándo se envió la última, y debajo de la respuesta se indica si la eligió el propio invitado. El envío es manual y no automático al cargar a cada persona: así el organizador puede revisar la lista antes, y un error en un CSV no dispara correos.'));
add(P('El correo (' + F('invitacionMail') + ') incluye los datos del evento, el código QR incrustado como imagen y dos botones que llevan a una página pública de EventPro, sin cuenta ni contraseña (' + F('invitacionPublica') + '). Allí el invitado confirma o rechaza su asistencia y puede cambiar de idea; al confirmar ve su QR y lo puede descargar. Si ya ingresó o el evento finalizó, la página lo informa y no deja cambiar la respuesta.'));
add(P('El enlace usa el mismo código aleatorio de 128 bits que el QR, por lo que no se puede adivinar el de otra persona, y no da acceso a ningún otro dato del evento. Al abrir el enlace no se responde solo: hay que tocar un botón, porque algunos programas de correo abren los enlaces para revisarlos y eso podría confirmar a alguien sin que lo sepa.'));
add(figure('invitacionMail', 'invitacion_mail.png', 'Correo de invitación', 'Vista del correo tal como lo genera el servidor. En desarrollo no se envía: se muestra en la consola, con el enlace aparte para copiarlo.', 380, 520));
add(figure('invitacionPublica', 'invitacion_publica.png', 'Página del invitado en el celular', '(a) Al abrir el botón «Confirmo asistencia» del correo, la página resalta esa opción. (b) Después de confirmar: el QR para la entrada. (c) Otro invitado que rechazó; puede cambiar de idea.', 560, 420));

add(H2(tocEntry('Check-in y asistencia', 2)));
add(P('El día del evento, el organizador o sus colaboradores registran el ingreso de cada invitado de una de cuatro maneras: escaneando su código QR con la cámara, leyéndolo desde una foto, pegando el código en texto o con el botón «Registrar» junto a su nombre (' + F('checkin') + '). La pantalla separa a los invitados en tres grupos —por ingresar, sin confirmar y ya ingresaron— y muestra cuántos de los confirmados llegaron. Cada intento informa a quién se registró, o el motivo exacto si no se pudo. El historial de asistencia lista los ingresos con su fecha y hora.'));
add(figure('checkin', '09_checkin_exito.png', 'Pantalla de check-in después de registrar un ingreso', null, MAX_IMG_W, 640));
add(H3('Escaneo con cámara y lectura desde una foto'));
add(P('El botón «Escanear con cámara» abre un escáner que muestra la imagen de la cámara con un recuadro guía (' + F('escaner') + '). En el celular se usa la cámara trasera y, si el dispositivo tiene varias, se puede cambiar de una a otra. El escáner analiza la imagen unas siete veces por segundo y, cuando encuentra un código, hace vibrar el teléfono, registra el ingreso y muestra el resultado sobre la imagen. Después de cada lectura el escáner sigue abierto, para registrar a varios invitados seguidos en la puerta del evento; el mismo código se ignora durante unos segundos para no registrarlo dos veces por error.'));
add(P('El botón «Leer desde una foto» abre la cámara del teléfono (o el selector de archivos en la computadora) y busca el código en la imagen elegida. Es una alternativa para cuando no se puede dar permiso de cámara al navegador. Toda la lectura se hace en el navegador, con la librería jsQR (Cozmo, s. f.): las imágenes no se envían al servidor, que solo recibe el código leído.'));
add(figure('escaner', 'celular_escaner.png', 'Check-in desde el celular', '(a) Pantalla de check-in con los botones de escaneo. (b) Escáner abierto después de leer un código: el resultado se muestra sobre la imagen de la cámara y el escáner queda listo para el siguiente invitado.', 520, 460));

add(H2(tocEntry('Gastos y presupuesto', 2)));
add(P('Cada evento tiene una página de gastos (' + F('gastos') + '). En la parte superior, una barra compara lo gastado con el presupuesto: se muestra en verde mientras hay margen, en amarillo a partir del 80 % y en rojo cuando el gasto supera el presupuesto (' + F('gastosExcedido') + '). Debajo aparecen los totales por categoría y la tabla de gastos, que se pueden agregar, editar o eliminar. Si el evento no tiene presupuesto, la página muestra solo el total gastado.'));
add(figure('gastos', '14_gastos.png', 'Gastos de un evento dentro del presupuesto', null, MAX_IMG_W, 560));
add(figure('gastosExcedido', '15_gastos_excedido.png', 'Gastos de un evento que superó su presupuesto'));

add(H2(tocEntry('Reportes en Excel', 2)));
add(P('Las pantallas de invitados, historial de asistencia y gastos tienen un botón «Descargar Excel» (' + F('reportesExcel') + '). El archivo lo arma el servidor con todos los registros del evento, no solo los de la página visible. Los montos tienen formato de moneda y siguen siendo números que se pueden sumar; las fechas son fechas reales para ordenar y filtrar; el encabezado queda fijo con filtros, y en gastos el total y el saldo disponible son fórmulas que se recalculan si se agrega un gasto a mano. Solo el organizador puede descargarlos, porque incluyen correos y teléfonos.'));
add(figure('reportesExcel', 'reportes_excel.png', 'Reportes en Excel de un evento', '(a) Gastos, con el total, el presupuesto y lo disponible al final. (b) Invitados y asistencia. Vistos en una planilla configurada en español.', MAX_IMG_W, 300));

add(H2(tocEntry('Calendario', 2)));
add(P('El calendario (' + F('calendario') + ') muestra los eventos de cada mes en una grilla y permite navegar entre meses.'));
add(figure('calendario', '16_calendario.png', 'Vista de calendario'));

add(H2(tocEntry('Colaboradores en la puerta', 2)));
add(P('En un evento grande, el organizador no puede registrar solo a todos los invitados. Desde el detalle del evento puede sumar colaboradores por su correo, siempre que tengan cuenta en EventPro, y quitarlos cuando quiera (' + F('colaboradoresOrganizador') + '). La persona agregada recibe un aviso por correo.'));
add(P('El colaborador ve el evento en su lista con la etiqueta «Colaborador» y, al abrirlo, solo encuentra el check-in y el historial (' + F('colaboradorCelular') + '). No puede editar el evento ni cambiar su estado, gestionar invitados, ver gastos o el presupuesto, descargar reportes ni sumar a otros colaboradores. Al quitarlo, pierde el acceso en el momento.'));
add(figure('colaboradoresOrganizador', 'colaboradores_organizador.png', 'Sección de colaboradores en el detalle del evento', null, MAX_IMG_W, 220));
add(figure('colaboradorCelular', 'colaborador_celular.png', 'El evento visto por un colaborador en el celular', '(a) Lista de eventos con la etiqueta «Colaborador». (b) Detalle con solo el check-in y el historial. (c) Escaneo de un invitado en la puerta.', 560, 420));

add(H2(tocEntry('Uso desde el celular', 2)));
add(P('Como el control de ingreso se hace en la puerta del evento, la aplicación tiene que funcionar en el celular. Para eso se resolvieron dos cuestiones. La primera es el acceso: estando en la misma red WiFi que la computadora donde corre Docker, el celular entra con la dirección IP de esa computadora (por ejemplo, `https://192.168.0.15:5173`). Los navegadores solo permiten usar la cámara en páginas seguras —las que se abren por HTTPS o desde la propia computadora como `localhost`— (MDN Web Docs, s. f.), por lo que el servidor de desarrollo se configuró con HTTPS mediante un certificado autofirmado. La primera vez, el navegador muestra un aviso porque el certificado no fue emitido por una autoridad reconocida; basta con aceptarlo.'));
add(P('La segunda cuestión es el diseño. En pantallas de hasta 768 píxeles de ancho, el menú lateral se oculta y se abre con el botón ☰ de la barra superior; el contenido ocupa todo el ancho; las tablas anchas se desplazan dentro de su recuadro en lugar de ensanchar la página, y los encabezados con botones se acomodan en dos renglones (' + F('celular') + ').'));
add(figure('celular', 'celular_pantallas.png', 'Pantallas de EventPro en el celular', '(a) Menú lateral abierto con el botón ☰. (b) Lista de invitados: la tabla se desplaza hacia el costado dentro de su recuadro. (c) Panel de control con las tarjetas en una columna.', 560, 420));

// =====================================================================
// 4. Proceso de desarrollo
// =====================================================================
add(H1(tocEntry('Proceso de desarrollo', 1)));
add(H2(tocEntry('Punto de partida', 2)));
add(P('El grupo contaba con dos versiones del proyecto. La primera, *EventFlow*, tenía un backend en Django con seis módulos y una interfaz visualmente prolija, pero la interfaz era solo una maqueta: todos los datos estaban escritos en el código, el inicio de sesión no validaba credenciales y ningún botón guardaba información (' + F('maqueta') + '). La segunda, *Eventpro*, desarrollada por Sebastián Palavecino, tenía la interfaz conectada a la API, autenticación real y 113 pruebas automatizadas.'));
add(figure('maqueta', '00_maqueta_original.png', 'Primera versión (EventFlow): interfaz de maqueta con datos de ejemplo fijos', 'Las fechas (2024), los invitados y los gastos estaban escritos en el código; además, la barra lateral se superponía al contenido.'));
add(P('Antes de decidir, se clonaron y ejecutaron ambas versiones. La ' + T('comparacion') + ' resume la comparación.'));
add(table('comparacion', 'Comparación de las dos versiones disponibles al inicio',
  ['Aspecto', 'EventFlow (primera versión)', 'Eventpro (versión elegida)'],
  [
    ['Interfaz', 'Maqueta con datos fijos, sin conexión a la API', 'Conectada a la API, 15 pantallas'],
    ['Inicio de sesión', 'Sin validación', 'JWT con renovación automática y rutas protegidas'],
    ['Backend', '6 módulos con CRUD básico', 'Usuarios con roles, eventos, invitaciones, check-in por QR y estadísticas'],
    ['Pruebas', 'Ninguna', '113 pruebas automatizadas'],
    ['Docker', 'Solo el backend', 'Backend y frontend con Docker Compose'],
    ['Gastos y presupuesto', 'Sí (solo en el backend)', 'No'],
  ], [22, 39, 39]));
add(P('Se eligió Eventpro como base porque incorporarle el módulo de gastos requería mucho menos trabajo que conectar y completar la otra versión. Al revisarla en detalle aparecieron varios errores, que se corrigieron antes de agregar funcionalidades nuevas (ver la sección Pruebas y corrección de errores).'));

add(H2(tocEntry('Metodología de trabajo', 2)));
add(P('El trabajo siguió un ciclo iterativo corto. Cada cambio se implementó, se verificó con las pruebas automatizadas y con una prueba en el navegador, y se publicó en GitHub. Luego el grupo lo probó en su propia computadora con Docker —y, a partir del escáner, también en el celular—, siguiendo pasos concretos, e informó los resultados. Cuando una prueba manual mostraba un comportamiento incorrecto, se reproducía el problema, se buscaba la causa en el código, se corregía y, cuando era posible, se agregaba una prueba automatizada para que no volviera a ocurrir.'));
add(P('El código se versionó con Git en el repositorio `github.com/alem123q/eventpro`, con dos ramas:'));
add(bullet('`etapa-2`: rama de trabajo, donde se publican los cambios a medida que se desarrollan.'));
add(bullet('`main`: versión estable. Los cambios de `etapa-2` se unen a `main` solo después de que el grupo los prueba y confirma que funcionan, de modo que `main` siempre sirve como punto de control al que se puede volver.'));
add(P('Al inicio existía además una rama `desarrollo` para integrar cambios, que se eliminó al adoptar este esquema más simple de dos ramas.'));
add(P('Las funcionalidades y sus pruebas manuales —85 en total, con los pasos y el resultado esperado de cada una— se reunieron en un plan de pruebas aparte, que el grupo usa para verificar la aplicación completa antes de cada entrega.'));
add(P('Para la programación, la revisión de código y la preparación de pruebas se utilizó como asistente el modelo de lenguaje Claude (Anthropic, 2026). Las decisiones de diseño y la validación de cada cambio estuvieron a cargo del grupo, que probó cada funcionalidad antes de darla por terminada.'));

add(H2(tocEntry('Historial de cambios', 2)));
add(P('La ' + T('historial') + ' resume los cambios publicados en el repositorio. Cada fila corresponde a uno o más *commits*, es decir, conjuntos de cambios guardados con una descripción.'));
add(table('historial', 'Historial de cambios del repositorio',
  ['Fecha', 'Commit', 'Cambio'],
  [
    ['01/06/2026', 'bcb1d68 a afce804', 'Versión inicial de Eventpro (Palavecino).'],
    ['06/10/2026', '693389a', 'Correcciones: arranque en un clon nuevo, error del panel de control, código QR seguro, pruebas y Docker.'],
    ['06/10/2026', 'e895929', 'Creación de eventos con imagen y fechas que se mostraban un día antes.'],
    ['06/10/2026', 'c765abd', 'Botones para activar y finalizar eventos.'],
    ['08/10/2026', 'c0c660c, 23dad73', 'README del proyecto y remitente de los correos.'],
    ['08/10/2026', '461f74b', 'Visualización, descarga e impresión del código QR de cada invitado.'],
    ['09/10/2026', '0168d7d', 'Check-in: validación del evento, aviso de reingresos y mensajes de error reales.'],
    ['15/10/2026', 'af938c1', 'Corrección de la tasa de asistencia y tarjetas del panel con acceso directo.'],
    ['15/10/2026', '82e06ad', 'Módulo de gastos y presupuesto por evento.'],
    ['15/10/2026', '9fc27fb', 'Primera versión de este informe.'],
    ['15/10/2026', '3eea306', 'Check-in escaneando el código QR con la cámara o desde una foto.'],
    ['15/10/2026', 'bd1b912, 1b85fbc', 'Lectura de fotos de códigos QR tomadas de una pantalla, de lejos y de cerca.'],
    ['15/10/2026', 'e0cc4c7', 'Acceso desde el celular: HTTPS, *proxy* hacia la API y diseño adaptable.'],
    ['15/10/2026', 'eb7e7af, 8553de1', 'Página de verificación de correo, estado en el perfil y enlaces legibles en la consola.'],
    ['15/10/2026', '603e814, 2495cbc', 'README actualizado con las funciones nuevas.'],
    ['15/10/2026', 'aa56738', 'Segunda versión de este informe.'],
    ['20/10/2026', 'd64208a', 'Invitaciones por correo con QR, página pública del invitado, límites de intentos y zona horaria de Argentina.'],
    ['20/10/2026', '21055cd, 3410abd', 'Reportes de invitados, asistencia y gastos (primero en CSV, luego en Excel).'],
    ['20/10/2026', 'af90b63', 'Colaboradores por evento para el check-in en la puerta.'],
  ], [15, 22, 63], 'Las uniones de `etapa-2` a `main` (4ba0e06, dcd1906, b7b4c3c, 3c57774, 713114d y 82d377f) no se listan porque no agregan cambios propios.'));

add(H2(tocEntry('Decisiones de diseño', 2)));
add(P('Durante el desarrollo se tomaron las siguientes decisiones, cada una justificada por un problema concreto:'));
add(bullet('**El código QR lo genera el servidor.** Si el código se calcula a partir de datos conocidos (como el número de invitación), cualquiera puede generar el de otra persona. Un valor aleatorio guardado en la base de datos solo lo conoce quien lo recibió (OWASP Foundation, 2021).'));
add(bullet('**El check-in valida el evento.** El pedido incluye el evento en el que se está registrando el ingreso, y el servidor rechaza los códigos de otros eventos.'));
add(bullet('**Registrar dos veces el mismo código no es un error, pero se avisa.** Si se escanea dos veces el mismo QR, la API no duplica el ingreso; responde que la persona ya había ingresado y a qué hora. Así la operación es segura de repetir y el organizador sabe qué pasó.'));
add(bullet('**El escáner queda abierto entre lecturas.** En la puerta de un evento se registran muchas personas seguidas; cerrar y abrir la cámara para cada una haría el ingreso más lento.'));
add(bullet('**Los códigos se leen en el navegador.** Las imágenes de la cámara no viajan al servidor: se procesan en el teléfono y solo se envía el código, lo que es más rápido y no expone las fotos.'));
add(bullet('**HTTPS también en desarrollo.** Es la única forma de que el navegador del celular permita usar la cámara cuando la página se abre con la IP de la computadora.'));
add(bullet('**Una sola dirección para la aplicación y la API.** El servidor de Vite reenvía las rutas `/api` y `/media` al backend, por lo que la interfaz funciona igual desde la computadora o desde el celular sin configurar direcciones.'));
add(bullet('**Los estados del evento forman una secuencia.** Solo se permiten las transiciones borrador → activo → finalizado; el check-in exige un evento activo.'));
add(bullet('**El presupuesto es opcional.** Muchos eventos no lo tienen definido; en ese caso la página de gastos muestra solo el total.'));
add(bullet('**Las invitaciones se envían con un botón.** Enviarlas solas al cargar a cada invitado haría que un error en un CSV llegara a la casilla de muchas personas.'));
add(bullet('**El invitado responde sin cuenta y con un toque.** El enlace secreto alcanza para identificarlo, y abrirlo no responde por él: hay que tocar el botón.'));
add(bullet('**Colaboradores por evento, no un rol global.** Quien ayuda en la puerta de un evento puede ser organizador de otros; asignarlo a cada evento limita su acceso a ese evento y a la tarea de la puerta.'));
add(bullet('**Reportes en Excel y no en CSV.** Un CSV es texto plano: no guarda el ancho de las columnas ni el formato de moneda; un `.xlsx` sí, y sigue siendo un archivo que se abre en Excel, LibreOffice o Google Sheets.'));
add(bullet('**Los mensajes de error de la API tienen un formato único** (`{"detail": "..."}`), para que la interfaz siempre pueda mostrar el motivo exacto.'));

// =====================================================================
// 5. Pruebas y correccion de errores
// =====================================================================
add(H1(tocEntry('Pruebas y corrección de errores', 1)));
add(P('Los errores se encontraron de tres maneras: al ejecutar el proyecto desde cero, al revisar el código y en las pruebas manuales del grupo. La ' + T('errores') + ' los resume; a continuación se detallan los más relevantes con su causa, su solución y la evidencia de que quedaron resueltos.'));
add(table('errores', 'Errores encontrados y corregidos',
  ['N.º', 'Problema', 'Causa', 'Solución'],
  [
    ['1', 'El backend no arrancaba en un clon nuevo, ni con Docker.', 'El registro de errores escribía en una carpeta `logs/` que no estaba en el repositorio.', 'La carpeta se crea al iniciar.'],
    ['2', 'El panel de control respondía con error 500 apenas el usuario tenía un evento.', 'El gráfico por mes usaba fechas como claves del JSON, que no se pueden convertir.', 'Claves como texto «AAAA-MM».'],
    ['3', 'El código QR se podía adivinar.', 'Era el hash de un texto fijo más el número de invitación.', 'Código aleatorio generado por el servidor y migración de los existentes.'],
    ['4', 'El repositorio no tenía `.gitignore` ni `.dockerignore`.', 'Docker copiaba el `node_modules` de Windows dentro de la imagen de Linux.', 'Se agregaron ambos archivos.'],
    ['5', 'No se podían crear eventos con imagen.', 'El cliente forzaba JSON y convertía la imagen en `{}`.', 'Se deja que el cliente elija el formato (multipart).'],
    ['6', 'Las fechas se mostraban un día antes.', '«2026-12-01» se interpretaba en UTC y en Argentina quedaba en el día anterior.', 'Conversión a fecha local.'],
    ['7', 'No había forma de activar un evento.', 'La función existía en la API, pero ninguna pantalla la usaba.', 'Botones «Activar» y «Finalizar evento».'],
    ['8', 'El código QR no se mostraba en ninguna pantalla.', 'Faltaba la interfaz.', 'Ventana con el QR, copia, descarga e impresión.'],
    ['9', 'El check-in aceptaba códigos de otro evento, repetía «exitoso» y ocultaba los errores.', 'Faltaban validaciones y el formato de los errores no coincidía con el de la interfaz.', 'Validación del evento, aviso de reingreso y errores uniformes.'],
    ['10', 'La tasa de asistencia llegó a 133,3 %.', 'Se dividía por los confirmados, y se podía quitar la confirmación a quien ya había ingresado.', 'Nueva fórmula, bloqueo del cambio y corrección de los datos.'],
    ['11', 'Las fotos de un QR tomadas de la pantalla no se leían.', 'El código ocupaba poco de la foto o aparecía la grilla de píxeles del monitor.', 'Búsqueda en varios tamaños y recortes, reducción por mitades y umbral automático.'],
    ['12', 'En el celular el menú tapaba media pantalla y las tablas ensanchaban la página.', 'El diseño no tenía en cuenta pantallas chicas.', 'Menú desplegable y tablas con desplazamiento propio.'],
    ['13', 'El enlace de verificación del correo llevaba a una página inexistente.', 'El backend generaba el enlace, pero el frontend no tenía esa página.', 'Página de verificación y estado en el perfil.'],
    ['14', 'Los enlaces de los correos aparecían cortados en la consola.', 'Los correos se imprimen con codificación *quoted-printable*.', 'Se imprime además el enlace limpio.'],
    ['15', 'Los límites de intentos por minuto (inicio de sesión, registro) no se aplicaban.', 'La clase de DRF usada toma el límite de la vista, y las vistas no lo definían.', 'Clase propia con el límite fijo y pruebas que lo verifican.'],
    ['16', 'Fechas y horas con la zona horaria de Chile.', 'Configuración heredada del proyecto original.', 'Zona horaria e idioma de Argentina.'],
    ['17', 'En el reporte, los montos sin formato y las fechas como `####`.', 'El formato CSV no guarda ancho de columnas ni formatos.', 'Reportes en Excel (.xlsx).'],
    ['18', 'Con la columna de invitación, la tabla de invitados no entraba en la pantalla.', 'Una columna más en una tabla ya ancha.', 'Email y teléfono en una sola columna; la fecha en dos renglones.'],
  ], [7, 33, 34, 26]));

add(H2(tocEntry('Código QR predecible', 2)));
add(P('En la versión inicial, el código de cada invitación se calculaba como el hash SHA-256 del texto `event-checkin-` seguido del número de invitación, y ese mismo cálculo se repetía en el navegador para hacer el check-in. Como los números de invitación son correlativos, cualquier persona que conociera la fórmula podía generar el código de otro invitado y registrar su ingreso. Es un caso de referencia directa a objetos insegura, una de las vulnerabilidades más comunes en aplicaciones web (OWASP Foundation, 2021).'));
add(P('Se reemplazó por un valor aleatorio de 128 bits generado en el servidor con el módulo `secrets` de Python. La interfaz ya no calcula nada: usa el código que devuelve la API. Una migración reemplazó los códigos existentes y actualizó los registros de asistencia correspondientes. Las pruebas `test_code_is_not_derived_from_id` y `test_each_invitation_gets_unique_code` verifican el nuevo comportamiento.'));

add(H2(tocEntry('Creación de eventos con imagen', 2)));
add(P('Al probar la aplicación, el grupo no pudo crear un evento al que le había agregado una imagen. Al reproducir el pedido se encontró la causa: el cliente HTTP tenía configurado `Content-Type: application/json` para todos los pedidos. Al enviar un formulario con un archivo, la librería Axios veía ese encabezado y convertía el formulario a JSON; el archivo quedaba como un objeto vacío y el servidor respondía «La información enviada no era un archivo». Se quitó el encabezado fijo para que Axios elija el formato correcto en cada caso. Además, se agregó la imagen a la tarjeta y al detalle del evento, ya que antes se guardaba pero no se mostraba.'));

add(H2(tocEntry('Validaciones del check-in', 2)));
add(P('Durante las pruebas del check-in, el grupo pegó un código y la aplicación registró el ingreso de otro invitado mostrando solo «Check-in exitoso». Al analizarlo se encontraron cuatro problemas relacionados:'));
add(numbered('El servidor no verificaba que el código perteneciera al evento en el que se estaba haciendo el check-in, de modo que un código de otro evento registraba igualmente a esa persona.', 'n1'));
add(numbered('Repetir un código ya usado volvía a mostrar «Check-in exitoso», sin indicar a quién se había registrado.', 'n1'));
add(numbered('Los errores de la API llegaban como una lista y la interfaz los buscaba en otro campo, por lo que siempre mostraba un mensaje genérico.', 'n1'));
add(numbered('Se podía pasar a «pendiente» a un invitado que ya había ingresado, lo que dejaba datos contradictorios.', 'n1'));
add(P('La ' + F('flujoCheckin') + ' muestra el flujo de validación resultante. Las Figuras ' + nF('repetido') + ' a ' + nF('noConfirmado') + ' muestran las respuestas de la interfaz ante un código repetido, un código de otro evento y un invitado sin confirmar.'));
add(figure('flujoCheckin', 'checkin.png', 'Validaciones del registro de ingreso (check-in)', null, 460, 540));
add(figure('repetido', '10_checkin_repetido.png', 'Respuesta ante un código que ya se había usado', null, 540, 300));
add(figure('otroEvento', '11_checkin_otro_evento.png', 'Respuesta ante un código que pertenece a otro evento', null, 540, 300));
add(figure('noConfirmado', '12_checkin_no_confirmado.png', 'Respuesta ante un invitado que todavía no confirmó', null, 540, 300));

add(H2(tocEntry('Tasa de asistencia superior al 100 %', 2)));
add(P('En el panel de control, el grupo observó una tasa de asistencia de 133,3 %. La tasa se calculaba como ingresos divididos por invitados confirmados. En las pruebas anteriores al arreglo del check-in, algunos invitados habían ingresado y después se los había pasado a «pendiente»: su ingreso se contaba en el numerador pero no en el denominador. Se cambió la fórmula para dividir por los invitados esperados (confirmados o que ya ingresaron), se limitó el resultado al 100 % y una migración marcó como confirmados a quienes ya habían ingresado. Las pruebas `test_attendance_rate_never_exceeds_100` y `test_attendance_rate_partial` reproducen el caso.'));

add(H2(tocEntry('Validaciones del módulo de gastos', 2)));
add(P('El formulario de gastos valida los datos antes de enviarlos y el servidor vuelve a validarlos, ya que la validación del navegador puede omitirse. La ' + F('gastosValidacion') + ' muestra los mensajes ante un concepto vacío y un monto negativo.'));
add(figure('gastosValidacion', 'gastos_validacion.png', 'Validaciones del formulario de gastos'));

add(H2(tocEntry('Lectura de códigos QR fotografiados de una pantalla', 2)));
add(P('Para probar el escáner, el grupo mostró el código QR de un invitado en la pantalla de la computadora y lo leyó con el celular. El escaneo en vivo y la carga del código en texto funcionaron, pero la lectura desde una foto respondió «No se encontró un código QR en la foto». Más adelante, una foto tomada de lejos sí se leyó, pero una tomada muy de cerca volvió a fallar. Se analizaron las fotos y se encontraron dos causas:'));
add(bullet('**Código chico dentro de la foto.** La primera versión reducía la foto completa a 1000 píxeles antes de buscar el código. En una foto de 12 megapíxeles tomada a cierta distancia, el QR quedaba reducido a unos pocos píxeles por módulo y la librería no lo encontraba.'));
add(bullet('**Grilla de píxeles del monitor.** En una foto tomada de cerca, la cámara registra los píxeles individuales de la pantalla (' + F('fotoPantalla') + ', b). Al reducir la imagen en un solo paso, esa grilla no desaparece: genera un patrón de interferencia (*moiré*) que deforma los bordes de los módulos del código.'));
add(P('La solución fue probar varias estrategias en orden, de la más rápida a la más costosa, y devolver la primera lectura: primero el detector de códigos nativo del navegador, si existe; después la foto completa en cuatro tamaños; luego recortes centrados, porque el código suele estar donde se apuntó la cámara, y por último una grilla de recortes superpuestos. Cada reducción se hace de a mitades, lo que promedia los píxeles y borra la grilla del monitor. Si aun así no se encuentra el código, la imagen se convierte a blanco y negro con un umbral calculado automáticamente según el histograma de la foto (Otsu, 1979), como se ve en la ' + F('fotoPantalla') + ', c. Para que el teléfono no se trabe con una foto sin código, la búsqueda tiene un límite de cuatro segundos.'));
add(figure('fotoPantalla', 'qr_foto_pantalla.png', 'Foto de un código QR tomada de cerca a la pantalla de la computadora', '(a) Foto original tomada con el celular por el grupo; el recuadro rojo marca la zona ampliada. (b) Esa zona a tamaño real: se ven los píxeles del monitor. (c) La misma foto reducida de a mitades y convertida a blanco y negro, tal como la analiza la aplicación.', 600, 260));
add(P('Para medir el efecto de cada cambio se armó un conjunto de ocho fotos de prueba con distintas dificultades —código lejano, *moiré*, poca luz e inclinación—, al que se sumó la foto real del grupo. La ' + T('fotos') + ' muestra los resultados de cada versión.'));
add(table('fotos', 'Lectura de fotos de códigos QR según la versión de la aplicación',
  ['Versión', 'Fotos de prueba leídas', 'Foto real de cerca', 'Cambio principal'],
  [
    ['3eea306', '5 de 8', 'No leída', 'Primera versión: foto completa reducida a 1000 píxeles.'],
    ['bd1b912', '8 de 8', 'No leída', 'Varios tamaños, recortes centrados y grilla de recortes.'],
    ['1b85fbc', '8 de 8', 'Leída en 0,6 s', 'Tamaños más chicos, reducción de a mitades y umbral de Otsu.'],
  ], [15, 20, 20, 45], 'Tiempos medidos en Chromium en la computadora de desarrollo; las fotos de prueba se leen en menos de dos segundos.'));

add(H2(tocEntry('Acceso a la cámara desde el celular', 2)));
add(P('Al abrir la aplicación desde el celular con la IP de la computadora, el navegador no permitía usar la cámara: los navegadores solo la habilitan en contextos seguros (MDN Web Docs, s. f.), y una dirección `http://` que no es `localhost` no lo es. Se configuró HTTPS en el servidor de desarrollo con un certificado autofirmado y se agregó un *proxy* en Vite para que la interfaz llegue a la API por la misma dirección segura. Antes de probarlo en el teléfono, se simuló un celular en Playwright —con la pantalla de un Pixel 7 y una cámara falsa que mostraba un código QR— entrando por la IP de la computadora, y se verificó el registro del ingreso con el escáner.'));
add(P('En la prueba real, el escáner mostró el mensaje «No se dio permiso para usar la cámara». La causa no estaba en la aplicación: el navegador del celular (Brave) tenía bloqueado el permiso de cámara para esa dirección. Una vez habilitado desde la configuración del sitio, el escaneo funcionó. Este caso muestra la utilidad de que el escáner explique el motivo de cada error en lugar de un mensaje genérico, y de ofrecer la lectura desde una foto como alternativa, ya que no requiere ese permiso.'));

add(H2(tocEntry('Verificación del correo electrónico', 2)));
add(P('El backend ya generaba un enlace de verificación al registrarse, pero apuntaba a una página `/verify-email` que no existía en la interfaz, por lo que la verificación no se podía completar. Se creó esa página y se agregó el estado de verificación al perfil (' + F('verificacion') + '). La página envía el código una sola vez aunque React la monte dos veces en modo de desarrollo, porque el código se borra al usarse y un segundo envío daría un error falso.'));
add(P('Al probarlo apareció un problema adicional: en desarrollo, los correos se imprimen en la consola con la codificación *quoted-printable*, que corta las líneas largas y reemplaza el signo `=` por `=3D`. El enlace era casi imposible de copiar. Ahora, cuando los correos se muestran en la consola, el backend imprime además el enlace limpio en una línea aparte, tanto para la verificación como para la recuperación de contraseña.'));

add(H2(tocEntry('Límites de intentos que no se aplicaban', 2)));
add(P('El proyecto original limitaba los intentos de inicio de sesión a 10 por minuto, y los de registro, recuperación de contraseña y reenvío de verificación a 3, para dificultar que alguien pruebe contraseñas de forma automática. Al agregar el mismo límite a la página pública del invitado, una prueba automatizada mostró que no se aplicaba. Al revisarlo se encontró que tampoco funcionaba en el inicio de sesión: 13 intentos fallidos seguidos no recibían ningún bloqueo.'));
add(P('La causa era la clase `ScopedRateThrottle` de Django REST Framework: toma el nombre del límite de la vista (`throttle_scope`) e ignora el que define la clase, y las vistas del proyecto no lo definían, por lo que el límite nunca se activaba. Se reemplazó por una clase propia con el límite fijo, que cuenta los intentos por usuario o, sin sesión, por dirección IP. Ahora el undécimo intento de inicio de sesión dentro de un minuto se rechaza, y dos pruebas nuevas lo verifican. El caso muestra que una protección configurada no es lo mismo que una protección comprobada.'));

add(H2(tocEntry('Del CSV al Excel', 2)));
add(P('La primera versión de los reportes generaba archivos CSV preparados para Excel en español: separador `;`, marca de UTF-8 para los acentos y coma decimal. Al probarlos, el grupo pidió dos cambios: el monto con formato de moneda y las fechas, que se veían como `####`. Las dos cosas tenían la misma causa: un CSV es texto plano y no puede guardar el ancho de una columna ni el formato de una celda.'));
add(P('Se pasó a generar archivos `.xlsx` con la librería openpyxl (openpyxl, s. f.). Al hacerlo apareció un riesgo: openpyxl guarda como fórmula cualquier texto que empiece con `=`, de modo que un concepto de gasto escrito así se ejecutaría al abrir el archivo (inyección de fórmulas; OWASP Foundation, s. f.). Esos textos se guardan explícitamente como texto, y una prueba automatizada lo verifica.'));

// =====================================================================
// 6. Problemas durante el desarrollo
// =====================================================================
add(H1(tocEntry('Problemas durante el desarrollo', 1)));
add(P('Además de los errores de la aplicación descritos en la sección anterior, durante el trabajo aparecieron problemas con las herramientas, el entorno y la forma de probar. No eran fallas del código de EventPro, pero demoraron el avance y obligaron a cambiar la manera de trabajar. La ' + T('problemas') + ' los resume.'));
add(table('problemas', 'Problemas del entorno y de las herramientas durante el desarrollo',
  ['Problema', 'Cómo se manifestó', 'Cómo se resolvió'],
  [
    ['Docker Desktop cerrado', '`docker compose up` fallaba con un error de conexión al motor de Docker.', 'Abrir Docker Desktop y esperar a que el motor termine de iniciar antes de ejecutar los comandos.'],
    ['Primeros pasos con Git y GitHub', 'Había que subir una carpeta local a un repositorio nuevo y dar acceso al asistente para publicar cambios.', 'Se subió el proyecto paso a paso con `git` y se configuraron los permisos de la cuenta de GitHub.'],
    ['Dos versiones del proyecto', 'No estaba claro sobre cuál seguir trabajando.', 'Se ejecutaron y compararon ambas antes de decidir (ver Punto de partida).'],
    ['Librerías nuevas que no aparecían en Docker', 'Después de agregar una librería al frontend, el contenedor seguía usando las dependencias anteriores.', 'Usar `docker compose up --build -V`, que descarta la carpeta de dependencias guardada.'],
    ['Datos de pruebas viejas', 'Invitados registrados antes de corregir el check-in distorsionaban las métricas (tasa de 133,3 %).', 'Migración que corrige los datos y regla que impide volver a generarlos.'],
    ['Computadora sin cámara', 'La computadora de escritorio del grupo no tiene cámara web, por lo que no se podía probar el escáner en ella.', 'Probar el escáner desde el celular, lo que llevó a configurar HTTPS y el diseño adaptable.'],
    ['Aviso de certificado', 'Al entrar por HTTPS, el navegador advierte que la conexión no es privada.', 'Es esperable con un certificado autofirmado; se acepta una vez por dispositivo.'],
    ['Permiso de cámara en Brave', 'El escáner informaba que no había permiso para usar la cámara.', 'Habilitar la cámara en la configuración del sitio del navegador.'],
    ['Probar la cámara de forma automática', 'Las pruebas en el navegador no tienen una cámara real.', 'Cámara simulada que reproduce un video generado con el código QR.'],
    ['Enlaces de correo ilegibles', 'Los enlaces de verificación aparecían cortados y con `=3D` en la consola.', 'El backend imprime además el enlace limpio.'],
    ['Imagen del QR en el correo', 'Django 6 rechazó la forma habitual de incrustar imágenes en un correo (atributo `mixed_subtype`).', 'Se usó la forma nueva que indica Django 6 (`MIMEPart` con identificador de contenido).'],
    ['Pruebas con dos usuarios', 'Los colaboradores necesitan dos cuentas usando la aplicación a la vez.', 'Prueba automatizada con un organizador en la computadora y un colaborador en un celular simulado.'],
    ['Una regla vieja de permisos', 'El proyecto original daba acceso al evento a quien figuraba como invitado con rol «colaborador».', 'Se reemplazó por la asignación de colaboradores por evento y se actualizaron sus pruebas.'],
  ], [22, 39, 39]));
add(P('De estos problemas surgieron algunas prácticas que se mantuvieron durante el resto del trabajo: escribir las instrucciones de prueba paso a paso indicando el resultado esperado, probar cada funcionalidad en el dispositivo en el que se va a usar (el celular, en el caso del escáner) y, ante un error, reproducirlo primero con los mismos datos antes de intentar corregirlo.'));

// =====================================================================
// 7. Pruebas automatizadas
// =====================================================================
add(H1(tocEntry('Pruebas automatizadas', 1)));
add(H2(tocEntry('Pruebas de la API', 2)));
add(P('El backend cuenta con pruebas automatizadas escritas con las herramientas de prueba de Django y Django REST Framework. Cada prueba crea una base de datos temporal, ejecuta un caso y verifica el resultado: por ejemplo, que un organizador no pueda ver los gastos de otro, o que un código de otro evento sea rechazado. La ' + T('pruebasApi') + ' muestra la cantidad de pruebas por módulo antes y después de este trabajo.'));
add(table('pruebasApi', 'Pruebas automatizadas por módulo',
  ['Módulo', 'Al inicio', 'Actual', 'Qué verifican las pruebas agregadas'],
  [
    ['users', '46', '48', 'Límites de intentos por minuto en el inicio de sesión y el registro.'],
    ['events', '29', '40', 'Colaboradores: alta, validaciones, qué pueden y qué no, filtro por rol y pérdida del acceso al quitarlos.'],
    ['invitations', '0', '26', 'Códigos QR aleatorios; envío de invitaciones; página pública (datos visibles, respuestas, evento finalizado, ingreso ya registrado, límite de pedidos); Excel de invitados.'],
    ['attendance', '38', '46', 'Códigos de otro evento, reingresos, formato de errores, bloqueo de cambios de RSVP y permisos de colaboradores.'],
    ['dashboard', '0', '7', 'Autenticación, panel vacío, claves por mes, conteos y tasa de asistencia.'],
    ['expenses', '0', '27', 'Alta, validaciones, permisos, edición, borrado, filtros, resumen, presupuesto y Excel de gastos (formatos, fórmulas, texto con «=»).'],
    ['**Total**', '**113**', '**194**', ''],
  ], [17, 12, 12, 59], 'Seis pruebas del proyecto original se reescribieron porque verificaban la regla anterior de colaboradores (acceso por figurar como invitado).'));
add(P('Las pruebas se ejecutan con un solo comando. El resultado actual es el siguiente:'));
add(code([
  '> docker compose exec backend python manage.py test',
  'Found 194 test(s).',
  "Creating test database for alias 'default'...",
  'System check identified no issues (0 silenced).',
  '..........................................................................',
  '..........................................................................',
  '..............................................',
  '----------------------------------------------------------------------',
  'Ran 194 tests in 333.793s',
  '',
  'OK',
  "Destroying test database for alias 'default'...",
]));

add(H2(tocEntry('Pruebas en el navegador', 2)));
add(P('Además de las pruebas de la API, cada funcionalidad se probó de punta a punta en un navegador real controlado con Playwright (Microsoft, s. f.). Estas pruebas reproducen lo que haría una persona: completar formularios, tocar botones y leer los mensajes en pantalla. Entre los escenarios probados se encuentran:'));
add(bullet('Registro, inicio de sesión y creación de un evento con imagen y presupuesto.'));
add(bullet('Activación de un evento, carga de invitados y confirmación de asistencia.'));
add(bullet('Lectura del código QR generado y comparación con el código en texto.'));
add(bullet('Check-in con un código válido, uno repetido, uno de otro evento, uno inventado y uno de un invitado sin confirmar.'));
add(bullet('Escaneo con una cámara simulada: el navegador recibe como imagen de la cámara un video generado con el código QR de un invitado, y se verifica que el ingreso quede registrado y que el escáner siga abierto para el siguiente.'));
add(bullet('Lectura desde foto con el conjunto de ocho fotos de prueba y la foto real del grupo (' + T('fotos') + ').'));
add(bullet('Uso desde el celular: un Pixel 7 simulado entra por la IP de la computadora con HTTPS, recorre todas las pantallas sin que la página se ensanche y registra un ingreso con el escáner.'));
add(bullet('Menú desplegable: se abre con ☰, se cierra al elegir una sección o al tocar fuera, y no aparece en la computadora.'));
add(bullet('Verificación de correo: enlace válido, enlace reemplazado, enlace ya usado, página sin código y reenvío desde el perfil.'));
add(bullet('Alta, edición y borrado de gastos, con y sin presupuesto, incluido el caso en que se supera el presupuesto.'));
add(bullet('Invitaciones: envío a todos, reenvío a uno, lectura del enlace desde la consola, respuesta del invitado en un celular simulado (incluso con una sesión vencida guardada en el navegador), y luego el check-in con ese QR.'));
add(bullet('Reportes: descarga de los tres Excel desde la computadora y desde el celular, y revisión de su contenido.'));
add(bullet('Colaboradores con dos usuarios: el organizador agrega a otra persona desde la computadora; esa persona, desde un celular con cámara simulada, escanea un QR en la puerta; luego el organizador la quita y se verifica que perdió el acceso.'));
add(P('En todos los escenarios se verificó, además del resultado, que no hubiera errores en la consola del navegador ni respuestas de error inesperadas de la API.'));

add(H2(tocEntry('Pruebas manuales del grupo', 2)));
add(P('Cada cambio fue probado también por el grupo, con la aplicación ejecutándose en Docker, siguiendo pasos definidos y comparando el resultado obtenido con el esperado. Las Tablas ' + nT('manualCheckin') + ' a ' + nT('manualInvitaciones') + ' muestran, como ejemplo, la prueba del check-in en la computadora, la del uso desde el celular y la de las invitaciones por correo.'));
add(table('manualCheckin', 'Prueba manual del check-in',
  ['Paso', 'Acción', 'Resultado esperado', 'Resultado'],
  [
    ['1', 'Crear un evento, activarlo y agregar un invitado confirmado y otro pendiente.', 'El confirmado aparece en «Por ingresar»; el pendiente, en «Sin confirmar».', 'Correcto'],
    ['2', 'Pegar el código del invitado confirmado.', '«Ingreso registrado: <nombre>» y pasa a «Ya ingresaron».', 'Correcto'],
    ['3', 'Pegar el mismo código otra vez.', 'Aviso «ya había ingresado», sin duplicar.', 'Correcto'],
    ['4', 'Pegar el código de un invitado de otro evento.', 'Rechazo indicando de quién es y de qué evento.', 'Correcto'],
    ['5', 'Escribir un código inventado.', '«Código QR inválido».', 'Correcto'],
    ['6', 'Pegar el código del invitado pendiente.', 'Rechazo: todavía no confirmó asistencia.', 'Correcto'],
    ['7', 'Pasar a «pendiente» a quien ya ingresó.', 'Aviso y el estado no cambia.', 'Correcto'],
    ['8', 'Confirmar al pendiente y registrarlo con el botón.', 'Ingreso registrado; contador «2 de 2».', 'Correcto'],
  ], [7, 37, 40, 16]));
add(table('manualCelular', 'Prueba manual del escáner y del uso desde el celular',
  ['Paso', 'Acción', 'Resultado esperado', 'Resultado'],
  [
    ['1', 'En el celular, abrir `https://<IP de la computadora>:5173` y aceptar el aviso del certificado.', 'Se abre la pantalla de inicio de sesión.', 'Correcto'],
    ['2', 'Escanear con la cámara el QR de un invitado mostrado en la pantalla de la computadora.', 'Ingreso registrado y el escáner sigue abierto.', 'Correcto, tras habilitar el permiso de cámara en Brave'],
    ['3', 'Leer el código desde una foto tomada de lejos.', 'Ingreso registrado.', 'Correcto'],
    ['4', 'Leer el código desde una foto tomada muy de cerca.', 'Ingreso registrado.', 'Falló; corregido en 1b85fbc y verificado con la misma foto'],
    ['5', 'Navegar con el menú ☰ por todas las pantallas.', 'El contenido se ve completo y sin desplazamiento lateral.', 'Correcto'],
  ], [7, 37, 30, 26]));
add(table('manualInvitaciones', 'Prueba manual de las invitaciones por correo',
  ['Paso', 'Acción', 'Resultado esperado', 'Resultado'],
  [
    ['1', 'Activar un evento con invitados y tocar «Enviar invitaciones».', '«Se enviaron N invitaciones»; la columna Invitación pasa a «Enviada».', 'Correcto'],
    ['2', 'Abrir en el celular el enlace de un invitado (copiado de la consola) y confirmar.', 'Aparece su código QR.', 'Correcto'],
    ['3', 'Con otro invitado, tocar «No voy a poder ir».', 'Queda como rechazado, sin QR.', 'Correcto'],
    ['4', 'Recargar Invitados en la computadora.', 'Las dos respuestas, con «por el invitado».', 'Correcto'],
    ['5', 'Escanear en el check-in el QR del que confirmó y volver a abrir su enlace.', 'Ingreso registrado; la página dice «Ya ingresaste al evento».', 'Correcto'],
  ], [7, 40, 37, 16]));

// =====================================================================
// 8. Ejecucion con Docker
// =====================================================================
add(H1(tocEntry('Ejecución con Docker', 1)));
add(P('Docker permite empaquetar cada parte de la aplicación junto con todo lo que necesita para funcionar —el intérprete de Python o Node.js, las librerías y el código— en un contenedor que se ejecuta igual en cualquier computadora. El archivo `docker-compose.yml` define dos servicios: `backend`, que al iniciar aplica las migraciones de la base de datos y levanta la API en el puerto 8000, y `frontend`, que levanta la interfaz por HTTPS en el puerto 5173 y reenvía los pedidos de la API al backend. Para ejecutar el proyecto solo hace falta tener Docker instalado:'));
add(code([
  'git clone https://github.com/alem123q/eventpro.git',
  'cd eventpro',
  'docker compose up --build',
]));
add(P('Después de cada actualización del código conviene usar `--build`, que vuelve a armar los contenedores si cambiaron las librerías del backend. Cuando se agregan librerías nuevas al frontend, hay que agregar además la opción `-V` (`docker compose up --build -V`), porque Docker conserva la carpeta de dependencias anterior entre reinicios. Para acceder al panel de administración de Django se crea un usuario administrador con `docker compose exec backend python manage.py createsuperuser`. La ' + T('servicios') + ' resume las direcciones disponibles.'));
add(table('servicios', 'Servicios disponibles al ejecutar el proyecto',
  ['Servicio', 'Dirección'],
  [
    ['Aplicación web (en la computadora)', '`https://localhost:5173`'],
    ['Aplicación web (desde el celular, en la misma red WiFi)', '`https://<IP de la computadora>:5173`'],
    ['API', '`http://localhost:8000/api/`'],
    ['Panel de administración', '`http://localhost:8000/admin/`'],
  ], [50, 50]));
add(P('La IP de la computadora se obtiene en Windows con el comando `ipconfig` (dato «Dirección IPv4»). La primera vez que se abre la aplicación en cada dispositivo, el navegador advierte que el certificado no es de confianza; hay que aceptar el aviso para continuar. Si el celular no logra conectarse, puede ser necesario permitir el acceso en el Firewall de Windows para redes privadas. En desarrollo los correos no se envían: se muestran en la consola del backend (`docker compose logs backend`), con los enlaces de verificación, de recuperación de contraseña y de las invitaciones en una línea aparte, listos para copiar.'));
add(P('Esta configuración está pensada para el desarrollo: usa los servidores de desarrollo de Django y Vite, que recargan los cambios automáticamente, y un certificado autofirmado. Para publicar la aplicación en internet habría que reemplazarlos por servidores de producción, un certificado emitido por una autoridad reconocida y la configuración sin modo de depuración, como se describe en la sección Funciones a futuro.'));

// =====================================================================
// 9. Conclusiones
// =====================================================================
add(H1(tocEntry('Conclusiones', 1)));
add(P('Se desarrolló una aplicación web que cubre el ciclo completo de un evento: creación, invitados, invitaciones por correo que el invitado responde sin cuenta, control de ingreso con códigos QR escaneados desde el celular —también por colaboradores—, gastos con presupuesto, reportes en Excel y un panel con métricas. La aplicación se ejecuta con un solo comando gracias a Docker, se puede usar desde la computadora o desde el celular y cuenta con 194 pruebas automatizadas, todas aprobadas.'));
add(P('Elegir como base la versión más completa, en lugar de la más vistosa, permitió concentrar el esfuerzo en corregir y ampliar algo que ya funcionaba. Las pruebas manuales del grupo resultaron decisivas: varios de los errores más importantes —los del check-in, la tasa de asistencia de 133,3 % o las fotos de la pantalla que no se leían— no se veían en las pruebas automatizadas y aparecieron al usar la aplicación como lo haría un organizador real. Probar en el dispositivo real también mostró que algunos problemas no están en el código sino en el entorno, como los permisos del navegador o la necesidad de HTTPS para usar la cámara. Y una prueba automatizada nueva reveló que los límites de intentos del proyecto original nunca habían funcionado: una protección configurada no es lo mismo que una protección comprobada.'));
add(P('Trabajar con dos ramas —una de trabajo y una estable que solo se actualiza después de probar— dio la tranquilidad de poder hacer cambios grandes, como el acceso desde el celular, sabiendo que siempre había una versión funcionando a la que volver.'));

// =====================================================================
// 10. Funciones a futuro
// =====================================================================
add(H1(tocEntry('Funciones a futuro', 1)));
add(P('La ' + T('futuro') + ' reúne las funciones y mejoras que quedaron pendientes. Las de prioridad alta son necesarias para usar la aplicación en un evento real; las demás amplían lo que ofrece. Varias de las que figuraban en la versión anterior de este informe —el envío del QR por correo, la confirmación por parte del invitado, los colaboradores y los reportes— ya se implementaron.'));
add(table('futuro', 'Funciones y mejoras propuestas',
  ['Prioridad', 'Función', 'Descripción'],
  [
    ['Alta', 'Publicación en internet', 'Servidores de producción (por ejemplo, Gunicorn y Nginx), certificado HTTPS de una autoridad reconocida, modo de depuración desactivado y datos sensibles en variables de entorno.'],
    ['Alta', 'Envío real de correos', 'Configurar un servicio de correo para que lleguen las invitaciones y los enlaces de verificación y de recuperación de contraseña.'],
    ['Alta', 'Base de datos de producción', 'Reemplazar SQLite por PostgreSQL, más adecuada para varios usuarios simultáneos, y programar copias de seguridad.'],
    ['Media', 'Página principal con lugares populares', 'Portada pública con los lugares para eventos más populares, con precio aproximado, imágenes, información de contacto y otros datos obtenidos de sus páginas oficiales.'],
    ['Media', 'Carrusel de lugares destacados', 'Carrusel al principio de la página principal con lugares que pagan para aparecer allí y recibir más visibilidad.'],
    ['Media', 'Eventos destacados', 'Sección de la página principal con eventos destacados de los organizadores de EventPro y eventos externos.'],
    ['Media', 'Lugares en alquiler con reservas', 'Que los dueños de salones, quintas o estadios publiquen su lugar (fotos, contacto, reseñas) y reciban solicitudes de reserva por día, que aceptan o rechazan; al aceptar, la fecha y los datos del evento pasan al calendario del dueño y el día figura como ocupado.'],
    ['Media', 'Eliminar eventos', 'Un botón para eliminar un evento desde su detalle; hoy solo se puede desde la API.'],
    ['Baja', 'Check-in sin conexión', 'Instalar la aplicación en el celular (PWA) y guardar los ingresos sin internet para sincronizarlos después.'],
    ['Baja', 'Recordatorios', 'Avisos automáticos a los invitados unos días antes del evento.'],
    ['Baja', 'Foto de perfil', 'Permitir que cada usuario cargue una imagen de perfil.'],
    ['Baja', 'Reportes en PDF', 'Una versión en PDF de los reportes, lista para imprimir o enviar.'],
  ], [14, 26, 60]));
add(P('Para la información de lugares obtenida de sus páginas oficiales habrá que revisar los términos de uso de cada sitio y, cuando sea posible, usar los datos que los propios lugares publiquen o autoricen, indicando la fuente y la fecha de actualización.'));

// =====================================================================
// Referencias
// =====================================================================
const refs = [
  'Anthropic. (2026). *Claude* (versión Opus 5.5) [Modelo de lenguaje de gran tamaño]. https://claude.ai',
  'Cozmo. (s. f.). *jsQR: A pure javascript QR code reading library* [Software]. GitHub. Recuperado el 15 de octubre de 2026, de https://github.com/cozmo/jsQR',
  'Django Software Foundation. (s. f.). *Django documentation* (versión 6.0). Recuperado el 15 de octubre de 2026, de https://docs.djangoproject.com/en/6.0/',
  'Docker Inc. (s. f.). *Docker Compose*. Recuperado el 15 de octubre de 2026, de https://docs.docker.com/compose/',
  'Encode OSS. (s. f.). *Django REST framework*. Recuperado el 15 de octubre de 2026, de https://www.django-rest-framework.org/',
  'Fielding, R. T. (2000). *Architectural styles and the design of network-based software architectures* [Tesis doctoral, University of California, Irvine]. https://ics.uci.edu/~fielding/pubs/dissertation/top.htm',
  'Jones, M., Bradley, J. y Sakimura, N. (2015). *JSON Web Token (JWT)* (RFC 7519). Internet Engineering Task Force. https://doi.org/10.17487/RFC7519',
  'MDN Web Docs. (s. f.). *MediaDevices: getUserMedia() method*. Mozilla. Recuperado el 15 de octubre de 2026, de https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia',
  'Meta Open Source. (s. f.). *React*. Recuperado el 15 de octubre de 2026, de https://react.dev/',
  'Microsoft. (s. f.). *Playwright*. Recuperado el 15 de octubre de 2026, de https://playwright.dev/',
  'openpyxl. (s. f.). *openpyxl: A Python library to read/write Excel 2010 xlsx/xlsm files*. Recuperado el 20 de octubre de 2026, de https://openpyxl.readthedocs.io/',
  'Otsu, N. (1979). A threshold selection method from gray-level histograms. *IEEE Transactions on Systems, Man, and Cybernetics, 9*(1), 62–66. https://doi.org/10.1109/TSMC.1979.4310076',
  'OWASP Foundation. (s. f.). *CSV Injection*. Recuperado el 20 de octubre de 2026, de https://owasp.org/www-community/attacks/CSV_Injection',
  'OWASP Foundation. (2021). *OWASP Top 10:2021*. https://owasp.org/Top10/',
  'Vite. (s. f.). *Vite*. Recuperado el 15 de octubre de 2026, de https://vite.dev/',
];
add(H1(tocEntry('Referencias', 1)));
refs.forEach((r) => add(new Paragraph({
  children: runs(r),
  spacing: { line: DOUBLE, lineRule: LineRuleType.AUTO },
  indent: { left: INDENT, hanging: INDENT },
})));

// =====================================================================
// Indice
// =====================================================================
const tocParas = [
  new Paragraph({ children: [new TextRun({ text: 'Índice', bold: true })], alignment: AlignmentType.CENTER, spacing: { line: DOUBLE, lineRule: LineRuleType.AUTO, after: 120 } }),
  ...TOC.map((e) => new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W, leader: 'dot' }],
    indent: { left: e.level === 1 ? 0 : 480 },
    spacing: { line: 228, lineRule: LineRuleType.AUTO, before: e.level === 1 ? 40 : 0 },
    children: [
      new TextRun({ text: e.text, bold: e.level === 1 }),
      new TextRun({ text: `\t${pageNumbers[e.text] ?? '0'}` }),
    ],
  })),
];

// =====================================================================
// Documento
// =====================================================================
const doc = new Document({
  creator: 'Francisco Alemandi, Eloy Kirov, Sebastián Palavecino',
  title: 'EventPro: aplicación web para la gestión integral de eventos',
  description: 'Informe del proyecto de la materia Programación (UNRaf)',
  styles: {
    default: { document: { run: { font: FONT, size: 24 }, paragraph: { spacing: { line: DOUBLE, lineRule: LineRuleType.AUTO } } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 24, bold: true, color: '000000' },
        paragraph: { alignment: AlignmentType.CENTER, spacing: { line: DOUBLE, lineRule: LineRuleType.AUTO, before: 0, after: 0 }, outlineLevel: 0, keepNext: true } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 24, bold: true, color: '000000' },
        paragraph: { spacing: { line: DOUBLE, lineRule: LineRuleType.AUTO, before: 0, after: 0 }, outlineLevel: 1, keepNext: true } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 24, bold: true, italics: true, color: '000000' },
        paragraph: { spacing: { line: DOUBLE, lineRule: LineRuleType.AUTO, before: 0, after: 0 }, outlineLevel: 2, keepNext: true } },
    ],
  },
  numbering: {
    config: [
      { reference: 'vinetas', levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
      ] },
      { reference: 'numeros', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'n1', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: {
      page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 720 } },
    },
    headers: {
      default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT] })] })] }),
    },
    children: [
      ...portada,
      new Paragraph({ children: [new PageBreak()] }),
      ...tocParas,
      ...body,
    ],
  }],
});

const out = path.join(__dirname, 'Informe_EventPro_Programacion.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(out, buf);
  fs.writeFileSync(path.join(__dirname, '.toc.json'), JSON.stringify(TOC));
  console.log('Generado:', out, '| figuras:', figN, '| tablas:', tabN, '| entradas de indice:', TOC.length);
});
