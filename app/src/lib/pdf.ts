// Única plantilla de informe de observaciones (§9). La agrupación decide las columnas: lo que ya dice el
// título del grupo (recinto o especialidad) no se repite en cada fila.
import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import { api } from './backend';
import { fecha } from './formato';
import type { Observacion } from './tipos';

export const LEYENDA_PDF = 'Emitido por Calidad\nSubComisaria LlayLlay';

export type Agrupacion = 'recinto' | 'especialidad';

async function aDataUrl(blob: Blob): Promise<string> {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(r.result as string);
    r.onerror = () => mal(r.error);
    r.readAsDataURL(blob);
  });
}

async function cargarFotos(filas: Observacion[], maxPorObs: number) {
  const pedidos = filas.flatMap((o) => o.fotos.slice(0, maxPorObs).map((f) => f.ligera));
  const mapa = new Map<string, string>();
  let i = 0;
  async function trabajador() {
    while (i < pedidos.length) {
      const path = pedidos[i++];
      try {
        const url = await api().urlFoto('fotos-ligera', path);
        const blob = await (await fetch(url)).blob();
        mapa.set(path, await aDataUrl(blob));
      } catch {
        /* foto no disponible: la fila se imprime sin ella */
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, trabajador));
  return mapa;
}

export function agrupar(filas: Observacion[], agrupacion: Agrupacion) {
  const grupos = new Map<string, Observacion[]>();
  for (const o of filas) {
    const clave = agrupacion === 'recinto' ? `${o.codigo} · ${o.recinto_nombre}` : o.especialidad;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(o);
  }
  return grupos;
}

export async function generarPdf(
  filas: Observacion[],
  opciones: { filtros: string[]; agrupacion: Agrupacion; conFotos: boolean },
): Promise<Blob> {
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  pdfMake.addVirtualFileSystem(vfs);

  const emision = fecha(new Date());
  const fotos = opciones.conFotos ? await cargarFotos(filas, 3) : new Map<string, string>();

  // Columnas según la agrupación: el dato que ya está en el título del grupo no se repite en cada fila.
  const conRecinto = opciones.agrupacion !== 'recinto';
  const conEspecialidad = opciones.agrupacion !== 'especialidad';
  const ANCHO_FOTO = 150;
  const columnas = [
    { titulo: 'N°', ancho: 24 as number | string },
    ...(conRecinto ? [{ titulo: 'Recinto', ancho: 74 }] : []),
    ...(conEspecialidad ? [{ titulo: 'Especialidad', ancho: 66 }] : []),
    { titulo: 'Observación', ancho: '*' },
    { titulo: 'Estado', ancho: 56 },
    { titulo: 'Foto', ancho: ANCHO_FOTO },
  ];

  const cuerpo: Content[] = [];
  for (const [grupo, obs] of agrupar(filas, opciones.agrupacion)) {
    const pendientes = obs.filter((o) => o.estado === 'pendiente').length;
    // El título del grupo y los encabezados son filas de cabecera de la tabla: se repiten en cada hoja.
    // Cada tabla necesita objetos nuevos: pdfmake modifica las celdas al maquetar.
    const titulo: TableCell[] = [
      { text: `${grupo}   ·   ${obs.length} obs., ${pendientes} pend.`, style: 'grupo', colSpan: columnas.length, border: [false, false, false, true] },
      ...columnas.slice(1).map(() => ({})),
    ];
    const encabezado: TableCell[] = columnas.map((c) => ({ text: c.titulo, style: 'th', alignment: c.titulo === 'Foto' ? 'center' : 'left' }));
    cuerpo.push({
      table: {
        headerRows: 2,
        keepWithHeaderRows: 1,
        dontBreakRows: true,
        widths: columnas.map((c) => c.ancho),
        body: [
          titulo,
          encabezado,
          ...obs.map((o): TableCell[] => {
            const imagenes = o.fotos
              .slice(0, 3)
              .map((f) => fotos.get(f.ligera))
              .filter((d): d is string => !!d)
              .map((d, i) => ({
                image: d,
                fit: [ANCHO_FOTO - 10, 112] as [number, number],
                alignment: 'center' as const,
                margin: [0, i === 0 ? 0 : 4, 0, 0] as [number, number, number, number],
              }));
            return [
              { text: String(o.numero), style: 'td' },
              ...(conRecinto ? [{ text: [{ text: o.codigo, bold: true }, `\n${o.recinto_nombre}`], style: 'td' }] : []),
              ...(conEspecialidad ? [{ text: o.especialidad, style: 'td' }] : []),
              {
                stack: [
                  { text: o.descripcion },
                  ...(o.comentario_inspeccion
                    ? [{ text: `Inspección (${fecha(o.comentario_inspeccion_fecha)}): ${o.comentario_inspeccion}`, italics: true, color: '#8a5300', margin: [0, 3, 0, 0] as [number, number, number, number] }]
                    : []),
                  { text: `${o.autor} · ${fecha(o.creada, false)}`, color: '#666', fontSize: 7, margin: [0, 3, 0, 0] as [number, number, number, number] },
                ],
                style: 'td',
              },
              {
                stack: [
                  { text: o.estado === 'pendiente' ? 'Pendiente' : 'Subsanada', bold: true, color: o.estado === 'pendiente' ? '#9a5b00' : '#1d6b2a' },
                  ...(o.estado === 'subsanada' && o.comprobada_en ? [{ text: fecha(o.comprobada_en, false), fontSize: 7, color: '#666' }] : []),
                ],
                style: 'td',
              },
              imagenes.length
                ? { stack: imagenes, style: 'td', alignment: 'center' }
                : { text: o.fotos.length ? '(sin descarga)' : '—', style: 'td', color: '#999', alignment: 'center' },
            ];
          }),
        ],
      },
      layout: {
        hLineWidth: (i: number) => (i === 0 ? 0 : 1),
        hLineColor: (i: number) => (i === 1 || i === 2 ? '#15232b' : '#c8d0d2'),
        vLineColor: () => '#c8d0d2',
        fillColor: (fila: number) => (fila === 1 ? '#e8eef0' : null),
        paddingTop: (fila: number) => (fila === 0 ? 2 : 4),
        paddingBottom: (fila: number) => (fila === 0 ? 5 : 4),
      },
      margin: [0, 0, 0, 14],
    });
  }
  if (filas.length === 0) cuerpo.push({ text: 'No hay observaciones con los filtros aplicados.', italics: true });

  const doc: TDocumentDefinitions = {
    pageSize: 'LETTER',
    pageMargins: [36, 54, 36, 48],
    info: { title: 'RSCLL · Informe de observaciones', author: 'Calidad' },
    header: (pagina, total) => ({
      columns: [
        { text: 'RSCLL · Reposición SubComisaría Llay Llay', bold: true },
        { text: `Emitido ${emision} · Página ${pagina} de ${total}`, alignment: 'right' },
      ],
      margin: [36, 22, 36, 0],
      fontSize: 8,
      color: '#445',
    }),
    footer: () => ({ text: LEYENDA_PDF, alignment: 'center', fontSize: 8, color: '#445', margin: [36, 8, 36, 0] }),
    content: [
      { text: 'Informe de observaciones', style: 'titulo' },
      { text: `Fecha y hora de emisión: ${emision}`, margin: [0, 0, 0, 2] },
      { text: `Filtros: ${opciones.filtros.join(' · ')}`, margin: [0, 0, 0, 2] },
      { text: `Total: ${filas.length} observación(es), ${filas.filter((o) => o.estado === 'pendiente').length} pendiente(s)`, margin: [0, 0, 0, 10] },
      ...cuerpo,
    ],
    defaultStyle: { fontSize: 9 },
    styles: {
      titulo: { fontSize: 15, bold: true, margin: [0, 0, 0, 6] },
      grupo: { fontSize: 11, bold: true, margin: [-4, 4, 0, 0], color: '#15232b' },
      th: { bold: true, fontSize: 8 },
      td: { fontSize: 8.5 },
    },
  };
  return pdfMake.createPdf(doc).getBlob();
}
