import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Tipo = 'ok' | 'error';
type Mostrar = (texto: string, tipo?: Tipo) => void;

const Contexto = createContext<Mostrar>(() => {});

export function useAviso() {
  return useContext(Contexto);
}

/** Mensajes breves de guardado y error, sin cuadros de confirmación (§14). */
export function ProveedorAviso({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<{ texto: string; tipo: Tipo; id: number } | null>(null);
  const mostrar = useCallback<Mostrar>((texto, tipo = 'ok') => {
    const id = Date.now();
    setAviso({ texto, tipo, id });
    setTimeout(() => setAviso((a) => (a?.id === id ? null : a)), tipo === 'error' ? 6000 : 2600);
  }, []);
  return (
    <Contexto.Provider value={mostrar}>
      {children}
      <div className="aviso-zona" aria-live="polite">
        {aviso && (
          <div className={`aviso aviso-${aviso.tipo}`} role={aviso.tipo === 'error' ? 'alert' : 'status'} onClick={() => setAviso(null)}>
            {aviso.texto}
          </div>
        )}
      </div>
    </Contexto.Provider>
  );
}
