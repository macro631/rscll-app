-- RSCLL · Inspección también revisa (decisión de Calidad, 24-09-2026).
-- Además de sus funciones propias (recepcionar, devolver, defecto nuevo), Inspección puede abrir y
-- finalizar su propia ficha de revisión y registrar, editar o eliminar observaciones en ella.
-- Reemplaza la restricción de Estructura.md §3 («no como revisión ordinaria»).

create or replace function abrir_revision(p_recinto text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin', 'revisor', 'inspeccion']::rol_usuario[]);
  v_id uuid;
  v_antes jsonb;
begin
  if not exists (select 1 from recinto where id = p_recinto and activo) then
    raise exception 'Recinto no encontrado';
  end if;
  select id into v_id from revision
   where recinto_id = p_recinto and autor = yo.id and condicion = 'abierta';
  if v_id is not null then
    return v_id;
  end if;
  v_antes := _estado_json(p_recinto);
  begin
    insert into revision (recinto_id, autor) values (p_recinto, yo.id) returning id into v_id;
  exception when unique_violation then
    select id into v_id from revision
     where recinto_id = p_recinto and autor = yo.id and condicion = 'abierta';
    return v_id;
  end;
  perform _evento(yo.id, 'revision', v_id::text, p_recinto, 'inicio_revision', v_antes, _estado_json(p_recinto));
  return v_id;
end $$;

create or replace function agregar_observacion(
  p_revision uuid, p_especialidad especialidad, p_descripcion text, p_client_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin', 'revisor', 'inspeccion']::rol_usuario[]);
  v revision;
  v_id uuid;
begin
  if p_client_id is not null then
    select id into v_id from observacion where client_id = p_client_id;
    if v_id is not null then
      return v_id;       -- reenvío desde la cola sin conexión
    end if;
  end if;
  v := _ficha_editable(p_revision, yo);
  insert into observacion (revision_id, recinto_id, especialidad, descripcion, autor, client_id)
  values (v.id, v.recinto_id, p_especialidad, trim(p_descripcion), yo.id, p_client_id)
  returning id into v_id;
  perform _invalidar_recepcion(v.recinto_id, yo.id, 'Nueva observación registrada');
  perform _evento(yo.id, 'observacion', v_id::text, v.recinto_id, 'alta_observacion', null,
    jsonb_build_object('especialidad', p_especialidad, 'descripcion', trim(p_descripcion), 'estado', 'pendiente'));
  return v_id;
end $$;

create or replace function editar_observacion(p_observacion uuid, p_especialidad especialidad, p_descripcion text) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin', 'revisor', 'inspeccion']::rol_usuario[]);
  o observacion;
begin
  select * into o from observacion where id = p_observacion for update;
  if o.id is null then
    raise exception 'Observación no encontrada';
  end if;
  perform _ficha_editable(o.revision_id, yo);
  update observacion
     set especialidad = p_especialidad, descripcion = trim(p_descripcion), actualizada = now()
   where id = o.id;
  perform _evento(yo.id, 'observacion', o.id::text, o.recinto_id, 'edicion_observacion',
    jsonb_build_object('especialidad', o.especialidad, 'descripcion', o.descripcion),
    jsonb_build_object('especialidad', p_especialidad, 'descripcion', trim(p_descripcion)));
end $$;

create or replace function eliminar_observacion(p_observacion uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin', 'revisor', 'inspeccion']::rol_usuario[]);
  o observacion;
begin
  select * into o from observacion where id = p_observacion for update;
  if o.id is null then
    raise exception 'Observación no encontrada';
  end if;
  perform _ficha_editable(o.revision_id, yo);
  delete from observacion where id = o.id;
  perform _evento(yo.id, 'observacion', o.id::text, o.recinto_id, 'eliminacion_observacion',
    jsonb_build_object('especialidad', o.especialidad, 'descripcion', o.descripcion, 'numero', o.numero), null);
end $$;
