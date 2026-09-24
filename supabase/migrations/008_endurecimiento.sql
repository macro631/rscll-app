-- RSCLL · Endurecimiento previo a la operación real (auditoría del 24-09-2026).
-- No modifica datos: solo permisos, índices y una política.

-- 1. Permisos de tabla: los usuarios con sesión solo leen (lo demás pasa por las funciones RPC)
--    y los usuarios sin sesión no tienen ningún permiso. Cubre TRUNCATE/TRIGGER/REFERENCES,
--    que Supabase otorga por defecto, y la vista observacion_detalle creada después de 003.
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;

-- Tablas y funciones futuras no heredan permisos amplios.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

-- 2. Funciones auxiliares que el cliente no usa: solo las llaman otras funciones del servidor.
revoke execute on function estado_de(text) from authenticated;
revoke execute on function perfil_actual() from authenticated;

-- 3. Índices de claves foráneas señalados por el asesor de rendimiento.
create index if not exists comentario_autor on comentario (autor);
create index if not exists figura_recinto on figura (recinto_id);
create index if not exists foto_autor on foto (autor);
create index if not exists observacion_autor on observacion (autor);
create index if not exists observacion_comprobada_por on observacion (comprobada_por);
create index if not exists recepcion_inspector on recepcion (inspector);
create index if not exists recinto_proyecto on recinto (proyecto_id);
create index if not exists revision_anulada_por on revision (anulada_por);
create index if not exists revision_autor on revision (autor);

-- 4. La política de perfiles evalúa auth.uid() una sola vez por consulta.
drop policy if exists lectura on perfil;
create policy lectura on perfil for select to authenticated using (id = (select auth.uid()) or tiene_rol('admin'));
