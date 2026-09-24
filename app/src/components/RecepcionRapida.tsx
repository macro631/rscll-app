import { useState } from 'react';
import { useAccion } from '../lib/datos';
import type { Recinto } from '../lib/tipos';
import { Icono } from './Icono';

/**
 * Recepción desde una lista o desde la planta, sin entrar a la ficha (Inspección).
 * Pide confirmar en la misma línea: una recepción por error no se puede deshacer si el recinto no tiene observaciones.
 */
export function RecepcionRapida({ recinto, ancho = false }: { recinto: Recinto; ancho?: boolean }) {
  const accion = useAccion();
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <button
        type="button"
        className={`boton boton-recepcion boton-chico${ancho ? ' boton-ancho' : ''}`}
        onClick={() => setConfirmando(true)}
        aria-label={`Recepcionar ${recinto.codigo}`}
      >
        <Icono nombre="check" tam={18} />
        Recepcionar
      </button>
    );
  }
  return (
    <div className={`recepcion-confirmar${ancho ? ' ancho' : ''}`} role="group" aria-label={`Confirmar recepción de ${recinto.codigo}`}>
      <span className="chico">¿Recepcionar {recinto.codigo}?</span>
      <button
        type="button"
        className="boton boton-recepcion boton-chico"
        disabled={accion.isPending}
        onClick={() =>
          accion.mutate(
            { fn: 'recepcionar', args: { p_recinto: recinto.id }, ok: `${recinto.codigo} recepcionado` },
            { onSettled: () => setConfirmando(false) },
          )
        }
      >
        Sí
      </button>
      <button type="button" className="boton boton-sutil boton-chico" onClick={() => setConfirmando(false)}>
        No
      </button>
    </div>
  );
}
