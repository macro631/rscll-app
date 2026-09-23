export type Rol = 'admin' | 'revisor' | 'inspeccion';
export type EstadoRecinto = 'sin_revisar' | 'en_revision' | 'pendiente' | 'listo' | 'recepcionado';
export type EstadoObservacion = 'pendiente' | 'subsanada';
export type Condicion = 'abierta' | 'finalizada' | 'anulada';

export interface Perfil {
  id: string;
  nombre: string;
  email: string | null;
  rol: Rol;
  activo: boolean;
}

export interface Recinto {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  orden: number;
  sectores: { sector: string; superficie: number | null }[];
  figuras: { plano: string; elementId: string }[];
}

export interface EstadoFila {
  recinto_id: string;
  estado: EstadoRecinto;
  abiertas: number;
  finalizadas: number;
  pendientes: number;
  subsanadas: number;
  devueltas: number;
  recepcion_fecha: string | null;
  mis_abiertas: string[];
}

export interface FotoRef {
  id: string;
  original: string;
  ligera: string;
}

export interface Comentario {
  id: string;
  tipo: 'nota' | 'devolucion' | 'subsanacion';
  texto: string;
  creado: string;
  autor: string;
  rol: Rol;
}

export interface Observacion {
  id: string;
  numero: number;
  revision_id: string;
  revision_condicion: Condicion;
  revision_origen: 'ordinaria' | 'inspeccion';
  recinto_id: string;
  codigo: string;
  recinto_nombre: string;
  recinto_orden: number;
  sectores: string[];
  especialidad: string;
  descripcion: string;
  estado: EstadoObservacion;
  origen: 'ordinaria' | 'inspeccion';
  autor_id: string;
  autor: string;
  creada: string;
  actualizada: string;
  comprobada_en: string | null;
  comprobador: string | null;
  comentario_inspeccion: string | null;
  comentario_inspeccion_fecha: string | null;
  comentario_inspeccion_autor: string | null;
  fotos: FotoRef[];
  comentarios: Comentario[];
}

export interface Revision {
  id: string;
  recinto_id: string;
  autor_id: string;
  autor: string;
  origen: 'ordinaria' | 'inspeccion';
  condicion: Condicion;
  inicio: string;
  fin: string | null;
  motivo_anulacion: string | null;
  anulada_en: string | null;
  observaciones: number;
  pendientes: number;
}

export interface FichaRecinto {
  estado: EstadoFila & { codigo: string; nombre: string };
  recepcion: { fecha: string; inspector: string } | null;
  revisiones: Revision[];
  observaciones: Observacion[];
  movimientos: { fecha: string; accion: string; actor: string | null; comentario: string | null }[];
}

export interface FichaRevision {
  revision: Revision;
  estado: EstadoFila;
  observaciones: Observacion[];
}

export interface MiRevision {
  id: string;
  recinto_id: string;
  codigo: string;
  nombre: string;
  inicio: string;
  observaciones: number;
}

export interface Pagina<T> {
  total: number;
  filas: T[];
}

export interface FiltrosObservacion {
  sector?: string;
  recinto?: string;
  especialidad?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  autor?: string;
  texto?: string;
}

export interface Evento {
  id: number;
  fecha: string;
  actor: string | null;
  actor_nombre: string | null;
  entidad: string;
  entidad_id: string | null;
  recinto_id: string | null;
  codigo: string | null;
  recinto_nombre: string | null;
  accion: string;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  comentario: string | null;
}

export const ESPECIALIDADES = [
  'Sanitario',
  'Electricidad y CCDD',
  'Climatización',
  'Terminaciones',
  'Pintura',
  'Cerámico / Porcelanato',
  'Ventanas',
  'Puertas',
  'Mobiliario',
  'Paisajismo',
  'Cubierta',
] as const;

export interface Sector {
  id: string;
  corto: string;
  archivo?: string;
}

export const SECTORES: Sector[] = [
  { id: 'Piso 1 (A)', corto: 'Piso 1', archivo: 'RSCLL_Planta_Piso_1.svg' },
  { id: 'Piso 2 (B)', corto: 'Piso 2', archivo: 'RSCLL_Planta_Piso_2.svg' },
  { id: 'Casa (C)', corto: 'Casa', archivo: 'RSCLL_Planta_Casa.svg' },
  { id: 'Exterior (D)', corto: 'Exteriores' },
];

export const ROLES: Record<Rol, string> = {
  admin: 'Administrador',
  revisor: 'Revisor',
  inspeccion: 'Inspección',
};

export const ESTADOS: Record<EstadoRecinto, { nombre: string; corto: string; icono: string }> = {
  sin_revisar: { nombre: 'Sin revisar', corto: 'Sin revisar', icono: '○' },
  en_revision: { nombre: 'En revisión', corto: 'En revisión', icono: '◐' },
  pendiente: { nombre: 'Revisado con pendientes', corto: 'Con pendientes', icono: '!' },
  listo: { nombre: 'Listo para Inspección', corto: 'Listo', icono: '✓' },
  recepcionado: { nombre: 'Recepcionado por Inspección', corto: 'Recepcionado', icono: '✔' },
};

export const ORDEN_ESTADOS: EstadoRecinto[] = ['sin_revisar', 'en_revision', 'pendiente', 'listo', 'recepcionado'];

export const ACCIONES: Record<string, string> = {
  inicio_revision: 'Inicio de revisión',
  fin_revision: 'Fin de revisión',
  alta_observacion: 'Nueva observación',
  edicion_observacion: 'Edición de observación',
  eliminacion_observacion: 'Eliminación de observación',
  alta_foto: 'Foto agregada',
  eliminacion_foto: 'Foto eliminada',
  subsanacion: 'Subsanada',
  devolucion: 'Devuelta a pendiente',
  observacion_inspeccion: 'Observación de Inspección',
  recepcion: 'Recepción',
  devolucion_recepcion: 'Recepción sin vigencia',
  restitucion_recepcion: 'Recepción restituida',
  reapertura: 'Reapertura de ficha',
  anulacion: 'Anulación de ficha',
  reversion_anulacion: 'Reversión de anulación',
  perfil: 'Cambio de usuario',
  alta_usuario: 'Alta de usuario',
};
