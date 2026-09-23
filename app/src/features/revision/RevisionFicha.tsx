import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSesion } from '../../auth';
import { useAviso } from '../../components/Aviso';
import { EstadoBadge } from '../../components/Estado';
import { ObservacionEnCola, ObservacionForm, ObservacionItem } from '../../components/Observacion';
import { descartar, encolar, useCola } from '../../lib/cola';
import { useAccion, useCatalogo, useFichaRevision } from '../../lib/datos';
import { fecha } from '../../lib/formato';

export function RevisionFicha() {
  const { id } = useParams();
  const navegar = useNavigate();
  const aviso = useAviso();
  const { perfil } = useSesion();
  const { porId } = useCatalogo();
  const ficha = useFichaRevision(id);
  const accion = useAccion();
  const cola = useCola().filter((i) => i.revisionId === id);
  const [formulario, setFormulario] = useState(true);

  if (ficha.isLoading) return <p className="cargando">Cargando ficha…</p>;
  if (ficha.error || !ficha.data) return <p className="error-texto">{ficha.error?.message ?? 'Ficha no encontrada'}</p>;

  const { revision, observaciones, estado } = ficha.data;
  const recinto = porId.get(revision.recinto_id);
  const propia = revision.autor_id === perfil?.id;
  const editable = propia && revision.condicion === 'abierta';

  function finalizar() {
    accion.mutate(
      { fn: 'finalizar_revision', args: { p_revision: revision.id } },
      {
        onSuccess: () => {
          aviso(`Revisión de ${recinto?.codigo ?? ''} finalizada`);
          navegar('/inicio');
        },
      },
    );
  }

  return (
    <div className="ficha">
      <header className="ficha-cabecera">
        <Link to={recinto ? `/revision/recinto/${encodeURIComponent(recinto.codigo)}` : '/revision'} className="volver">
          ← Ficha del recinto
        </Link>
        <h1>
          <span className="ficha-codigo">{recinto?.codigo}</span> {recinto?.nombre}
        </h1>
        <p className="suave">
          {revision.origen === 'inspeccion' ? 'Ficha de Inspección' : 'Ficha de revisión'} de {revision.autor} · inicio {fecha(revision.inicio)}
          {revision.fin && <> · fin {fecha(revision.fin)}</>}
        </p>
        <div className="fila-badges">
          <span className={`condicion condicion-${revision.condicion}`}>
            {revision.condicion === 'abierta' ? 'Abierta' : revision.condicion === 'finalizada' ? 'Finalizada' : 'Anulada'}
          </span>
          <span className="suave">Recinto:</span>
          <EstadoBadge estado={estado?.estado} />
        </div>
        {revision.condicion === 'anulada' && <p className="nota">Anulada: {revision.motivo_anulacion}</p>}
      </header>

      {editable && (
        <section className="tarjeta">
          {formulario ? (
            <ObservacionForm
              clave={`revision:${revision.id}`}
              alCancelar={() => setFormulario(false)}
              alGuardar={async (d) => {
                await encolar({
                  tipo: 'observacion',
                  recintoId: revision.recinto_id,
                  revisionId: revision.id,
                  especialidad: d.especialidad,
                  descripcion: d.descripcion,
                  fotos: d.fotos,
                });
                aviso(navigator.onLine ? 'Observación guardada' : 'Guardada en el teléfono; se enviará al tener conexión');
              }}
            />
          ) : (
            <button className="boton boton-primario boton-grande" onClick={() => setFormulario(true)}>
              + Agregar observación
            </button>
          )}
        </section>
      )}

      <section>
        <h2>Observaciones de esta ficha ({observaciones.length + cola.length})</h2>
        {observaciones.length + cola.length === 0 && (
          <p className="vacio">Sin observaciones. Puede finalizar la revisión si el recinto no presenta defectos.</p>
        )}
        <div className="lista-obs">
          {cola.map((i) => (
            <ObservacionEnCola key={i.id} item={i} alDescartar={() => descartar(i.id)} />
          ))}
          {[...observaciones].reverse().map((o) => (
            <ObservacionItem key={o.id} obs={o} acciones={{ editar: editable, comprobar: true, devolver: true }} />
          ))}
        </div>
      </section>

      {editable && (
        <div className="barra-inferior">
          <button className="boton boton-exito boton-grande" onClick={finalizar} disabled={accion.isPending || cola.length > 0}>
            {cola.length > 0 ? 'Esperando sincronización…' : 'Finalizar revisión'}
          </button>
        </div>
      )}
    </div>
  );
}
