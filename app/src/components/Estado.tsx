import { useMemo } from 'react';
import { ESTADOS, ORDEN_ESTADOS, type EstadoFila, type EstadoRecinto, type Recinto } from '../lib/tipos';

export function MarcaEstado({ estado }: { estado: EstadoRecinto }) {
  return <span className={`estado-marca marca-${estado}`} aria-hidden="true" />;
}

/** Estado con muestra de color, trama y nombre: el color nunca es la única señal (§6.1). */
export function EstadoBadge({ estado, corto = false }: { estado: EstadoRecinto | undefined; corto?: boolean }) {
  const e = estado ?? 'sin_revisar';
  return (
    <span className={`estado estado-${e}`}>
      <MarcaEstado estado={e} />
      {corto ? ESTADOS[e].corto : ESTADOS[e].nombre}
    </span>
  );
}

export interface Conteo {
  total: number;
  porEstado: Record<EstadoRecinto, number>;
  observacionesPendientes: number;
}

/** Indicadores con la misma regla que las plantas; el global cuenta E1 y E2 una sola vez (§6.2). */
export function contar(recintos: Recinto[], estados: Map<string, EstadoFila>, sector: string | null): Conteo {
  const porEstado = Object.fromEntries(ORDEN_ESTADOS.map((e) => [e, 0])) as Record<EstadoRecinto, number>;
  let total = 0;
  let observacionesPendientes = 0;
  for (const r of recintos) {
    if (sector && !r.sectores.some((s) => s.sector === sector)) continue;
    const e = estados.get(r.id);
    total++;
    porEstado[e?.estado ?? 'sin_revisar']++;
    observacionesPendientes += e?.pendientes ?? 0;
  }
  return { total, porEstado, observacionesPendientes };
}

interface PropsConteo {
  recintos: Recinto[];
  estados: Map<string, EstadoFila>;
  sector: string | null;
}

// Rótulos de la franja con guiones opcionales (U+00AD) para que corten bien en celdas angostas.
const ROTULO_FRANJA = {
  sin_revisar: 'Sin revisar',
  en_revision: 'En revisión',
  pendiente: 'Con pen­dientes',
  listo: 'Listos',
  recepcionado: 'Recepcio­nados',
} as const;

/** Franja compacta (teléfono): cuenta por estado y a la vez hace de leyenda. */
export function FranjaEstados({ recintos, estados, sector }: PropsConteo) {
  const c = useMemo(() => contar(recintos, estados, sector), [recintos, estados, sector]);
  return (
    <div className="franja" role="group" aria-label={`Recintos por estado (${c.total} unidades)`}>
      {ORDEN_ESTADOS.map((e) => (
        <div key={e} title={ESTADOS[e].nombre}>
          <span className="franja-num">
            <span className={`estado-marca marca-${e}`} aria-hidden="true" />
            {c.porEstado[e]}
          </span>
          <span className="franja-nombre">{ROTULO_FRANJA[e]}</span>
        </div>
      ))}
      <div className="franja-obs">
        <span className="franja-num">{c.observacionesPendientes}</span>
        <span className="franja-nombre">Obs. pend.</span>
      </div>
    </div>
  );
}

/** Resumen (escritorio): leyenda con cuentas y proporción por estado. */
export function ResumenEstados({ recintos, estados, sector, titulo }: PropsConteo & { titulo: string }) {
  const c = useMemo(() => contar(recintos, estados, sector), [recintos, estados, sector]);
  return (
    <section className="resumen" aria-label="Indicadores">
      <div className="resumen-cabeza">
        <h2>{titulo}</h2>
        <span className="suave chico">{c.total} unidades</span>
      </div>
      <ul>
        {ORDEN_ESTADOS.map((e) => (
          <li key={e}>
            <span className={`estado-marca marca-${e}`} aria-hidden="true" />
            <span>{ESTADOS[e].nombre}</span>
            <span className="resumen-num">{c.porEstado[e]}</span>
            <span className="resumen-barra" aria-hidden="true">
              <i style={{ width: `${c.total ? (c.porEstado[e] / c.total) * 100 : 0}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <div className="resumen-pie">
        <span>Observaciones pendientes</span>
        <span className="resumen-num">{c.observacionesPendientes}</span>
      </div>
    </section>
  );
}
