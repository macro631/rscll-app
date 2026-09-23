import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSesion } from '../../auth';
import { useAviso } from '../../components/Aviso';
import { EstadoBadge } from '../../components/Estado';
import { ObservacionEnCola, ObservacionForm, ObservacionItem } from '../../components/Observacion';
import { sectoresTexto } from '../../components/Recintos';
import { api } from '../../lib/backend';
import { descartar, encolar, useCola } from '../../lib/cola';
import { useAccion, useCatalogo, useEstados, useFichaRecinto } from '../../lib/datos';
import { fecha } from '../../lib/formato';
import { ACCIONES, type Revision } from '../../lib/tipos';

export function RecintoFicha() {
  const { codigo } = useParams();
  const navegar = useNavigate();
  const aviso = useAviso();
  const { perfil, puede } = useSesion();
  const { porCodigo, isLoading } = useCatalogo();
  const { mapa } = useEstados();
  const recinto = codigo ? porCodigo.get(codigo) : undefined;
  const ficha = useFichaRecinto(recinto?.id);
  const accion = useAccion();
  const qc = useQueryClient();
  const colaInspeccion = useCola().filter((i) => i.tipo === 'inspeccion' && i.recintoId === recinto?.id);
  const [defecto, setDefecto] = useState(false);
  const [abriendo, setAbriendo] = useState(false);

  if (isLoading || ficha.isLoading) return <p className="cargando">Cargando ficha…</p>;
  if (!recinto) return <p className="error-texto">Recinto {codigo} no encontrado.</p>;
  if (ficha.error || !ficha.data) return <p className="error-texto">{ficha.error?.message}</p>;

  const { estado, recepcion, revisiones, observaciones, movimientos } = ficha.data;
  const misAbiertas = mapa.get(recinto.id)?.mis_abiertas ?? [];
  const pendientes = observaciones.filter((o) => o.estado === 'pendiente');
  const subsanadas = observaciones.filter((o) => o.estado === 'subsanada');
  const superficie = recinto.sectores.map((s) => s.superficie).find((s) => s != null);

  async function iniciar() {
    setAbriendo(true);
    try {
      const id = await api().rpc<string>('abrir_revision', { p_recinto: recinto!.id });
      void qc.invalidateQueries();
      navegar(`/revision/ficha/${id}`);
    } catch (e) {
      aviso(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setAbriendo(false);
    }
  }

  return (
    <div className="ficha">
      <header className="ficha-cabecera">
        <Link to="/revision" className="volver">← Revisión</Link>
        <h1>
          <span className="ficha-codigo">{recinto.codigo}</span> {recinto.nombre}
        </h1>
        <p className="suave">
          {sectoresTexto(recinto)} · {recinto.tipo}
          {superficie != null && <> · {superficie} m²</>}
        </p>
        <div className="fila-badges">
          <EstadoBadge estado={estado.estado} />
          <span className="suave">
            {estado.pendientes} pendiente(s) · {estado.subsanadas} subsanada(s)
          </span>
        </div>
        {recepcion && (
          <p className="nota nota-exito">
            Recepcionado por {recepcion.inspector} el {fecha(recepcion.fecha)}. Calidad prepara el acta de recepción.
          </p>
        )}
      </header>

      <section className="acciones-principales">
        {puede('admin', 'revisor') &&
          (misAbiertas.length > 0 ? (
            <button className="boton boton-primario boton-grande" onClick={() => navegar(`/revision/ficha/${misAbiertas[0]}`)}>
              Continuar mi revisión
            </button>
          ) : (
            <button className="boton boton-primario boton-grande" onClick={() => void iniciar()} disabled={abriendo}>
              {abriendo ? 'Abriendo…' : 'Iniciar revisión'}
            </button>
          ))}
        {puede('inspeccion') && estado.estado === 'listo' && (
          <button
            className="boton boton-recepcion boton-grande"
            disabled={accion.isPending}
            onClick={() => accion.mutate({ fn: 'recepcionar', args: { p_recinto: recinto.id }, ok: `${recinto.codigo} recepcionado` })}
          >
            ✔ Recepcionar
          </button>
        )}
        {puede('inspeccion') && (estado.estado === 'listo' || estado.estado === 'recepcionado') && !defecto && (
          <button className="boton" onClick={() => setDefecto(true)}>
            Registrar defecto sin observación previa
          </button>
        )}
      </section>

      {defecto && (
        <section className="tarjeta">
          <h2>Observación de Inspección</h2>
          <p className="suave pequeño">
            Para un defecto que ninguna observación registrada cubre. Si ya existe una observación, comente sobre ella.
          </p>
          <ObservacionForm
            clave={`inspeccion:${recinto.id}`}
            textoBoton="Registrar y devolver a pendiente"
            alCancelar={() => setDefecto(false)}
            alGuardar={async (d) => {
              await encolar({ tipo: 'inspeccion', recintoId: recinto.id, especialidad: d.especialidad, descripcion: d.descripcion, fotos: d.fotos });
              setDefecto(false);
              aviso('Observación de Inspección registrada');
            }}
          />
        </section>
      )}

      <section>
        <h2>Pendientes ({pendientes.length + colaInspeccion.length})</h2>
        <div className="lista-obs">
          {colaInspeccion.map((i) => (
            <ObservacionEnCola key={i.id} item={i} alDescartar={() => descartar(i.id)} />
          ))}
          {pendientes.length === 0 && colaInspeccion.length === 0 && <p className="vacio">Sin observaciones pendientes.</p>}
          {pendientes.map((o) => (
            <ObservacionItem key={o.id} obs={o} acciones={{ comprobar: true, devolver: true }} />
          ))}
        </div>
      </section>

      {subsanadas.length > 0 && (
        <section>
          <details>
            <summary><h2 className="en-linea">Subsanadas ({subsanadas.length})</h2></summary>
            <div className="lista-obs">
              {subsanadas.map((o) => (
                <ObservacionItem key={o.id} obs={o} acciones={{ devolver: true }} />
              ))}
            </div>
          </details>
        </section>
      )}

      <section>
        <h2>Fichas de revisión ({revisiones.length})</h2>
        {revisiones.length === 0 && <p className="vacio">Aún no hay revisiones de este recinto.</p>}
        <div className="lista-fichas">
          {revisiones.map((r) => (
            <FilaFicha key={r.id} r={r} esAdmin={perfil?.rol === 'admin'} />
          ))}
        </div>
      </section>

      {movimientos.length > 0 && (
        <section>
          <details>
            <summary><h2 className="en-linea">Movimientos</h2></summary>
            <ul className="movimientos">
              {movimientos.map((m, i) => (
                <li key={i}>
                  <span className="suave pequeño">{fecha(m.fecha)}</span> {ACCIONES[m.accion] ?? m.accion}
                  {m.actor && <span className="suave"> · {m.actor}</span>}
                  {m.comentario && <span className="suave"> — {m.comentario}</span>}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}

function FilaFicha({ r, esAdmin }: { r: Revision; esAdmin: boolean }) {
  const accion = useAccion();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');

  function anular(e: FormEvent) {
    e.preventDefault();
    accion.mutate(
      { fn: 'anular_revision', args: { p_revision: r.id, p_motivo: motivo }, ok: 'Ficha anulada. Puede revertirlo desde esta misma lista.' },
      { onSuccess: () => setAnulando(false) },
    );
  }

  return (
    <div className={`fila-ficha condicion-borde-${r.condicion}`}>
      <div className="fila-ficha-texto">
        <Link to={`/revision/ficha/${r.id}`}>
          <strong>{r.autor}</strong>
          {r.origen === 'inspeccion' && <span className="etiqueta">Inspección</span>}
        </Link>
        <span className="suave pequeño">
          {fecha(r.inicio)}
          {r.fin && <> → {fecha(r.fin)}</>} · {r.observaciones} obs. · {r.pendientes} pend.
        </span>
        {r.condicion === 'anulada' && <span className="pequeño peligro">Anulada: {r.motivo_anulacion}</span>}
      </div>
      <span className={`condicion condicion-${r.condicion}`}>
        {r.condicion === 'abierta' ? 'Abierta' : r.condicion === 'finalizada' ? 'Finalizada' : 'Anulada'}
      </span>
      {esAdmin && (
        <div className="acciones">
          {r.condicion === 'finalizada' && r.origen === 'ordinaria' && (
            <button className="boton boton-chico" disabled={accion.isPending}
              onClick={() => accion.mutate({ fn: 'reabrir_revision', args: { p_revision: r.id }, ok: 'Ficha reabierta' })}>
              Reabrir
            </button>
          )}
          {r.condicion !== 'anulada' && !anulando && (
            <button className="boton boton-chico" onClick={() => setAnulando(true)}>Anular</button>
          )}
          {r.condicion === 'anulada' && (
            <button className="boton boton-chico" disabled={accion.isPending}
              onClick={() => accion.mutate({ fn: 'revertir_anulacion', args: { p_revision: r.id }, ok: 'Anulación revertida' })}>
              Revertir anulación
            </button>
          )}
        </div>
      )}
      {anulando && (
        <form className="formulario fila-ficha-anular" onSubmit={anular}>
          <input required autoFocus placeholder="Motivo de la anulación" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="acciones">
            <button className="boton boton-peligro" disabled={accion.isPending}>Anular ficha</button>
            <button type="button" className="boton" onClick={() => setAnulando(false)}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
