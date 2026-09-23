import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProveedorAviso } from './components/Aviso';
import { ProveedorSesion } from './auth';
import { iniciarBackend } from './lib/backend';
import App from './App';
import './index.css';

const qc = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true },
  },
});

const raiz = createRoot(document.getElementById('root')!);
raiz.render(<p className="cargando">Cargando…</p>);

iniciarBackend()
  .then(() =>
    raiz.render(
      <StrictMode>
        <QueryClientProvider client={qc}>
          <ProveedorAviso>
            <ProveedorSesion>
              <App />
            </ProveedorSesion>
          </ProveedorAviso>
        </QueryClientProvider>
      </StrictMode>,
    ),
  )
  .catch((e) =>
    raiz.render(
      <div className="vacio">
        <p>No se pudo iniciar la aplicación.</p>
        <p className="suave">{e instanceof Error ? e.message : String(e)}</p>
      </div>,
    ),
  );
