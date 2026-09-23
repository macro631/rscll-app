import { useMemo } from 'react';
import { ESTADOS, ORDEN_ESTADOS, SECTORES, type EstadoFila, type EstadoRecinto, type Recinto } from '../lib/tipos';

export function EstadoBadge({ estado, corto = false }: { estado: EstadoRecinto | undefined; corto?: boolean }) {
  const e = estado ?? 'sin_revisar';
  return (
    <span className={`badge badge-${e}`}>
      <span aria-hidden="true" className="badge-icono">{ESTADOS[e].icono}</span>
      {corto ? ESTADOS[e].corto : ESTADOS[e].nombre}
    </span>
  );
}

export function Leyenda() {
  return (
    <details className="leyenda" open>
      <summary>Leyenda</summary>
      <ul>
        {ORDEN_ESTADOS.map((e) => (
          <li key={e}>
            <span className={`muestra muestra-${e}`} aria-hidden="true" />
            <span className="badge-icono" aria-hidden="true">{ESTADOS[e].icono}</span>
            {ESTADOS[e].nombre}
          </li>
        ))}
      </ul>
    </details>
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

export function Indicadores({
  recintos,
  estados,
  sector,
}: {
  recintos: Recinto[];
  estados: Map<string, EstadoFila>;
  sector: string | null;
}) {
  const c = useMemo(() => contar(recintos, estados, sector), [recintos, estados, sector]);
  const nombreSector = sector ? SECTORES.find((s) => s.id === sector)?.corto : null;
  return (
    <section className="indicadores" aria-label="Indicadores">
      <p className="indicadores-filtro">
        {nombreSector ? (
          <>Filtro: <strong>{nombreSector}</strong></>
        ) : (
          <>Total de la obra</>
        )}
      </p>
      <div className="indicadores-grilla">
        <div className="indicador">
          <span className="indicador-valor">{c.total}</span>
          <span className="indicador-nombre">Unidades</span>
        </div>
        {ORDEN_ESTADOS.map((e) => (
          <div key={e} className={`indicador indicador-${e}`}>
            <span className="indicador-valor">{c.porEstado[e]}</span>
            <span className="indicador-nombre">
              <span aria-hidden="true">{ESTADOS[e].icono} </span>
              {ESTADOS[e].corto}
            </span>
          </div>
        ))}
        <div className="indicador indicador-obs">
          <span className="indicador-valor">{c.observacionesPendientes}</span>
          <span className="indicador-nombre">Observaciones pendientes</span>
        </div>
      </div>
    </section>
  );
}
