import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSesion } from '../../auth';
import { useAviso } from '../../components/Aviso';
import { Cajetin } from '../../components/Cajetin';
import { Icono } from '../../components/Icono';
import { ObservacionEnCola, ObservacionForm, ObservacionItem } from '../../components/Observacion';
import { sectoresTexto } from '../../components/Recintos';
import { api } from '../../lib/backend';
import { descartar, encolar, useCola } from '../../lib/cola';
import { refrescar, useAccion, useCatalogo, useEstados, useFichaRecinto } from '../../lib/datos';
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
  if (!recinto) return <p className="error-texto">No existe el recinto {codigo}.</p>;
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
      refrescar(qc);
      navegar(`/revision/ficha/${id}`);
    } catch (e) {
      aviso(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setAbriendo(false);
    }
  }

  const acciones = (
    <div className="acciones-principales">
      {puede('admin', 'revisor', 'inspeccion') &&
        (misAbiertas.length > 0 ? (
          <button className="boton boton-primario boton-alto" onClick={() => navegar(`/revision/ficha/${misAbiertas[0]}`)}>
            Continuar mi revisión
          </button>
        ) : (
          <button className="boton boton-primario boton-alto" onClick={() => void iniciar()} disabled={abriendo}>
            {abriendo ? 'Abriendo…' : 'Iniciar revisión'}
          </button>
        ))}
      {puede('inspeccion') && estado.estado === 'listo' && (
        <button
          className="boton boton-recepcion boton-alto"
          disabled={accion.isPending}
          onClick={() => accion.mutate({ fn: 'recepcionar', args: { p_recinto: recinto.id }, ok: `${recinto.codigo} recepcionado` })}
        >
          <Icono nombre="check" />
          Recepcionar
        </button>
      )}
      {puede('inspeccion') && (estado.estado === 'listo' || estado.estado === 'recepcionado') && (
        <button className="boton boton-sutil boton-alto" onClick={() => setDefecto(true)}>
          Registrar defecto nuevo
        </button>
      )}
    </div>
  );

  return (
    <div className="ficha">
      <Link to="/revision" className="volver">
        <Icono nombre="volver" tam={18} />
        Revisión
      </Link>
      <Cajetin
        codigo={recinto.codigo}
        nombre={recinto.nombre}
        estado={estado.estado}
        datos={[
          { etiqueta: 'Sector', valor: sectoresTexto(recinto) },
          { etiqueta: 'Tipo', valor: recinto.tipo },
          ...(superficie != null ? [{ etiqueta: 'Superficie', valor: `${superficie} m²` }] : []),
        ]}
      >
        <span className="chico">
          {estado.pendientes} pendiente{estado.pendientes === 1 ? '' : 's'} · {estado.subsanadas} subsanada{estado.subsanadas === 1 ? '' : 's'}
        </span>
      </Cajetin>
      {recepcion && (
        <p className="nota nota-ok chico">
          Recepcionado por {recepcion.inspector} el {fecha(recepcion.fecha)}. Calidad prepara el acta de recepción.
        </p>
      )}
      {acciones}

      <div className="ficha-cuerpo">
        <div>
          <div className="seccion-titulo">
            <h2>Pendientes</h2>
            <span className="suave chico">{pendientes.length + colaInspeccion.length}</span>
          </div>
          <div className="lista-obs">
            {colaInspeccion.map((i) => (
              <ObservacionEnCola key={i.id} item={i} alDescartar={() => descartar(i.id)} />
            ))}
            {pendientes.length === 0 && colaInspeccion.length === 0 && <p className="vacio">No hay observaciones pendientes.</p>}
            {pendientes.map((o) => (
              <ObservacionItem key={o.id} obs={o} acciones={{ comprobar: true, devolver: true }} />
            ))}
          </div>

          {subsanadas.length > 0 && (
            <details className="plegable" style={{ marginTop: '1rem' }}>
              <summary>
                <h2>Subsanadas</h2>
                <span className="suave chico">{subsanadas.length}</span>
                <Icono nombre="abajo" tam={18} />
              </summary>
              <div className="lista-obs">
                {subsanadas.map((o) => (
                  <ObservacionItem key={o.id} obs={o} acciones={{ devolver: true }} />
                ))}
              </div>
            </details>
          )}
        </div>

        <aside className="ficha-lateral">
          <div className="seccion-titulo">
            <h2>Fichas de revisión</h2>
            <span className="suave chico">{revisiones.length}</span>
          </div>
          {revisiones.length === 0 && <p className="suave chico">Aún nadie ha revisado este recinto.</p>}
          <div className="lista-fichas">
            {revisiones.map((r) => (
              <FilaFicha key={r.id} r={r} esAdmin={perfil?.rol === 'admin'} />
            ))}
          </div>

          {movimientos.length > 0 && (
            <details className="plegable" style={{ marginTop: '1rem' }}>
              <summary>
                <h2>Movimientos</h2>
                <Icono nombre="abajo" tam={18} />
              </summary>
              <ul className="movimientos">
                {movimientos.map((m, i) => (
                  <li key={i}>
                    <time>{fecha(m.fecha)}</time>
                    {ACCIONES[m.accion] ?? m.accion}
                    {m.actor && <span className="suave">, {m.actor}</span>}
                    {m.comentario && <span className="suave"> — {m.comentario}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </aside>
      </div>

      {defecto && (
        <ObservacionForm
          clave={`inspeccion:${recinto.id}`}
          titulo="Defecto nuevo de Inspección"
          codigo={recinto.codigo}
          textoGuardar="Registrar y devolver"
          permitirOtra={false}
          existentes={observaciones}
          alCerrar={() => setDefecto(false)}
          alGuardar={async (d) => {
            await encolar({ tipo: 'inspeccion', recintoId: recinto.id, especialidad: d.especialidad, descripcion: d.descripcion, fotos: d.fotos });
            aviso('Defecto registrado; el recinto vuelve a pendiente');
          }}
        />
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
    <div className="fila-ficha">
      <div className="fila-ficha-texto">
        <Link to={`/revision/ficha/${r.id}`}>
          {r.autor}
          {r.origen === 'inspeccion' && <span className="etiqueta">Inspección</span>}
        </Link>
        <span className="suave mini">
          {fecha(r.inicio)}
          {r.fin && <> → {fecha(r.fin)}</>}
        </span>
        <span className="suave mini">
          {r.observaciones} observación{r.observaciones === 1 ? '' : 'es'}, {r.pendientes} pendiente{r.pendientes === 1 ? '' : 's'}
        </span>
        {r.condicion === 'anulada' && <span className="mini error-texto">Anulada: {r.motivo_anulacion}</span>}
      </div>
      <span className={`condicion condicion-${r.condicion}`}>
        {r.condicion === 'abierta' ? 'Abierta' : r.condicion === 'finalizada' ? 'Finalizada' : 'Anulada'}
      </span>
      {esAdmin && !anulando && (
        <div className="acciones" style={{ flexBasis: '100%' }}>
          {r.condicion === 'finalizada' && r.origen === 'ordinaria' && (
            <button className="boton boton-sutil boton-chico" disabled={accion.isPending}
              onClick={() => accion.mutate({ fn: 'reabrir_revision', args: { p_revision: r.id }, ok: 'Ficha reabierta' })}>
              Reabrir
            </button>
          )}
          {r.condicion !== 'anulada' && (
            <button className="boton boton-sutil boton-chico" onClick={() => setAnulando(true)}>Anular</button>
          )}
          {r.condicion === 'anulada' && (
            <button className="boton boton-sutil boton-chico" disabled={accion.isPending}
              onClick={() => accion.mutate({ fn: 'revertir_anulacion', args: { p_revision: r.id }, ok: 'Anulación revertida' })}>
              Revertir anulación
            </button>
          )}
        </div>
      )}
      {anulando && (
        <form className="formulario fila-ficha-anular" onSubmit={anular}>
          <input required autoFocus placeholder="Motivo de la anulación" aria-label="Motivo de la anulación" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="acciones">
            <button className="boton boton-peligro lleno boton-chico" disabled={accion.isPending}>Anular ficha</button>
            <button type="button" className="boton boton-sutil boton-chico" onClick={() => setAnulando(false)}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
