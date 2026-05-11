const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageBreak
} = require("docx");

const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

function p(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: opts.spacing,
    children: [new TextRun({ text, bold: opts.bold, size: opts.size, color: opts.color })],
  });
}

function cell(width, text, opts = {}) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    margins: cellMargins,
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({
      alignment: opts.align,
      children: [new TextRun({ text, bold: opts.bold })],
    })],
  });
}

const TOTAL = 9360;

function headerTable(proyecto, grupo, fecha, rf) {
  const w = [2340, 2340, 2340, 2340];
  return new Table({
    width: { size: TOTAL, type: WidthType.DXA },
    columnWidths: w,
    rows: [
      new TableRow({ children: [
        cell(w[0], "PROYECTO", { bold: true, fill: "D9D9D9" }),
        cell(w[1], "GRUPO", { bold: true, fill: "D9D9D9" }),
        cell(w[2], "FECHA DE REUNIÓN", { bold: true, fill: "D9D9D9" }),
        cell(w[3], "RF #", { bold: true, fill: "D9D9D9" }),
      ]}),
      new TableRow({ children: [
        cell(w[0], proyecto),
        cell(w[1], grupo),
        cell(w[2], fecha),
        cell(w[3], rf),
      ]}),
    ],
  });
}

function asistentesTable() {
  const w = [3120, 3120, 3120];
  const rows = [
    ["Apellido y Nombre", "Rol en el Proyecto", "FIRMA"],
    ["Chappa Santiago", "Scrum Técnico", ""],
    ["Moragues Paula", "Desarrolladora", ""],
    ["Merlo Bruno", "Desarrollador / Tester", ""],
    ["Tadeo", "Desarrollador / Analista", ""],
    ["Corigliano Luka", "Tester", ""],
  ];
  return new Table({
    width: { size: TOTAL, type: WidthType.DXA },
    columnWidths: w,
    rows: rows.map((r, i) => new TableRow({
      children: r.map(t => cell(w[0], t, i === 0 ? { bold: true, fill: "D9D9D9" } : {})),
    })),
  });
}

function temaBlock(tema, discusion, conclusiones, planes) {
  const wFull = [TOTAL];
  const wPlanes = [4680, 2340, 2340];
  const elems = [];
  elems.push(new Table({
    width: { size: TOTAL, type: WidthType.DXA },
    columnWidths: wFull,
    rows: [
      new TableRow({ children: [cell(TOTAL, "TEMA", { bold: true, fill: "BDD6EE" })] }),
      new TableRow({ children: [cell(TOTAL, tema)] }),
      new TableRow({ children: [cell(TOTAL, "Discusión", { bold: true, fill: "DEEAF6" })] }),
      new TableRow({ children: [cell(TOTAL, discusion)] }),
      new TableRow({ children: [cell(TOTAL, "Conclusiones", { bold: true, fill: "DEEAF6" })] }),
      new TableRow({ children: [cell(TOTAL, conclusiones)] }),
    ],
  }));
  elems.push(p(""));
  const planRows = [
    new TableRow({ children: [
      cell(wPlanes[0], "Planes de acción", { bold: true, fill: "DEEAF6" }),
      cell(wPlanes[1], "Responsable", { bold: true, fill: "DEEAF6" }),
      cell(wPlanes[2], "Plazo", { bold: true, fill: "DEEAF6" }),
    ]}),
    ...planes.map(pl => new TableRow({ children: [
      cell(wPlanes[0], pl[0]),
      cell(wPlanes[1], pl[1]),
      cell(wPlanes[2], pl[2]),
    ]})),
  ];
  elems.push(new Table({
    width: { size: TOTAL, type: WidthType.DXA },
    columnWidths: wPlanes,
    rows: planRows,
  }));
  elems.push(p(""));
  return elems;
}

function minuta({ fecha, rf, proximaReunion, temas }) {
  const children = [];
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Minuta de Reunión Formal de Avance", bold: true, size: 32 })],
  }));
  children.push(p(""));
  children.push(headerTable("LogiTrack", "Grupo 2", fecha, rf));
  children.push(p(""));
  children.push(p("Apuntador: Santiago Chappa", { bold: true }));
  children.push(p(""));
  children.push(p("Asistentes", { bold: true }));
  children.push(asistentesTable());
  children.push(p(""));
  for (const t of temas) {
    children.push(...temaBlock(t.tema, t.discusion, t.conclusiones, t.planes));
  }
  children.push(p("PROXIMA REUNION: " + proximaReunion, { bold: true }));
  return children;
}

const minutas = [
  {
    fecha: "Martes 28/04/2026",
    rf: "RF1",
    proximaReunion: "Jueves 30/04/2026",
    temas: [
      {
        tema: "Presentación de funcionalidades a desarrollar en Sprint 2",
        discusion: "Se presentaron al cliente las funcionalidades comprometidas para Sprint 2: generación y escaneo de códigos QR para cambios de estado, flujo dinámico de transiciones de estado, importación masiva de envíos por CSV y módulo de optimización de ruteo. Se repasó el alcance de cada HU y los criterios de aceptación.",
        conclusiones: "El cliente aprueba el alcance propuesto. Se confirma la prioridad de QR y cambios de estado para la primera semana del sprint. Cada integrante crea su rama feature_LGT-XXX desde develop.",
        planes: [
          ["Crear ramas feature_LGT-* y comenzar tareas", "Todos", "29/04"],
          ["Documentar criterios de aceptación por HU", "Tadeo", "29/04"],
          ["Preparar demo de avance QR", "Bruno", "30/04"],
        ],
      },
    ],
  },
  {
    fecha: "Jueves 30/04/2026",
    rf: "RF2",
    proximaReunion: "Martes 05/05/2026",
    temas: [
      {
        tema: "Avance de funcionalidades — QR y cambios de estado",
        discusion: "Se presentó al cliente el avance del módulo de QR: generación del código por envío, escaneo desde la vista de transportista y el paso a paso del cambio de estado asociado (Pendiente → En tránsito → Entregado). Se mostró la integración con el historial de eventos del envío.",
        conclusiones: "El cliente aprueba el flujo del QR y solicita validar que cada escaneo genere un evento en el timeline. Se acuerda continuar con el flujo dinámico de transiciones y el formulario de importación CSV.",
        planes: [
          ["Validar generación de evento en timeline por escaneo", "Luka", "02/05"],
          ["Avanzar flujo dinámico de cambios de estado", "Paula", "05/05"],
          ["Avanzar prototipo de importación CSV", "Tadeo", "05/05"],
        ],
      },
    ],
  },
  {
    fecha: "Martes 05/05/2026",
    rf: "RF3",
    proximaReunion: "Jueves 07/05/2026",
    temas: [
      {
        tema: "Presentación del flujo de cambios de estado dinámicos",
        discusion: "Se mostró al cliente el flujo dinámico de cambios de estado, configurable por tipo de envío, con validación de transiciones permitidas desde la state machine. El cliente aprobó el diseño. Posteriormente, el profesor solicitó incorporar el volumen del envío como dato adicional para calcular el precio final.",
        conclusiones: "Se incorpora el campo volumen en el alta y modificación de envío. Se ajusta la fórmula de cálculo de precio para considerar volumen además de peso y distancia. Bruno y Luka definen los casos de prueba.",
        planes: [
          ["Agregar campo volumen al modelo Shipment y vistas", "Paula", "06/05"],
          ["Actualizar cálculo de precio con volumen", "Santiago", "06/05"],
          ["Casos de prueba para precio con volumen", "Luka / Bruno", "07/05"],
        ],
      },
    ],
  },
  {
    fecha: "Jueves 07/05/2026",
    rf: "RF4",
    proximaReunion: "Martes 12/05/2026",
    temas: [
      {
        tema: "Dudas sobre importación CSV y nuevo pedido de optimización de ruteo",
        discusion: "Se plantearon dudas al profesor sobre el alcance de la importación CSV: formato esperado, validaciones por fila, manejo de errores parciales y mensajes al usuario. El profesor respondió las dudas y, además, pidió sumar al sprint la funcionalidad de optimización de ruteo (agrupamiento por zona y orden de visitas) para mejorar la asignación de envíos a transportistas.",
        conclusiones: "Se define formato CSV con cabecera obligatoria, validación fila a fila y reporte de errores al finalizar. Se incorpora la HU LGT-134 de optimización de ruteo con algoritmo greedy por zona y fallback manual.",
        planes: [
          ["Implementar parser y validaciones CSV", "Tadeo", "10/05"],
          ["Implementar servicio routeOptimizer (greedy por zona)", "Santiago", "11/05"],
          ["Tests de importación CSV y ruteo", "Bruno / Luka", "12/05"],
        ],
      },
    ],
  },
];

const allChildren = [];
minutas.forEach((m, i) => {
  if (i > 0) allChildren.push(new Paragraph({ children: [new PageBreak()] }));
  allChildren.push(...minuta(m));
});

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Calibri", size: 22 } } },
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    children: allChildren,
  }],
});

Packer.toBuffer(doc).then(buf => {
  const out = "D:\\Facultad\\Tecnicatura\\Laboratorio de construccion de software\\Sprint 2\\Minutas Sprint 2\\Minuta_Sprint2_RF1_29042026.docx";
  fs.writeFileSync(out, buf);
  console.log("Wrote", out);
});
