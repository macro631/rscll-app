// Edge Function: alta de cuentas y cambio de clave. Solo el Administrador (§3, §11).
// Usa la service role key del entorno de Supabase; nunca se expone al navegador.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const ROLES = ['admin', 'revisor', 'inspeccion'];

function respuesta(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return respuesta({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const autorizacion = req.headers.get('Authorization') ?? '';

  // Quién llama: se valida con su propia sesión y la misma función que usa la app.
  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: autorizacion } } });
  const { data: perfil, error: errPerfil } = await comoUsuario.rpc('mi_perfil');
  if (errPerfil || perfil?.rol !== 'admin') return respuesta({ error: 'Tu rol no permite esta acción' }, 403);

  const admin = createClient(url, servicio, { auth: { persistSession: false } });
  let datos: Record<string, string>;
  try {
    datos = await req.json();
  } catch {
    return respuesta({ error: 'Solicitud inválida' }, 400);
  }

  if (datos.accion === 'crear') {
    const { nombre, email, clave, rol } = datos;
    if (!nombre?.trim() || !email?.trim() || !clave || clave.length < 8 || !ROLES.includes(rol)) {
      return respuesta({ error: 'Complete nombre, correo, clave (mínimo 8) y rol' }, 400);
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: email.trim(),
      password: clave,
      email_confirm: true,
      user_metadata: { nombre: nombre.trim() },
      app_metadata: { rol },
    });
    if (error) return respuesta({ error: error.message }, 400);
    await admin.from('evento').insert({
      actor: perfil.id,
      entidad: 'perfil',
      entidad_id: data.user.id,
      accion: 'alta_usuario',
      despues: { nombre: nombre.trim(), email: email.trim(), rol },
    });
    return respuesta({ id: data.user.id });
  }

  if (datos.accion === 'clave') {
    const { usuario, clave } = datos;
    if (!usuario || !clave || clave.length < 8) return respuesta({ error: 'La clave debe tener al menos 8 caracteres' }, 400);
    const { error } = await admin.auth.admin.updateUserById(usuario, { password: clave });
    if (error) return respuesta({ error: error.message }, 400);
    await admin.from('evento').insert({ actor: perfil.id, entidad: 'perfil', entidad_id: usuario, accion: 'perfil', comentario: 'Cambio de clave' });
    return respuesta({ ok: true });
  }

  return respuesta({ error: 'Acción desconocida' }, 400);
});
