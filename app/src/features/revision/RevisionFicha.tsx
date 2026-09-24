import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSesion } from '../../auth';
import { useAviso } from '../../components/Aviso';
import { Cajetin } from '../../components/Cajetin';
import { Icono } from '../../components/Icono';
import { ObservacionEnCola, ObservacionForm, ObservacionItem } from '../../components/Observacion';
import { descartar, encolar, useCola } from '../../lib/cola';
import { useAccion, useCatalogo, useFichaRecinto, useFichaRevision } from '../../lib/datos';
import { fecha } from '../../lib/formato';

export function RevisionFicha() {
  const { id } = useParams();
  const navegar = useNavigate();
  const aviso = useAviso();
  const { perfil } = useSesion();
  const { porId } = useCatalogo();
  const ficha = useFichaRevision(id);
  // Todo el recinto (todas las fichas): se refresca en tiempo real cuando otra persona registra algo.
  const delRecinto = useFichaRecinto(ficha.data?.revision.recinto_id);
  const accion = useAccion();
  const cola = useCola().filter((i) => i.revisionId === id);
  const [formulario, setFormulario] = useState(false);
  const [nuevas, setNuevas] = useState<Set<string>>(new Set());
  const vistas = useRef<Set<string> | null>(null);
  const editable = !!ficha.data && ficha.data.revision.autor_id === perfil?.id && ficha.data.revision.condicion === 'abierta';

  const otras = useMemo(
    () => (delRecinto.data?.observaciones ?? []).filter((o) => o.revision_id !== id),
    [delRecinto.data, id],
  );
  const revisandoAhora = (delRecinto.data?.revisiones ?? []).filter(
    (r) => r.condicion === 'abierta' && r.autor_id !== perfil?.id,
  );

  // Aviso y resaltado cuando otra persona agrega una observación mientras se trabaja la ficha.
  useEffect(() => {
    if (!delRecinto.data) return;
    const ids = otras.map((o) => o.id);
    if (vistas.current === null) {
      vistas.current = new Set(ids);
      return;
    }
    const recien = otras.filter((o) => !vistas.current!.has(o.id));
    if (recien.length === 0) return;
    recien.forEach((o) => vistas.current!.add(o.id));
    setNuevas((n) => new Set([...n, ...recien.map((o) => o.id)]));
    const o = recien[recien.length - 1];
    aviso(
      recien.length === 1
        ? `${o.autor} registró N° ${o.numero}: ${o.especialidad}`
        : `${recien.length} observaciones nuevas de otras personas en este recinto`,
    );
  }, [otras, delRecinto.data, aviso]);

  // Abre el formulario la primera vez si la ficha propia está vacía: el siguiente paso es registrar.
  useEffect(() => {
    if (editable && ficha.data && ficha.data.observaciones.length === 0) setFormulario(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, ficha.data?.revision.id]);

  // Los avisos se ubican sobre la barra de acciones.
  useEffect(() => {
    if (!editable) return;
    document.body.classList.add('con-barra-acciones');
    return () => document.body.classList.remove('con-barra-acciones');
  }, [editable]);

  if (ficha.isLoading) return <p className="cargando">Cargando ficha…</p>;
  if (ficha.error || !ficha.data) return <p className="error-texto">{ficha.error?.message ?? 'No se encontró la ficha.'}</p>;

  const { revision, observaciones, estado } = ficha.data;
  const recinto = porId.get(revision.recinto_id);
  const total = observaciones.length + cola.length;
  const existentes = [...observaciones, ...otras];

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
      <Link to={recinto ? `/revision/recinto/${encodeURIComponent(recinto.codigo)}` : '/revision'} className="volver">
        <Icono nombre="volver" tam={18} />
        Ficha del recinto
      </Link>
      <Cajetin
        codigo={recinto?.codigo ?? ''}
        nombre={recinto?.nombre ?? ''}
        estado={estado?.estado}
        datos={[
          { etiqueta: revision.origen === 'inspeccion' ? 'Ficha de Inspección' : 'Revisión de', valor: revision.autor },
          { etiqueta: 'Inicio', valor: fecha(revision.inicio) },
          ...(revision.fin ? [{ etiqueta: 'Fin', valor: fecha(revision.fin) }] : []),
        ]}
      >
        <span className={`condicion condicion-${revision.condicion}`}>
          {revision.condicion === 'abierta' ? 'Ficha abierta' : revision.condicion === 'finalizada' ? 'Ficha finalizada' : 'Ficha anulada'}
        </span>
      </Cajetin>
      {revision.condicion === 'anulada' && <p className="nota nota-aviso">Anulada: {revision.motivo_anulacion}</p>}
      {revisandoAhora.length > 0 && (
        <p className="nota nota-conjunto">
          <Icono nombre="usuarios" tam={18} />
          <span>
            También revisando ahora: <strong>{revisandoAhora.map((r) => r.autor).join(', ')}</strong>. Sus observaciones aparecen
            aquí al instante.
          </span>
        </p>
      )}

      <div className="seccion-titulo">
        <h2>{editable ? 'Mis observaciones' : 'Observaciones de esta ficha'}</h2>
        <span className="suave chico">{total}</span>
      </div>
      {total === 0 && (
        <p className="vacio">
          {editable
            ? 'Aún no hay observaciones. Si el recinto no presenta defectos, puede finalizar la revisión.'
            : 'Esta ficha no tiene observaciones.'}
        </p>
      )}
      <div className="lista-obs">
        {cola.map((i) => (
          <ObservacionEnCola key={i.id} item={i} alDescartar={() => descartar(i.id)} />
        ))}
        {[...observaciones].reverse().map((o) => (
          <ObservacionItem key={o.id} obs={o} acciones={{ editar: editable, comprobar: true, devolver: true }} />
        ))}
      </div>

      {otras.length > 0 && (
        <section aria-live="polite">
          <div className="seccion-titulo">
            <h2>De otras personas en este recinto</h2>
            <span className="suave chico">{otras.length}</span>
          </div>
          <div className="lista-obs">
            {[...otras]
              .sort((a, b) => b.numero - a.numero)
              .map((o) => (
                <div key={o.id} className={nuevas.has(o.id) ? 'obs-recien' : undefined}>
                  <ObservacionItem obs={o} acciones={{ comprobar: true, devolver: true }} />
                </div>
              ))}
          </div>
        </section>
      )}

      {editable && (
        <>
          <div className="espaciador-acciones" />
          <div className="barra-acciones">
            <button className="boton boton-sutil boton-alto" onClick={finalizar} disabled={accion.isPending || cola.length > 0}>
              {cola.length > 0 ? 'Enviando…' : 'Finalizar revisión'}
            </button>
            <button className="boton boton-primario boton-alto" onClick={() => setFormulario(true)}>
              <Icono nombre="mas" />
              Observación
            </button>
          </div>
        </>
      )}

      {formulario && editable && (
        <ObservacionForm
          clave={`revision:${revision.id}`}
          titulo="Nueva observación"
          codigo={recinto?.codigo}
          existentes={existentes}
          alCerrar={() => setFormulario(false)}
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
      )}
    </div>
  );
}
