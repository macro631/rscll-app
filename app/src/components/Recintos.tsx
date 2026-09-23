import { useMemo, useState } from 'react';
import { EstadoBadge } from './Estado';
import type { EstadoFila, Recinto } from '../lib/tipos';

export function normalizar(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function coincide(r: Recinto, texto: string) {
  const q = normalizar(texto.trim());
  if (!q) return true;
  return normalizar(r.codigo).includes(q) || normalizar(r.nombre).includes(q);
}

export function sectoresTexto(r: Recinto) {
  return r.sectores.map((s) => s.sector).join(' · ');
}

/** Buscador por código o nombre; muestra siempre el nombre completo junto al código. */
export function RecintoBuscador({
  recintos,
  estados,
  onElegir,
  placeholder = 'Buscar recinto por código o nombre',
}: {
  recintos: Recinto[];
  estados: Map<string, EstadoFila>;
  onElegir: (r: Recinto) => void;
  placeholder?: string;
}) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const resultados = useMemo(() => (texto.trim() ? recintos.filter((r) => coincide(r, texto)).slice(0, 8) : []), [recintos, texto]);

  function elegir(r: Recinto) {
    onElegir(r);
    setTexto('');
    setAbierto(false);
  }

  return (
    <div className="buscador">
      <input
        type="search"
        value={texto}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && resultados[0]) elegir(resultados[0]);
          if (e.key === 'Escape') setAbierto(false);
        }}
      />
      {abierto && resultados.length > 0 && (
        <ul className="buscador-resultados" role="listbox">
          {resultados.map((r) => (
            <li key={r.id}>
              <button role="option" aria-selected="false" onClick={() => elegir(r)}>
                <span>
                  <strong>{r.codigo}</strong> · {r.nombre}
                  <span className="suave pequeño"> — {sectoresTexto(r)}</span>
                </span>
                <EstadoBadge estado={estados.get(r.id)?.estado} corto />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Fila compacta de recinto (listas de Revisión y Exteriores). */
export function FilaRecinto({
  recinto,
  estado,
  onAbrir,
  extra,
}: {
  recinto: Recinto;
  estado: EstadoFila | undefined;
  onAbrir?: () => void;
  extra?: React.ReactNode;
}) {
  const cuerpo = (
    <>
      <span className="fila-recinto-texto">
        <span className="fila-recinto-codigo">{recinto.codigo}</span>
        <span className="fila-recinto-nombre">{recinto.nombre}</span>
        <span className="suave pequeño">{sectoresTexto(recinto)}</span>
      </span>
      <span className="fila-recinto-estado">
        <EstadoBadge estado={estado?.estado} corto />
        {!!estado?.pendientes && <span className="suave pequeño">{estado.pendientes} pend.</span>}
        {extra}
      </span>
    </>
  );
  return onAbrir ? (
    <button className={`fila-recinto borde-${estado?.estado ?? 'sin_revisar'}`} onClick={onAbrir}>
      {cuerpo}
    </button>
  ) : (
    <div className={`fila-recinto borde-${estado?.estado ?? 'sin_revisar'}`}>{cuerpo}</div>
  );
}
