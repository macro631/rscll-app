import { useMemo, useState, type ReactNode } from 'react';
import { EstadoBadge } from './Estado';
import { Icono } from './Icono';
import { SECTORES, type EstadoFila, type Recinto } from '../lib/tipos';

export function normalizar(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function coincide(r: Recinto, texto: string) {
  const q = normalizar(texto.trim());
  if (!q) return true;
  return normalizar(r.codigo).includes(q) || normalizar(r.nombre).includes(q);
}

export function sectoresTexto(r: Recinto) {
  return r.sectores.map((s) => SECTORES.find((x) => x.id === s.sector)?.corto ?? s.sector).join(' y ');
}

/** Buscador por código o nombre; muestra siempre el nombre completo junto al código. */
export function RecintoBuscador({
  recintos,
  estados,
  onElegir,
  placeholder = 'Buscar recinto',
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
      <div className="campo-icono">
        <Icono nombre="buscar" tam={20} />
        <input
          type="search"
          value={texto}
          placeholder={placeholder}
          aria-label="Buscar recinto por código o nombre"
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && resultados[0]) elegir(resultados[0]);
            if (e.key === 'Escape') setAbierto(false);
          }}
        />
      </div>
      {abierto && resultados.length > 0 && (
        <ul className="buscador-resultados" role="listbox">
          {resultados.map((r) => (
            <li key={r.id}>
              <button role="option" aria-selected="false" onClick={() => elegir(r)}>
                <span>
                  <span className="codigo">{r.codigo}</span> {r.nombre}
                  <span className="fila-recinto-sub">{sectoresTexto(r)}</span>
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

/** Fila de recinto: barra de color, código tipo rótulo, nombre completo y estado. */
export function FilaRecinto({
  recinto,
  estado,
  onAbrir,
  extra,
}: {
  recinto: Recinto;
  estado: EstadoFila | undefined;
  onAbrir?: () => void;
  extra?: ReactNode;
}) {
  const e = estado?.estado ?? 'sin_revisar';
  const cuerpo = (
    <>
      <span className={`fila-recinto-barra barra-${e}`} aria-hidden="true" />
      <span className="codigo">{recinto.codigo}</span>
      <span>
        <span className="fila-recinto-nombre">{recinto.nombre}</span>
        <span className="fila-recinto-sub">
          {sectoresTexto(recinto)}
          {extra}
        </span>
      </span>
      <span className="fila-recinto-estado">
        <EstadoBadge estado={e} corto />
        {!!estado?.pendientes && <span className="mini">{estado.pendientes} pendiente{estado.pendientes > 1 ? 's' : ''}</span>}
      </span>
    </>
  );
  return onAbrir ? (
    <button className="fila-recinto" onClick={onAbrir}>
      {cuerpo}
    </button>
  ) : (
    <div className="fila-recinto">{cuerpo}</div>
  );
}
