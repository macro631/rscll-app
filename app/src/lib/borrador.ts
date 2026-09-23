import { useCallback, useState } from 'react';

/** Borrador de texto guardado en el dispositivo mientras se escribe (§7.2). */
export function useBorrador<T extends object>(clave: string, inicial: T) {
  const llave = `rscll-borrador:${clave}`;
  const [valor, setValor] = useState<T>(() => {
    try {
      const g = localStorage.getItem(llave);
      return g ? { ...inicial, ...JSON.parse(g) } : inicial;
    } catch {
      return inicial;
    }
  });
  const cambiar = useCallback(
    (cambios: Partial<T>) =>
      setValor((v) => {
        const n = { ...v, ...cambios };
        try {
          localStorage.setItem(llave, JSON.stringify(n));
        } catch {
          /* sin almacenamiento local */
        }
        return n;
      }),
    [llave],
  );
  const limpiar = useCallback(() => {
    try {
      localStorage.removeItem(llave);
    } catch {
      /* sin almacenamiento local */
    }
    setValor(inicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llave]);
  return [valor, cambiar, limpiar] as const;
}
