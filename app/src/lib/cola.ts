// Cola local de observaciones y fotos (§13): se guarda en IndexedDB al instante y se envía cuando hay red.
// Cada elemento lleva un client_id; el servidor lo usa para no duplicar un reenvío.
import { useSyncExternalStore } from 'react';
import { createStore, get, set } from 'idb-keyval';
import imageCompression from 'browser-image-compression';
import { api } from './backend';

export interface FotoCola {
  id: string;
  original: Blob;
  ligera: Blob;
  subida?: boolean;
}

export interface ItemCola {
  id: string;
  tipo: 'observacion' | 'inspeccion' | 'fotos';
  usuario: string;
  recintoId: string;
  revisionId?: string;
  especialidad?: string;
  descripcion?: string;
  observacionId?: string;
  fotos: FotoCola[];
  creado: string;
  error?: string;
}

const almacen = createStore('rscll-cola', 'items');
let items: ItemCola[] = [];
let usuario: string | null = null;
let procesando = false;
let alTerminar: (() => void) | null = null;
const oyentes = new Set<() => void>();
let temporizador: ReturnType<typeof setInterval> | undefined;

function notificar() {
  items = [...items];
  oyentes.forEach((cb) => cb());
}

async function guardar() {
  try {
    await set('items', items, almacen);
  } catch {
    /* sin IndexedDB: la cola vive solo en memoria */
  }
}

function actualizar(id: string, cambios: Partial<ItemCola>) {
  items = items.map((i) => (i.id === id ? { ...i, ...cambios } : i));
  notificar();
  void guardar();
}

export async function iniciarCola(uid: string, cb: () => void) {
  usuario = uid;
  alTerminar = cb;
  try {
    items = (await get<ItemCola[]>('items', almacen)) ?? [];
  } catch {
    items = [];
  }
  notificar();
  window.addEventListener('online', procesarCola);
  clearInterval(temporizador);
  temporizador = setInterval(() => {
    if (items.some((i) => i.usuario === usuario)) void procesarCola();
  }, 20_000);
  void procesarCola();
}

export function detenerCola() {
  usuario = null;
  window.removeEventListener('online', procesarCola);
  clearInterval(temporizador);
}

export async function prepararFoto(archivo: File): Promise<FotoCola> {
  // «Original» de respaldo reducido a 2000 px (~0,6 MB): unas 1500 fotos por GB en vez de ~250 a tamaño completo.
  const original = await imageCompression(archivo, {
    maxWidthOrHeight: 2000,
    maxSizeMB: 0.6,
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.85,
  });
  const ligera = await imageCompression(archivo, {
    maxWidthOrHeight: 1280,
    maxSizeMB: 0.25,
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.8,
  });
  return { id: crypto.randomUUID(), original, ligera };
}

export async function encolar(item: Omit<ItemCola, 'id' | 'usuario' | 'creado'> & { id?: string }) {
  if (!usuario) throw new Error('Sesión no iniciada');
  const nuevo: ItemCola = { ...item, id: item.id ?? crypto.randomUUID(), usuario, creado: new Date().toISOString() };
  items = [...items, nuevo];
  notificar();
  await guardar();
  void procesarCola();
  return nuevo.id;
}

export function descartar(id: string) {
  items = items.filter((i) => i.id !== id);
  notificar();
  void guardar();
}

function extension(blob: Blob) {
  const t = blob.type.split('/')[1];
  return t ? t.replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '') : 'jpg';
}

function esErrorDeRed(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return !navigator.onLine || /fetch|network|timeout|conexi/i.test(m);
}

async function enviar(item: ItemCola) {
  const b = api();
  let obsId = item.observacionId;
  if (!obsId) {
    if (item.tipo === 'observacion') {
      obsId = await b.rpc<string>('agregar_observacion', {
        p_revision: item.revisionId,
        p_especialidad: item.especialidad,
        p_descripcion: item.descripcion,
        p_client_id: item.id,
      });
    } else if (item.tipo === 'inspeccion') {
      obsId = await b.rpc<string>('observacion_inspeccion', {
        p_recinto: item.recintoId,
        p_especialidad: item.especialidad,
        p_descripcion: item.descripcion,
        p_client_id: item.id,
      });
    }
    if (!obsId) throw new Error('Observación sin identificador');
    actualizar(item.id, { observacionId: obsId, error: undefined });
  }
  for (const f of item.fotos) {
    if (f.subida) continue;
    const pathOriginal = `${obsId}/${f.id}.${extension(f.original)}`;
    const pathLigera = `${obsId}/${f.id}.jpg`;
    await b.subirFoto('fotos-original', pathOriginal, f.original);
    await b.subirFoto('fotos-ligera', pathLigera, f.ligera);
    await b.rpc('agregar_foto', {
      p_observacion: obsId,
      p_path_original: pathOriginal,
      p_path_ligera: pathLigera,
      p_client_id: f.id,
    });
    const actual = items.find((i) => i.id === item.id);
    if (actual) {
      actualizar(item.id, { fotos: actual.fotos.map((x) => (x.id === f.id ? { ...x, subida: true } : x)) });
    }
  }
}

export async function procesarCola() {
  if (procesando || !usuario) return;
  procesando = true;
  let enviados = 0;
  try {
    for (const item of items.filter((i) => i.usuario === usuario)) {
      const vigente = items.find((i) => i.id === item.id);
      if (!vigente) continue;
      try {
        await enviar(vigente);
        items = items.filter((i) => i.id !== item.id);
        notificar();
        await guardar();
        enviados++;
      } catch (e) {
        actualizar(item.id, { error: e instanceof Error ? e.message : String(e) });
        if (esErrorDeRed(e)) break;
      }
    }
  } finally {
    procesando = false;
    if (enviados > 0) alTerminar?.();
  }
}

function suscribir(cb: () => void) {
  oyentes.add(cb);
  return () => oyentes.delete(cb);
}

/** Elementos del usuario actual aún no confirmados por el servidor. */
export function useCola() {
  const todos = useSyncExternalStore(suscribir, () => items);
  return todos.filter((i) => i.usuario === usuario);
}
