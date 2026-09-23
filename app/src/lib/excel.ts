// Exportación Excel (§10): hoja Observaciones + hoja Recintos y estados (incluye recintos sin observaciones).
import { api } from './backend';
import { fecha } from './formato';
import { ESTADOS, type EstadoFila, type Observacion, type Recinto } from './tipos';

const VIGENCIA_ENLACE = 7 * 24 * 3600;

export async function generarExcel(
  filas: Observacion[],
  recintos: Recinto[],
  estados: Map<string, EstadoFila>,
  filtros: string[],
): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Calidad RSCLL';
  libro.created = new Date();

  const hoja = libro.addWorksheet('Observaciones', { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = [
    { header: 'N°', key: 'numero', width: 7 },
    { header: 'Sector(es)', key: 'sectores', width: 22 },
    { header: 'Código', key: 'codigo', width: 9 },
    { header: 'Recinto', key: 'recinto', width: 30 },
    { header: 'Especialidad', key: 'especialidad', width: 20 },
    { header: 'Descripción', key: 'descripcion', width: 50 },
    { header: 'Estado', key: 'estado', width: 11 },
    { header: 'Origen', key: 'origen', width: 11 },
    { header: 'Autor', key: 'autor', width: 20 },
    { header: 'Fecha registro', key: 'creada', width: 17 },
    { header: 'Última comprobación', key: 'comprobada', width: 17 },
    { header: 'Comprobada por', key: 'comprobador', width: 20 },
    { header: 'Comentario vigente de Inspección', key: 'comentario', width: 45 },
    { header: 'Fotos', key: 'nfotos', width: 7 },
    { header: 'Referencias de fotos', key: 'fotos', width: 45 },
    { header: 'Enlace foto 1', key: 'enlace', width: 18 },
    { header: 'Identificador', key: 'id', width: 38 },
  ];
  for (const o of filas) {
    let enlace: string | null = null;
    if (api().modo === 'supabase' && o.fotos[0]) {
      try {
        enlace = await api().urlFoto('fotos-original', o.fotos[0].original, VIGENCIA_ENLACE);
      } catch {
        enlace = null;
      }
    }
    const fila = hoja.addRow({
      numero: o.numero,
      sectores: o.sectores.join(' · '),
      codigo: o.codigo,
      recinto: o.recinto_nombre,
      especialidad: o.especialidad,
      descripcion: o.descripcion,
      estado: o.estado === 'pendiente' ? 'Pendiente' : 'Subsanada',
      origen: o.origen === 'inspeccion' ? 'Inspección' : 'Revisión',
      autor: o.autor,
      creada: fecha(o.creada),
      comprobada: o.comprobada_en ? fecha(o.comprobada_en) : '',
      comprobador: o.comprobador ?? '',
      comentario: o.comentario_inspeccion ?? '',
      nfotos: o.fotos.length,
      fotos: o.fotos.map((f) => `fotos-original/${f.original}`).join('\n'),
      enlace: enlace ? { text: 'Abrir (7 días)', hyperlink: enlace } : '',
      id: o.id,
    });
    fila.alignment = { vertical: 'top', wrapText: true };
  }
  hoja.getRow(1).font = { bold: true };
  hoja.autoFilter = { from: 'A1', to: 'Q1' };

  const hojaR = libro.addWorksheet('Recintos y estados', { views: [{ state: 'frozen', ySplit: 1 }] });
  hojaR.columns = [
    { header: 'Código', key: 'codigo', width: 9 },
    { header: 'Recinto', key: 'nombre', width: 32 },
    { header: 'Tipo', key: 'tipo', width: 16 },
    { header: 'Sector(es)', key: 'sectores', width: 24 },
    { header: 'Estado', key: 'estado', width: 28 },
    { header: 'Fichas abiertas', key: 'abiertas', width: 9 },
    { header: 'Pendientes', key: 'pendientes', width: 11 },
    { header: 'Subsanadas', key: 'subsanadas', width: 11 },
    { header: 'Recepción vigente', key: 'recepcion', width: 17 },
  ];
  for (const r of recintos) {
    const e = estados.get(r.id);
    hojaR.addRow({
      codigo: r.codigo,
      nombre: r.nombre,
      tipo: r.tipo,
      sectores: r.sectores.map((s) => s.sector).join(' · '),
      estado: ESTADOS[e?.estado ?? 'sin_revisar'].nombre,
      abiertas: e?.abiertas ?? 0,
      pendientes: e?.pendientes ?? 0,
      subsanadas: e?.subsanadas ?? 0,
      recepcion: e?.recepcion_fecha ? fecha(e.recepcion_fecha) : '',
    });
  }
  hojaR.getRow(1).font = { bold: true };
  hojaR.autoFilter = { from: 'A1', to: 'I1' };

  const info = libro.addWorksheet('Emisión');
  info.addRows([
    ['Proyecto', 'RSCLL · Reposición SubComisaría Llay Llay'],
    ['Emitido', fecha(new Date())],
    ['Filtros', filtros.join(' · ')],
    ['Observaciones', filas.length],
    ['Nota', 'Las fotos se entregan como referencias al almacenamiento; los enlaces vencen a los 7 días.'],
  ]);
  info.getColumn(1).font = { bold: true };
  info.getColumn(1).width = 16;
  info.getColumn(2).width = 90;

  const buffer = await libro.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
