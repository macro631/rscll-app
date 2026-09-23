-- RSCLL · Recursos propios de Supabase (no se aplican en el modo demostración).

-- Fotos: original para respaldo y versión ligera para listas y PDF (§13). Buckets privados.
insert into storage.buckets (id, name, public)
values ('fotos-original', 'fotos-original', false), ('fotos-ligera', 'fotos-ligera', false)
on conflict (id) do nothing;

create policy "rscll fotos lectura" on storage.objects for select to authenticated
  using (bucket_id in ('fotos-original', 'fotos-ligera') and public.usuario_activo());

create policy "rscll fotos subida" on storage.objects for insert to authenticated
  with check (bucket_id in ('fotos-original', 'fotos-ligera') and public.usuario_activo());

-- Cambios en vivo: los teléfonos actualizan planta y fichas al recibir cambios de otros usuarios.
alter publication supabase_realtime add table revision, observacion, recepcion, comentario, foto;
