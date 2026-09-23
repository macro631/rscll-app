-- RSCLL · Seguridad a nivel de fila (Estructura.md §3, §13)
-- Lectura: usuarios autenticados con cuenta activa. Evento: solo Administrador.
-- No hay políticas de escritura: insert/update/delete solo ocurren dentro de las funciones RPC
-- (security definer), que validan rol y estado antes de modificar.

alter table proyecto        enable row level security;
alter table recinto         enable row level security;
alter table recinto_sector  enable row level security;
alter table figura          enable row level security;
alter table perfil          enable row level security;
alter table revision        enable row level security;
alter table observacion     enable row level security;
alter table foto            enable row level security;
alter table comentario      enable row level security;
alter table recepcion       enable row level security;
alter table evento          enable row level security;

create policy lectura on proyecto       for select to authenticated using (usuario_activo());
create policy lectura on recinto        for select to authenticated using (usuario_activo());
create policy lectura on recinto_sector for select to authenticated using (usuario_activo());
create policy lectura on figura         for select to authenticated using (usuario_activo());
create policy lectura on revision       for select to authenticated using (usuario_activo());
create policy lectura on observacion    for select to authenticated using (usuario_activo());
create policy lectura on foto           for select to authenticated using (usuario_activo());
create policy lectura on comentario     for select to authenticated using (usuario_activo());
create policy lectura on recepcion      for select to authenticated using (usuario_activo());
create policy lectura on evento         for select to authenticated using (tiene_rol('admin'));
-- Cada persona ve su propio perfil; los nombres de otros se exponen a través de las funciones de consulta.
create policy lectura on perfil         for select to authenticated using (id = auth.uid() or tiene_rol('admin'));

-- Desde 2026 Supabase no otorga permisos automáticos en tablas nuevas: se declaran aquí.
revoke insert, update, delete on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated, service_role;
grant select on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
-- La Edge Function admin-usuarios registra eventos con la clave de servicio.
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
