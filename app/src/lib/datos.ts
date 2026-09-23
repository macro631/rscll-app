import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from './backend';
import { useAviso } from '../components/Aviso';
import type {
  EstadoFila,
  FichaRecinto,
  FichaRevision,
  FiltrosObservacion,
  MiRevision,
  Observacion,
  Pagina,
  Perfil,
  Recinto,
} from './tipos';

export function useCatalogo() {
  const q = useQuery({
    queryKey: ['catalogo'],
    queryFn: () => api().rpc<Recinto[]>('catalogo'),
    staleTime: Infinity,
  });
  const indices = useMemo(() => {
    const porId = new Map<string, Recinto>();
    const porCodigo = new Map<string, Recinto>();
    for (const r of q.data ?? []) {
      porId.set(r.id, r);
      porCodigo.set(r.codigo, r);
    }
    return { porId, porCodigo };
  }, [q.data]);
  return { ...q, recintos: q.data ?? [], ...indices };
}

export function useEstados() {
  const q = useQuery({
    queryKey: ['estados'],
    queryFn: () => api().rpc<EstadoFila[]>('estados'),
  });
  const mapa = useMemo(() => new Map((q.data ?? []).map((e) => [e.recinto_id, e])), [q.data]);
  return { ...q, mapa };
}

export function useMisRevisiones() {
  return useQuery({ queryKey: ['mis-revisiones'], queryFn: () => api().rpc<MiRevision[]>('mis_revisiones') });
}

export function useFichaRecinto(id: string | undefined) {
  return useQuery({
    queryKey: ['ficha-recinto', id],
    queryFn: () => api().rpc<FichaRecinto>('ficha_recinto', { p_recinto: id }),
    enabled: !!id,
  });
}

export function useFichaRevision(id: string | undefined) {
  return useQuery({
    queryKey: ['ficha-revision', id],
    queryFn: () => api().rpc<FichaRevision>('ficha_revision', { p_revision: id }),
    enabled: !!id,
  });
}

export function useBusqueda(filtros: FiltrosObservacion, opciones: { limite?: number; desde?: number; orden?: string; activo?: boolean } = {}) {
  const { limite, desde = 0, orden = 'recinto', activo = true } = opciones;
  return useQuery({
    queryKey: ['buscar', filtros, limite, desde, orden],
    queryFn: () =>
      api().rpc<Pagina<Observacion>>('buscar_observaciones', {
        p_filtros: limpiar(filtros),
        p_limite: limite ?? null,
        p_desplazamiento: desde,
        p_orden: orden,
      }),
    placeholderData: keepPreviousData,
    enabled: activo,
  });
}

export function buscarTodas(filtros: FiltrosObservacion, orden = 'recinto') {
  return api().rpc<Pagina<Observacion>>('buscar_observaciones', {
    p_filtros: limpiar(filtros),
    p_limite: null,
    p_desplazamiento: 0,
    p_orden: orden,
  });
}

export function useNombresUsuarios() {
  return useQuery({
    queryKey: ['usuarios-nombres'],
    queryFn: () => api().rpc<Pick<Perfil, 'id' | 'nombre' | 'rol'>[]>('usuarios_nombres'),
    staleTime: 5 * 60_000,
  });
}

/** Quita filtros vacíos: ausente equivale a «Todos». */
export function limpiar(filtros: FiltrosObservacion) {
  return Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== undefined && v !== '')) as FiltrosObservacion;
}

/** Ejecuta una RPC de escritura, refresca todas las vistas y muestra un aviso breve. */
export function useAccion() {
  const qc = useQueryClient();
  const aviso = useAviso();
  return useMutation({
    mutationFn: ({ fn, args }: { fn: string; args?: Record<string, unknown>; ok?: string }) => api().rpc<unknown>(fn, args),
    onSuccess: (_r, vars) => {
      void qc.invalidateQueries();
      if (vars.ok) aviso(vars.ok);
    },
    onError: (e) => aviso(e instanceof Error ? e.message : String(e), 'error'),
  });
}
