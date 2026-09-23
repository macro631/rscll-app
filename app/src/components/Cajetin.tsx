import type { ReactNode } from 'react';
import { EstadoBadge } from './Estado';
import type { EstadoRecinto } from '../lib/tipos';

/** Bloque de título como el cajetín de un plano: código grande, nombre, datos y franja de estado. */
export function Cajetin({
  codigo,
  nombre,
  datos,
  estado,
  children,
  titulo = 'h1',
}: {
  codigo: string;
  nombre: string;
  datos: { etiqueta: string; valor: ReactNode }[];
  estado?: EstadoRecinto;
  children?: ReactNode;
  titulo?: 'h1' | 'p';
}) {
  const Nombre = titulo;
  return (
    <div className="cajetin">
      <div className="cajetin-codigo">{codigo}</div>
      <Nombre className="cajetin-nombre">{nombre}</Nombre>
      <dl className="cajetin-datos" style={{ margin: 0 }}>
        {datos.map((d) => (
          <div key={d.etiqueta}>
            <dt>{d.etiqueta}</dt>
            <dd>{d.valor}</dd>
          </div>
        ))}
      </dl>
      {(estado || children) && (
        <div className={`cajetin-estado${estado ? ` fondo-${estado}` : ''}`}>
          {estado && <EstadoBadge estado={estado} />}
          {children}
        </div>
      )}
    </div>
  );
}
