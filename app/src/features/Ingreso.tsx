import { useState, type FormEvent } from 'react';
import { api } from '../lib/backend';
import { useSesion } from '../auth';
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
        <p className="ingreso-codigo">RSCLL</p>
        <h1>Reposición SubComisaría Llay Llay</h1>
        <p className="suave">Revisión de recintos, observaciones y recepción.</p>

        {(error || errorSesion) && <p className="error-texto" role="alert">{error ?? errorSesion}</p>}

        {b.modo === 'demo' ? (
          <>
            <div className="nota">
              <strong>Modo demostración.</strong> Los datos se guardan solo en este navegador. Elige con qué rol entrar.
            </div>
            <div className="lista-botones">
              {b.usuariosDemo!().map((u) => (
                <button key={u.id} className="boton boton-grande" onClick={() => b.iniciarSesion(u.id, '')}>
                  <span>{u.nombre}</span>
                  <span className="suave">{ROLES[u.rol]}</span>
                </button>
              ))}
            </div>
            <button className="boton-texto" onClick={() => b.reiniciarDemo!()}>
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
            <button className="boton boton-primario boton-grande" disabled={enviando}>
              {enviando ? 'Ingresando…' : 'Ingresar'}
            </button>
            <p className="suave pequeño">La sesión queda recordada en este dispositivo.</p>
          </form>
        )}
      </div>
    </main>
  );
}
