import { useId, useMemo, useState } from 'react';
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

const porcentaje = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)} %` : '—');

/**
 * Anillo de estados (parte del todo). Mismos colores y tramas que la planta, para que ámbar y verde claro
 * se distingan también sin color. Al pasar sobre un segmento, el centro muestra su cifra.
 */
function Torta({
  conteo,
  activo,
  alActivar,
}: {
  conteo: Conteo;
  activo: EstadoRecinto | null;
  alActivar: (e: EstadoRecinto | null) => void;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const T = 200;
  const c = T / 2;
  const rExt = 92;
  const rInt = 60;
  const punto = (r: number, f: number) => {
    const a = f * 2 * Math.PI - Math.PI / 2;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const circulo = (r: number) => `M${c - r} ${c} A${r} ${r} 0 1 1 ${c + r} ${c} A${r} ${r} 0 1 1 ${c - r} ${c} Z`;
  const arco = (f0: number, f1: number) => {
    // Un estado al 100 % es el anillo entero (dos círculos con relleno evenodd): sin costuras.
    if (f1 - f0 >= 0.9999) return `${circulo(rExt)} ${circulo(rInt)}`;
    const grande = f1 - f0 > 0.5 ? 1 : 0;
    const [x0, y0] = punto(rExt, f0);
    const [x1, y1] = punto(rExt, f1);
    const [x2, y2] = punto(rInt, f1);
    const [x3, y3] = punto(rInt, f0);
    return `M${x0} ${y0} A${rExt} ${rExt} 0 ${grande} 1 ${x1} ${y1} L${x2} ${y2} A${rInt} ${rInt} 0 ${grande} 0 ${x3} ${y3} Z`;
  };
  const relleno = (e: EstadoRecinto) =>
    e === 'pendiente' ? `url(#${id}-pendiente)` : e === 'recepcionado' ? `url(#${id}-recepcionado)` : `var(--estado-${e})`;

  const segmentos: { e: EstadoRecinto; d: string }[] = [];
  let acumulado = 0;
  for (const e of ORDEN_ESTADOS) {
    const n = conteo.porEstado[e];
    if (!n) continue;
    segmentos.push({ e, d: arco(acumulado / conteo.total, (acumulado + n) / conteo.total) });
    acumulado += n;
  }
  const resumen = ORDEN_ESTADOS.map((e) => `${conteo.porEstado[e]} ${ESTADOS[e].corto.toLowerCase()}`).join(', ');

  return (
    <div className="torta">
      <svg viewBox={`0 0 ${T} ${T}`} role="img" aria-label={`Recintos por estado: ${resumen}`}>
        <defs>
          <pattern id={`${id}-pendiente`} patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
            <rect width="7" height="7" style={{ fill: 'var(--estado-pendiente)' }} />
            <line x1="0" y1="0" x2="0" y2="7" style={{ stroke: 'var(--estado-pendiente-trama)', strokeWidth: 2.5 }} />
          </pattern>
          <pattern id={`${id}-recepcionado`} patternUnits="userSpaceOnUse" width="7" height="7">
            <rect width="7" height="7" style={{ fill: 'var(--estado-recepcionado)' }} />
            <circle cx="3.5" cy="3.5" r="1.1" style={{ fill: 'var(--estado-recepcionado-trama)' }} />
          </pattern>
        </defs>
        {conteo.total === 0 && <circle cx={c} cy={c} r={(rExt + rInt) / 2} className="torta-vacia" strokeWidth={rExt - rInt} />}
        {segmentos.map(({ e, d }) => (
          <path
            key={e}
            d={d}
            className={`torta-segmento${activo && activo !== e ? ' atenuado' : ''}`}
            style={{ fill: relleno(e) }}
            fillRule="evenodd"
            tabIndex={0}
            aria-label={`${ESTADOS[e].nombre}: ${conteo.porEstado[e]} (${porcentaje(conteo.porEstado[e], conteo.total)})`}
            onMouseEnter={() => alActivar(e)}
            onMouseLeave={() => alActivar(null)}
            onFocus={() => alActivar(e)}
            onBlur={() => alActivar(null)}
          >
            <title>{`${ESTADOS[e].nombre}: ${conteo.porEstado[e]} (${porcentaje(conteo.porEstado[e], conteo.total)})`}</title>
          </path>
        ))}
      </svg>
      <div className="torta-centro" aria-hidden="true">
        {activo ? (
          <>
            <strong>{conteo.porEstado[activo]}</strong>
            <span>{ESTADOS[activo].corto}</span>
            <span className="tenue">{porcentaje(conteo.porEstado[activo], conteo.total)}</span>
          </>
        ) : (
          <>
            <strong>{conteo.total}</strong>
            <span>unidades</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Resumen (escritorio): anillo de estados y tabla con cantidad, porcentaje y barra, enlazados al pasar el cursor. */
export function ResumenEstados({ recintos, estados, sector, titulo }: PropsConteo & { titulo: string }) {
  const c = useMemo(() => contar(recintos, estados, sector), [recintos, estados, sector]);
  const [activo, setActivo] = useState<EstadoRecinto | null>(null);
  return (
    <section className="resumen" aria-label="Indicadores">
      <div className="resumen-cabeza">
        <h2>{titulo}</h2>
      </div>
      <Torta conteo={c} activo={activo} alActivar={setActivo} />
      <ul>
        {ORDEN_ESTADOS.map((e) => (
          <li
            key={e}
            className={activo === e ? 'activo' : undefined}
            onMouseEnter={() => setActivo(e)}
            onMouseLeave={() => setActivo(null)}
          >
            <span className={`estado-marca marca-${e}`} aria-hidden="true" />
            <span>{ESTADOS[e].nombre}</span>
            <span className="resumen-num">{c.porEstado[e]}</span>
            <span className="resumen-pct">{porcentaje(c.porEstado[e], c.total)}</span>
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
