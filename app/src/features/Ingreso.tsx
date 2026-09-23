import { useState, type FormEvent } from 'react';
import { api } from '../lib/backend';
import { useSesion } from '../auth';
import { Cajetin } from '../components/Cajetin';
import { ROLES } from '../lib/tipos';

export function Ingreso() {
  const { error: errorSesion } = useSesion();
  const b = api();
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await b.iniciarSesion(email, clave);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="ingreso">
      <div className="ingreso-caja">
        <Cajetin
          codigo="RSCLL"
          nombre="Reposición SubComisaría Llay Llay"
          titulo="p"
          datos={[
            { etiqueta: 'Uso', valor: 'Revisión de recintos y recepción' },
            { etiqueta: 'Emite', valor: 'Calidad' },
          ]}
        />
        <div className="ingreso-cuerpo">
          <h1 style={{ fontSize: '1.25rem' }}>Ingresar</h1>
          {(error || errorSesion) && <p className="error-texto" role="alert">{error ?? errorSesion}</p>}

          {b.modo === 'demo' ? (
            <>
              <p className="suave chico">
                Modo demostración: los datos quedan solo en este navegador. Elija con qué rol entrar.
              </p>
              <div className="lista-botones">
                {b.usuariosDemo!().map((u) => (
                  <button key={u.id} className="boton boton-alto" onClick={() => b.iniciarSesion(u.id, '')}>
                    <span>{u.nombre}</span>
                    <span className="suave chico">{ROLES[u.rol]}</span>
                  </button>
                ))}
              </div>
              <button className="boton-texto chico" onClick={() => b.reiniciarDemo!()}>
                Reiniciar datos de demostración
              </button>
            </>
          ) : (
            <form onSubmit={entrar} className="formulario">
              <label>
                Correo
                <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label>
                Clave
                <input type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
              </label>
              <button className="boton boton-primario boton-alto" disabled={enviando}>
                {enviando ? 'Ingresando…' : 'Ingresar'}
              </button>
              <p className="suave chico" style={{ margin: 0 }}>La sesión queda recordada en este dispositivo. Las cuentas las crea Calidad.</p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
