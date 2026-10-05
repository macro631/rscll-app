import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
  const { porId, recintos } = useCatalogo();
  const ficha = useFichaRevision(id);
  // Todo el recinto (todas las fichas): se refresca en tiempo real cuando otra persona registra algo.
  const delRecinto = useFichaRecinto(ficha.data?.revision.recinto_id);
  const accion = useAccion();
  const cola = useCola().filter((i) => i.revisionId === id);
  const [formulario, setFormulario] = useState(false);
  const [nuevas, setNuevas] = useState<Set<string>>(new Set());
  const vistas = useRef<Set<string> | null>(null);
  // Traslado por el Administrador de observaciones registradas en el recinto equivocado.
  const [trasladando, setTrasladando] = useState(false);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState('');
  const [motivo, setMotivo] = useState('');
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

  const puedeTrasladar = perfil?.rol === 'admin' && revision.condicion === 'finalizada' && observaciones.length > 0;

  function alternar(obsId: string) {
    setElegidas((e) => {
      const n = new Set(e);
      if (n.has(obsId)) n.delete(obsId);
      else n.add(obsId);
      return n;
    });
  }

  function cancelarTraslado() {
    setTrasladando(false);
    setElegidas(new Set());
  }

  function trasladar(e: FormEvent) {
    e.preventDefault();
    const n = elegidas.size;
    accion.mutate(
      {
        fn: 'mover_observaciones',
        args: { p_observaciones: [...elegidas], p_recinto: destino, p_motivo: motivo },
        ok: `${n} observación${n === 1 ? '' : 'es'} trasladada${n === 1 ? '' : 's'} a ${porId.get(destino)?.codigo ?? ''}`,
      },
      {
        onSuccess: (nueva) => {
          cancelarTraslado();
          navegar(`/revision/ficha/${nueva as string}`);
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
      {puedeTrasladar && !trasladando && (
        <div className="acciones">
          <button className="boton boton-sutil boton-chico" onClick={() => setTrasladando(true)}>
            Trasladar observaciones a otro recinto
          </button>
        </div>
      )}
      {puedeTrasladar && trasladando && (
        <form className="formulario" onSubmit={trasladar}>
          <p className="nota chico">
            Marque las observaciones registradas en el recinto equivocado. Pasan a una ficha nueva del recinto destino con el mismo
            autor y fechas, y conservan número, especialidad, descripción, estado, fotos y comentarios.
          </p>
          <select required aria-label="Recinto destino" value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">Recinto destino…</option>
            {recintos
              .filter((r) => r.id !== revision.recinto_id)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.codigo} · {r.nombre}
                </option>
              ))}
          </select>
          <input required placeholder="Motivo del traslado" aria-label="Motivo del traslado" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="acciones">
            <button className="boton boton-primario boton-chico" disabled={accion.isPending || elegidas.size === 0}>
              Trasladar {elegidas.size} seleccionada{elegidas.size === 1 ? '' : 's'}
            </button>
            <button type="button" className="boton boton-sutil boton-chico" onClick={cancelarTraslado}>
              Cancelar
            </button>
          </div>
        </form>
      )}
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
        {[...observaciones].reverse().map((o) =>
          trasladando ? (
            <div key={o.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                aria-label={`Seleccionar N° ${o.numero}`}
                checked={elegidas.has(o.id)}
                onChange={() => alternar(o.id)}
                style={{ marginTop: '1rem', width: '1.25rem', height: '1.25rem', flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <ObservacionItem obs={o} />
              </div>
            </div>
          ) : (
            <ObservacionItem key={o.id} obs={o} acciones={{ editar: editable, comprobar: true, devolver: true }} />
          ),
        )}
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
