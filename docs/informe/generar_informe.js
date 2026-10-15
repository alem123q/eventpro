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
function pngSize(file) {
  const buf = fs.readFileSync(file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), buf };
}
function figure(file, title, note, maxW = MAX_IMG_W, maxH = MAX_IMG_H) {
  figN += 1;
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

function table(title, headers, rows, widths, note) {
  tabN += 1;
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
  center('15 de octubre de 2026'),
];

// ---------- Indice (se completa en la segunda pasada) ----------
const TOC = [];
function tocEntry(text, level) { TOC.push({ text, level }); return text; }

// =====================================================================
// 1. Introduccion
// =====================================================================
add(H1(tocEntry('Introducción', 1)));
add(P('Organizar un evento —una conferencia, un taller, una reunión de egresados— implica coordinar tareas que suelen quedar repartidas en planillas, chats y listas en papel: armar la lista de invitados, saber quién confirmó, controlar quién ingresó el día del evento y llevar la cuenta de lo que se gastó. Cuando esa información está dispersa, es difícil saber en qué estado está el evento y se cometen errores, como dejar entrar a alguien sin invitación o pasarse del presupuesto sin notarlo.'));
add(P('**EventPro** es una aplicación web que reúne todo ese ciclo en un solo lugar. Un organizador crea sus eventos, carga a los invitados, registra sus confirmaciones, les entrega un código QR único y, el día del evento, registra el ingreso de cada uno. Además, puede cargar los gastos del evento y compararlos con un presupuesto. Un panel de control resume la actividad de todos sus eventos.'));
add(H2(tocEntry('Objetivo general', 2)));
add(P('Desarrollar una aplicación web completa —interfaz, API y base de datos— que permita gestionar eventos de punta a punta, ejecutable de forma reproducible mediante contenedores Docker.'));
add(H2(tocEntry('Objetivos específicos', 2)));
add(bullet('Implementar una API REST con autenticación por tokens y permisos por rol, de modo que cada organizador acceda solo a sus propios datos.'));
add(bullet('Construir una interfaz web conectada a esa API para gestionar eventos, invitados, asistencia y gastos.'));
add(bullet('Implementar un control de ingreso mediante códigos QR únicos e imposibles de adivinar.'));
add(bullet('Incorporar un módulo de gastos con presupuesto por evento.'));
add(bullet('Verificar el funcionamiento con pruebas automatizadas, pruebas en el navegador y pruebas manuales del grupo, y documentar los errores encontrados y cómo se corrigieron.'));
add(H2(tocEntry('Alcance', 2)));
add(P('La aplicación está pensada para que cada organizador administre sus propios eventos. Quedan fuera del alcance de esta versión los pagos en línea, el envío real de correos electrónicos (en desarrollo los correos se muestran en la consola del servidor) y la publicación de la aplicación en internet, que se plantea como trabajo futuro.'));

// =====================================================================
// 2. Tecnologias y arquitectura
// =====================================================================
add(H1(tocEntry('Tecnologías y arquitectura', 1)));
add(P('EventPro sigue una arquitectura cliente-servidor. El *frontend* es una aplicación de página única (SPA) que se ejecuta en el navegador; el *backend* expone una API REST que recibe y devuelve datos en formato JSON (Fielding, 2000). Ambos se comunican por HTTP y se ejecutan en contenedores separados orquestados con Docker Compose (Docker Inc., s. f.). La Tabla 1 resume las tecnologías utilizadas.'));
add(table('Tecnologías utilizadas en el proyecto',
  ['Capa', 'Tecnología', 'Uso en el proyecto'],
  [
    ['Backend', 'Python 3.12, Django 6.0', 'Modelos, migraciones, panel de administración y lógica de negocio (Django Software Foundation, s. f.).'],
    ['API', 'Django REST Framework', 'Vistas, serializadores, validaciones, paginación y permisos (Encode OSS, s. f.).'],
    ['Autenticación', 'Simple JWT', 'Tokens de acceso (30 min) y de renovación (7 días) con rotación y lista negra (Jones et al., 2015).'],
    ['Base de datos', 'SQLite', 'Almacenamiento de datos en un archivo; suficiente para el alcance del proyecto.'],
    ['Frontend', 'React 19, React Router, Vite 8', 'Interfaz de usuario, navegación y servidor de desarrollo (Meta Open Source, s. f.; Vite, s. f.).'],
    ['Cliente HTTP', 'Axios', 'Envío de pedidos a la API con el token y renovación automática al vencer.'],
    ['Códigos QR', 'qrcode (npm)', 'Generación de la imagen QR de cada invitación en el navegador.'],
    ['Infraestructura', 'Docker, Docker Compose', 'Ejecución de backend y frontend en contenedores con un solo comando.'],
    ['Pruebas', 'Django TestCase, Playwright', 'Pruebas automatizadas de la API y pruebas de punta a punta en el navegador (Microsoft, s. f.).'],
  ], [16, 26, 58]));

add(H2(tocEntry('Arquitectura de la aplicación', 2)));
add(P('La Figura 1 muestra los componentes y cómo viaja un pedido. El usuario interactúa con las páginas de React; cada página usa un módulo de `services/` que envía el pedido a la API con el token JWT en el encabezado `Authorization`. En el backend, Django REST Framework valida el pedido, verifica los permisos y delega la lógica en las aplicaciones de dominio, que leen y escriben en la base de datos.'));
add(figure('arquitectura.png', 'Arquitectura de EventPro y flujo de un pedido', 'Cada recuadro de color es un contenedor de Docker. El puerto 5173 corresponde al frontend y el 8000 a la API.', 440, 480));
add(P('El backend está organizado en seis aplicaciones de Django, una por dominio: `users` (cuentas, roles y autenticación), `events` (eventos y sus estados), `invitations` (invitados y confirmaciones), `attendance` (check-in e historial), `expenses` (gastos y presupuesto) y `dashboard` (estadísticas). Cada una separa responsabilidades en archivos: `models.py` define los datos, `serializers.py` valida la entrada y da forma a la salida, `permissions.py` define quién puede hacer qué, `services.py` concentra la lógica de negocio y `views.py` solo coordina. Esta separación hizo posible agregar el módulo de gastos sin modificar los demás.'));

add(H2(tocEntry('Modelo de datos', 2)));
add(P('La Figura 2 presenta las entidades principales. Un usuario organiza muchos eventos; cada evento tiene muchos invitados y muchos gastos; cada invitación puede tener, como máximo, un registro de asistencia. En verde se marcan los campos y entidades incorporados durante este trabajo.'));
add(figure('modelo.png', 'Modelo de datos de EventPro', 'PK = clave primaria; FK = clave foránea. La relación 1 : 0..1 entre invitación y asistencia impide registrar dos veces el ingreso de una misma persona.', 560, 520));
add(P('Además de las relaciones, el modelo impone reglas que la base de datos y la API hacen cumplir:'));
add(bullet('Un mismo correo no puede estar invitado dos veces al mismo evento (restricción única sobre evento y correo).'));
add(bullet('Un evento avanza en un solo sentido: borrador → activo → finalizado. Solo un evento activo admite check-in.'));
add(bullet('El código QR de cada invitación es aleatorio y único, y no se puede modificar desde la API.'));
add(bullet('El monto de un gasto debe ser mayor a cero y el presupuesto no puede ser negativo.'));

add(H2(tocEntry('API REST', 2)));
add(P('La Tabla 2 resume los recursos de la API. Todas las rutas, excepto las de registro e inicio de sesión, requieren un token válido, y cada organizador solo puede ver y modificar los datos de sus propios eventos.'));
add(table('Recursos principales de la API',
  ['Ruta', 'Métodos', 'Descripción'],
  [
    ['`/api/auth/`', 'POST', 'Registro, inicio y cierre de sesión, renovación del token y recuperación de contraseña.'],
    ['`/api/users/profile/`', 'GET, PUT', 'Perfil del usuario autenticado.'],
    ['`/api/events/`', 'GET, POST, PUT, DELETE', 'Alta, consulta, edición y baja de eventos; filtros por estado, categoría y texto.'],
    ['`/api/events/<id>/status/`', 'PATCH', 'Cambio de estado según las transiciones permitidas.'],
    ['`/api/invitations/`', 'GET, POST, PUT, DELETE', 'Invitados por evento, incluida la carga masiva desde CSV.'],
    ['`/api/invitations/<id>/rsvp/`', 'PATCH', 'Cambio de la respuesta del invitado (pendiente, confirmado o rechazado).'],
    ['`/api/attendance/checkin/`', 'POST', 'Registro de ingreso a partir del código QR.'],
    ['`/api/attendance/`', 'GET', 'Historial de ingresos por evento.'],
    ['`/api/expenses/`', 'GET, POST, PATCH, DELETE', 'Gastos por evento.'],
    ['`/api/expenses/summary/`', 'GET', 'Total gastado, presupuesto, saldo y desglose por categoría de un evento.'],
    ['`/api/dashboard/stats/`', 'GET', 'Estadísticas generales del organizador.'],
  ], [34, 20, 46]));

// =====================================================================
// 3. Funcionalidades
// =====================================================================
add(H1(tocEntry('Funcionalidades', 1)));
add(P('En esta sección se recorren las pantallas de la aplicación. Las capturas se tomaron de la aplicación en funcionamiento con datos de ejemplo.'));

add(H2(tocEntry('Cuentas y acceso', 2)));
add(P('Para usar EventPro hay que registrarse e iniciar sesión (Figura 3). Al iniciar sesión, la API entrega un token de acceso y uno de renovación; el frontend los guarda y, cuando el token de acceso vence, pide uno nuevo sin que el usuario lo note. Las rutas internas están protegidas: si no hay sesión, redirigen al inicio de sesión. Los intentos de inicio de sesión y de registro están limitados por minuto para dificultar ataques de fuerza bruta.'));
add(figure('01_login.png', 'Pantalla de inicio de sesión'));

add(H2(tocEntry('Panel de control', 2)));
add(P('El panel de control (Figura 4) resume la actividad del organizador: cantidad de eventos por estado, invitados y confirmaciones, tasa de asistencia y total gastado. Las tarjetas de eventos funcionan como accesos directos: al tocarlas se abre la lista de eventos filtrada por ese estado. Debajo se listan los próximos eventos activos y la distribución de eventos por categoría.'));
add(figure('03_dashboard.png', 'Panel de control con datos de ejemplo', 'La tasa de asistencia se calcula como ingresos sobre invitados esperados y muestra el detalle debajo del porcentaje (por ejemplo, «2 de 6 ingresaron»).'));

add(H2(tocEntry('Eventos', 2)));
add(P('La lista de eventos (Figura 5) muestra cada evento con su imagen, estado, categoría, fecha y cantidad de invitados, y permite buscar y filtrar. Desde el formulario se cargan el título, la descripción, la fecha y hora, la ubicación, la categoría, una imagen y, de forma opcional, un presupuesto.'));
add(figure('04_eventos.png', 'Lista de eventos con filtros por categoría y estado'));
add(P('En el detalle del evento (Figura 6) se accede a la gestión de invitados, gastos y asistencia. El botón principal cambia según el estado: en un borrador dice «Activar evento» y en un evento activo, «Finalizar evento». Antes de cambiar el estado se pide confirmación, porque la transición no se puede deshacer.'));
add(figure('06_detalle_evento.png', 'Detalle de un evento activo', null, MAX_IMG_W, 620));

add(H2(tocEntry('Invitados y códigos QR', 2)));
add(P('La pantalla de invitados (Figura 7) permite agregarlos uno por uno o importarlos desde un archivo CSV, cambiar su respuesta (pendiente, confirmado o rechazado) y ver si ya ingresaron. Cada invitado tiene un botón para ver su código QR (Figura 8), que se puede copiar, descargar como imagen o imprimir para entregárselo. Si el invitado todavía no confirmó, la ventana avisa que el check-in no va a funcionar hasta que lo haga.'));
add(figure('07_invitados.png', 'Gestión de invitados de un evento'));
add(figure('08_qr_invitado.png', 'Código QR de la invitación de un invitado', 'El código tiene 32 caracteres hexadecimales generados al azar por el servidor (128 bits), por lo que no puede deducirse a partir de otros datos.'));

add(H2(tocEntry('Check-in y asistencia', 2)));
add(P('El día del evento, el organizador registra el ingreso pegando o escaneando el código del invitado, o con el botón «Registrar» junto a su nombre (Figura 9). La pantalla separa a los invitados en tres grupos —por ingresar, sin confirmar y ya ingresaron— y muestra cuántos de los confirmados llegaron. Cada intento informa a quién se registró, o el motivo exacto si no se pudo. El historial de asistencia lista los ingresos con su fecha y hora.'));
add(figure('09_checkin_exito.png', 'Pantalla de check-in después de registrar un ingreso', null, MAX_IMG_W, 640));

add(H2(tocEntry('Gastos y presupuesto', 2)));
add(P('Cada evento tiene una página de gastos (Figura 10). En la parte superior, una barra compara lo gastado con el presupuesto: se muestra en verde mientras hay margen, en amarillo a partir del 80 % y en rojo cuando el gasto supera el presupuesto (Figura 11). Debajo aparecen los totales por categoría y la tabla de gastos, que se pueden agregar, editar o eliminar. Si el evento no tiene presupuesto, la página muestra solo el total gastado.'));
add(figure('14_gastos.png', 'Gastos de un evento dentro del presupuesto', null, MAX_IMG_W, 560));
add(figure('15_gastos_excedido.png', 'Gastos de un evento que superó su presupuesto'));

add(H2(tocEntry('Calendario', 2)));
add(P('El calendario (Figura 12) muestra los eventos de cada mes en una grilla y permite navegar entre meses.'));
add(figure('16_calendario.png', 'Vista de calendario'));

// =====================================================================
// 4. Proceso de desarrollo
// =====================================================================
add(H1(tocEntry('Proceso de desarrollo', 1)));
add(H2(tocEntry('Punto de partida', 2)));
add(P('El grupo contaba con dos versiones del proyecto. La primera, *EventFlow*, tenía un backend en Django con seis módulos y una interfaz visualmente prolija, pero la interfaz era solo una maqueta: todos los datos estaban escritos en el código, el inicio de sesión no validaba credenciales y ningún botón guardaba información (Figura 13). La segunda, *Eventpro*, desarrollada por Sebastián Palavecino, tenía la interfaz conectada a la API, autenticación real y 113 pruebas automatizadas.'));
add(figure('00_maqueta_original.png', 'Primera versión (EventFlow): interfaz de maqueta con datos de ejemplo fijos', 'Las fechas (2024), los invitados y los gastos estaban escritos en el código; además, la barra lateral se superponía al contenido.'));
add(P('Antes de decidir, se clonaron y ejecutaron ambas versiones. La Tabla 3 resume la comparación.'));
add(table('Comparación de las dos versiones disponibles al inicio',
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
add(P('El trabajo siguió un ciclo iterativo corto. Cada cambio se implementó, se verificó con las pruebas automatizadas y con una prueba en el navegador, y se publicó en GitHub. Luego el grupo lo probó en su propia computadora con Docker, siguiendo pasos concretos, e informó los resultados. Cuando una prueba manual mostraba un comportamiento incorrecto, se reproducía el problema, se buscaba la causa en el código, se corregía y se agregaba una prueba automatizada para que no volviera a ocurrir.'));
add(P('El código se versionó con Git en el repositorio `github.com/alem123q/eventpro`, con tres ramas:'));
add(bullet('`main`: versión estable y probada, que sirve como punto de control.'));
add(bullet('`desarrollo`: integración de los cambios antes de pasarlos a `main`.'));
add(bullet('`etapa-2`: rama de trabajo actual, creada a partir de la versión con el módulo de gastos para poder volver a ese punto si fuera necesario.'));
add(P('Para la programación, la revisión de código y la preparación de pruebas se utilizó como asistente el modelo de lenguaje Claude (Anthropic, 2026). Las decisiones de diseño y la validación de cada cambio estuvieron a cargo del grupo, que probó cada funcionalidad antes de darla por terminada.'));

add(H2(tocEntry('Historial de cambios', 2)));
add(P('La Tabla 4 resume los cambios publicados en el repositorio. Cada fila corresponde a un *commit*, es decir, a un conjunto de cambios guardado con una descripción.'));
add(table('Historial de cambios del repositorio',
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
  ], [15, 22, 63]));

add(H2(tocEntry('Decisiones de diseño', 2)));
add(P('Durante el desarrollo se tomaron las siguientes decisiones, cada una justificada por un problema concreto:'));
add(bullet('**El código QR lo genera el servidor.** Si el código se calcula a partir de datos conocidos (como el número de invitación), cualquiera puede generar el de otra persona. Un valor aleatorio guardado en la base de datos solo lo conoce quien lo recibió (OWASP Foundation, 2021).'));
add(bullet('**El check-in valida el evento.** El pedido incluye el evento en el que se está registrando el ingreso, y el servidor rechaza los códigos de otros eventos.'));
add(bullet('**Registrar dos veces el mismo código no es un error, pero se avisa.** Si se escanea dos veces el mismo QR, la API no duplica el ingreso; responde que la persona ya había ingresado y a qué hora. Así la operación es segura de repetir y el organizador sabe qué pasó.'));
add(bullet('**Los estados del evento forman una secuencia.** Solo se permiten las transiciones borrador → activo → finalizado; el check-in exige un evento activo.'));
add(bullet('**El presupuesto es opcional.** Muchos eventos no lo tienen definido; en ese caso la página de gastos muestra solo el total.'));
add(bullet('**Los mensajes de error de la API tienen un formato único** (`{"detail": "..."}`), para que la interfaz siempre pueda mostrar el motivo exacto.'));

// =====================================================================
// 5. Pruebas y correccion de errores
// =====================================================================
add(H1(tocEntry('Pruebas y corrección de errores', 1)));
add(P('Los errores se encontraron de tres maneras: al ejecutar el proyecto desde cero, al revisar el código y en las pruebas manuales del grupo. La Tabla 5 los resume; a continuación se detallan los más relevantes con su causa, su solución y la evidencia de que quedaron resueltos.'));
add(table('Errores encontrados y corregidos',
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
add(P('La Figura 14 muestra el flujo de validación resultante. Las Figuras 15 a 17 muestran las respuestas de la interfaz ante un código repetido, un código de otro evento y un invitado sin confirmar.'));
add(figure('checkin.png', 'Validaciones del registro de ingreso (check-in)', null, 460, 540));
add(figure('10_checkin_repetido.png', 'Respuesta ante un código que ya se había usado', null, 560, 300));
add(figure('11_checkin_otro_evento.png', 'Respuesta ante un código que pertenece a otro evento', null, 560, 300));
add(figure('12_checkin_no_confirmado.png', 'Respuesta ante un invitado que todavía no confirmó', null, 560, 300));

add(H2(tocEntry('Tasa de asistencia superior al 100 %', 2)));
add(P('En el panel de control, el grupo observó una tasa de asistencia de 133,3 %. La tasa se calculaba como ingresos divididos por invitados confirmados. En las pruebas anteriores al arreglo del check-in, algunos invitados habían ingresado y después se los había pasado a «pendiente»: su ingreso se contaba en el numerador pero no en el denominador. Se cambió la fórmula para dividir por los invitados esperados (confirmados o que ya ingresaron), se limitó el resultado al 100 % y una migración marcó como confirmados a quienes ya habían ingresado. Las pruebas `test_attendance_rate_never_exceeds_100` y `test_attendance_rate_partial` reproducen el caso.'));

add(H2(tocEntry('Validaciones del módulo de gastos', 2)));
add(P('El formulario de gastos valida los datos antes de enviarlos y el servidor vuelve a validarlos, ya que la validación del navegador puede omitirse. La Figura 18 muestra los mensajes ante un concepto vacío y un monto negativo.'));
add(figure('gastos_validacion.png', 'Validaciones del formulario de gastos'));

// =====================================================================
// 6. Pruebas automatizadas
// =====================================================================
add(H1(tocEntry('Pruebas automatizadas', 1)));
add(H2(tocEntry('Pruebas de la API', 2)));
add(P('El backend cuenta con pruebas automatizadas escritas con las herramientas de prueba de Django y Django REST Framework. Cada prueba crea una base de datos temporal, ejecuta un caso y verifica el resultado: por ejemplo, que un organizador no pueda ver los gastos de otro, o que un código de otro evento sea rechazado. La Tabla 6 muestra la cantidad de pruebas por módulo antes y después de este trabajo.'));
add(table('Pruebas automatizadas por módulo',
  ['Módulo', 'Al inicio', 'Actual', 'Qué verifican las pruebas agregadas'],
  [
    ['users', '46', '46', '—'],
    ['events', '29', '29', '—'],
    ['invitations', '0', '4', 'Códigos QR únicos, aleatorios y no modificables desde la API.'],
    ['attendance', '38', '44', 'Códigos de otro evento, reingresos, formato de errores y bloqueo de cambios de RSVP.'],
    ['dashboard', '0', '7', 'Autenticación, panel vacío, claves por mes, conteos y tasa de asistencia.'],
    ['expenses', '0', '20', 'Alta, validaciones, permisos, edición, borrado, filtros, resumen y presupuesto.'],
    ['**Total**', '**113**', '**150**', ''],
  ], [17, 12, 12, 59]));
add(P('Las pruebas se ejecutan con un solo comando. El resultado actual es el siguiente:'));
add(code([
  '> docker compose exec backend python manage.py test',
  'Found 150 test(s).',
  "Creating test database for alias 'default'...",
  'System check identified no issues (0 silenced).',
  '..........................................................................',
  '..........................................................................',
  '..',
  '----------------------------------------------------------------------',
  'Ran 150 tests in 228.353s',
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
add(bullet('Alta, edición y borrado de gastos, con y sin presupuesto, incluido el caso en que se supera el presupuesto.'));
add(bullet('Acceso directo desde las tarjetas del panel a la lista de eventos filtrada.'));
add(P('En todos los escenarios se verificó, además del resultado, que no hubiera errores en la consola del navegador ni respuestas de error inesperadas de la API.'));

add(H2(tocEntry('Pruebas manuales del grupo', 2)));
add(P('Cada cambio fue probado también por el grupo en su propia computadora, con la aplicación ejecutándose en Docker, siguiendo pasos definidos y comparando el resultado obtenido con el esperado. La Tabla 7 muestra, como ejemplo, la prueba del check-in.'));
add(table('Prueba manual del check-in',
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

// =====================================================================
// 7. Despliegue con Docker
// =====================================================================
add(H1(tocEntry('Ejecución con Docker', 1)));
add(P('Docker permite empaquetar cada parte de la aplicación junto con todo lo que necesita para funcionar —el intérprete de Python o Node.js, las librerías y el código— en un contenedor que se ejecuta igual en cualquier computadora. El archivo `docker-compose.yml` define dos servicios: `backend`, que al iniciar aplica las migraciones de la base de datos y levanta la API en el puerto 8000, y `frontend`, que levanta la interfaz en el puerto 5173. Para ejecutar el proyecto solo hace falta tener Docker instalado:'));
add(code([
  'git clone https://github.com/alem123q/eventpro.git',
  'cd eventpro',
  'docker compose up --build',
]));
add(P('Cuando se agregan librerías nuevas al frontend, hay que agregar la opción `-V` (`docker compose up --build -V`), porque Docker conserva la carpeta de dependencias anterior entre reinicios. Para acceder al panel de administración de Django se crea un usuario administrador con `docker compose exec backend python manage.py createsuperuser`. La Tabla 8 resume las direcciones disponibles.'));
add(table('Servicios disponibles al ejecutar el proyecto',
  ['Servicio', 'Dirección'],
  [
    ['Aplicación web', '`http://localhost:5173`'],
    ['API', '`http://localhost:8000/api/`'],
    ['Panel de administración', '`http://localhost:8000/admin/`'],
  ], [40, 60]));
add(P('Esta configuración está pensada para el desarrollo: usa los servidores de desarrollo de Django y Vite, que recargan los cambios automáticamente. Para publicar la aplicación en internet habría que reemplazarlos por servidores de producción y desactivar el modo de depuración, tareas que se plantean como trabajo futuro.'));

// =====================================================================
// 8. Conclusiones
// =====================================================================
add(H1(tocEntry('Conclusiones y trabajo futuro', 1)));
add(P('Se desarrolló una aplicación web que cubre el ciclo completo de un evento: creación, invitados, confirmaciones, control de ingreso con códigos QR, gastos con presupuesto y un panel con métricas. La aplicación se ejecuta con un solo comando gracias a Docker y cuenta con 150 pruebas automatizadas, todas aprobadas.'));
add(P('Elegir como base la versión más completa, en lugar de la más vistosa, permitió concentrar el esfuerzo en corregir y ampliar algo que ya funcionaba. Las pruebas manuales del grupo resultaron decisivas: varios de los errores más importantes —los del check-in o la tasa de asistencia de 133,3 %— no se veían en las pruebas automatizadas existentes y aparecieron al usar la aplicación como lo haría un organizador real. Cada uno de esos errores quedó cubierto por una prueba nueva, de modo que un cambio futuro que los reintroduzca será detectado de inmediato.'));
add(P('Como trabajo futuro se proponen:'));
add(bullet('Escanear los códigos QR con la cámara del celular o de la computadora desde la pantalla de check-in.'));
add(bullet('Completar la verificación de correo electrónico, cuyo enlace todavía no tiene una página asociada, y configurar el envío real de correos.'));
add(bullet('Publicar la aplicación en internet con una configuración de producción (servidores de producción, HTTPS y variables de entorno para los datos sensibles).'));

// =====================================================================
// Referencias
// =====================================================================
const refs = [
  'Anthropic. (2026). *Claude* (versión Opus 5.5) [Modelo de lenguaje de gran tamaño]. https://claude.ai',
  'Django Software Foundation. (s. f.). *Django documentation* (versión 6.0). Recuperado el 15 de octubre de 2026, de https://docs.djangoproject.com/en/6.0/',
  'Docker Inc. (s. f.). *Docker Compose*. Recuperado el 15 de octubre de 2026, de https://docs.docker.com/compose/',
  'Encode OSS. (s. f.). *Django REST framework*. Recuperado el 15 de octubre de 2026, de https://www.django-rest-framework.org/',
  'Fielding, R. T. (2000). *Architectural styles and the design of network-based software architectures* [Tesis doctoral, University of California, Irvine]. https://ics.uci.edu/~fielding/pubs/dissertation/top.htm',
  'Jones, M., Bradley, J. y Sakimura, N. (2015). *JSON Web Token (JWT)* (RFC 7519). Internet Engineering Task Force. https://doi.org/10.17487/RFC7519',
  'Meta Open Source. (s. f.). *React*. Recuperado el 15 de octubre de 2026, de https://react.dev/',
  'Microsoft. (s. f.). *Playwright*. Recuperado el 15 de octubre de 2026, de https://playwright.dev/',
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
    spacing: { line: 276, lineRule: LineRuleType.AUTO, before: e.level === 1 ? 100 : 0 },
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
