import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './lib/backend';
import { detenerCola, iniciarCola } from './lib/cola';
import type { Perfil, Rol } from './lib/tipos';

interface Sesion {
  perfil: Perfil | null;
  cargando: boolean;
  error: string | null;
  salir: () => Promise<void>;
  puede: (...roles: Rol[]) => boolean;
}

const Contexto = createContext<Sesion>({
  perfil: null,
  cargando: true,
  error: null,
  salir: async () => {},
  puede: () => false,
});

export function useSesion() {
  return useContext(Contexto);
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const b = api();
    const uid = await b.usuarioId();
    if (!uid) {
      setPerfil(null);
      detenerCola();
      setCargando(false);
      return;
    }
    try {
      const p = await b.rpc<Perfil>('mi_perfil');
      setPerfil(p);
      setError(null);
      qc.clear();
      await iniciarCola(p.id, () => void qc.invalidateQueries());
    } catch (e) {
      setPerfil(null);
      setError(e instanceof Error ? e.message : String(e));
      await b.cerrarSesion();
    } finally {
      setCargando(false);
    }
  }, [qc]);

  useEffect(() => {
    void cargar();
    const b = api();
    const fin1 = b.alCambiarSesion(() => void cargar());
    // Cambios de otros usuarios (Supabase Realtime) o locales (demo) refrescan las vistas.
    const fin2 = b.alCambiarDatos(() => void qc.invalidateQueries());
    return () => {
      fin1();
      fin2();
    };
  }, [cargar, qc]);

  const salir = useCallback(async () => {
    detenerCola();
    await api().cerrarSesion();
    qc.clear();
  }, [qc]);

  const puede = useCallback((...roles: Rol[]) => !!perfil && roles.includes(perfil.rol), [perfil]);

  return <Contexto.Provider value={{ perfil, cargando, error, salir, puede }}>{children}</Contexto.Provider>;
}
