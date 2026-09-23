-- RSCLL · Acciones (RPC). Cada función valida rol y estado en el servidor y deja un evento (§3, §11).

-- ───────────────────────── auxiliares internas ─────────────────────────

create function _exigir(roles rol_usuario[]) returns perfil
language plpgsql stable security definer set search_path = public as $$
declare
  p perfil;
begin
  select * into p from perfil where id = auth.uid();
  if p.id is null or not p.activo then
    raise exception 'Sesión no válida o cuenta desactivada' using errcode = '42501';
  end if;
  if roles is not null and not (p.rol = any (roles)) then
    raise exception 'Tu rol no permite esta acción' using errcode = '42501';
  end if;
  return p;
end $$;

create function _evento(
  p_actor uuid, p_entidad text, p_entidad_id text, p_recinto text, p_accion text,
  p_antes jsonb, p_despues jsonb, p_comentario text default null
) returns void
language sql security definer set search_path = public as $$
  insert into evento (actor, entidad, entidad_id, recinto_id, accion, antes, despues, comentario)
  values (p_actor, p_entidad, p_entidad_id, p_recinto, p_accion, p_antes, p_despues, p_comentario)
$$;

-- Deja sin vigencia la recepción del recinto, si existe. Devuelve su id.
create function _invalidar_recepcion(p_recinto text, p_actor uuid, p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  update recepcion
     set vigente = false, invalidada_en = now(), motivo_fin = p_motivo
   where recinto_id = p_recinto and vigente
  returning id into v_id;
  if v_id is not null then
    perform _evento(p_actor, 'recepcion', v_id::text, p_recinto, 'devolucion_recepcion',
      jsonb_build_object('estado_recinto', 'recepcionado'), null, p_motivo);
  end if;
  return v_id;
end $$;

-- Ficha abierta del usuario actual, bloqueada para escritura.
create function _ficha_editable(p_revision uuid, p_yo perfil) returns revision
language plpgsql security definer set search_path = public as $$
declare
  v revision;
begin
  select * into v from revision where id = p_revision for update;
  if v.id is null then
    raise exception 'Ficha de revisión no encontrada';
  end if;
  if v.autor <> p_yo.id then
    raise exception 'Solo el autor puede modificar esta ficha' using errcode = '42501';
  end if;
  if v.condicion <> 'abierta' then
    raise exception 'La ficha ya no está abierta';
  end if;
  return v;
end $$;

create function _estado_json(p_recinto text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('estado_recinto', estado_de(p_recinto))
$$;

-- ───────────────────────── fichas de revisión ─────────────────────────

create function abrir_revision(p_recinto text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin', 'revisor']::rol_usuario[]);
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

create function finalizar_revision(p_revision uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(null);
  v revision := _ficha_editable(p_revision, yo);
  v_antes jsonb := _estado_json(v.recinto_id);
  v_total int;
begin
  update revision set condicion = 'finalizada', fin = now() where id = v.id;
  select count(*) into v_total from observacion where revision_id = v.id;
  perform _evento(yo.id, 'revision', v.id::text, v.recinto_id, 'fin_revision',
    v_antes, _estado_json(v.recinto_id) || jsonb_build_object('observaciones', v_total));
end $$;

-- ───────────────────────── observaciones ─────────────────────────

create function agregar_observacion(
  p_revision uuid, p_especialidad especialidad, p_descripcion text, p_client_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin', 'revisor']::rol_usuario[]);
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

create function editar_observacion(p_observacion uuid, p_especialidad especialidad, p_descripcion text) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin', 'revisor']::rol_usuario[]);
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

create function eliminar_observacion(p_observacion uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin', 'revisor']::rol_usuario[]);
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

create function agregar_foto(
  p_observacion uuid, p_path_original text, p_path_ligera text, p_client_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(null);
  o observacion;
  v_cond condicion_revision;
  v_id uuid;
begin
  if p_client_id is not null then
    select id into v_id from foto where client_id = p_client_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;
  select * into o from observacion where id = p_observacion;
  if o.id is null then
    raise exception 'Observación no encontrada';
  end if;
  select condicion into v_cond from revision where id = o.revision_id;
  -- El autor adjunta fotos a su observación; puede llegar después del cierre si estaba en la cola.
  if o.autor <> yo.id or v_cond = 'anulada' then
    raise exception 'Solo el autor de la observación puede adjuntar fotos' using errcode = '42501';
  end if;
  insert into foto (observacion_id, path_original, path_ligera, autor, client_id)
  values (o.id, p_path_original, p_path_ligera, yo.id, p_client_id)
  returning id into v_id;
  perform _evento(yo.id, 'foto', v_id::text, o.recinto_id, 'alta_foto', null,
    jsonb_build_object('observacion', o.numero));
  return v_id;
end $$;

create function eliminar_foto(p_foto uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(null);
  f foto;
  o observacion;
begin
  select * into f from foto where id = p_foto;
  if f.id is null then
    raise exception 'Foto no encontrada';
  end if;
  select * into o from observacion where id = f.observacion_id;
  perform _ficha_editable(o.revision_id, yo);
  delete from foto where id = f.id;
  perform _evento(yo.id, 'foto', f.id::text, o.recinto_id, 'eliminacion_foto',
    jsonb_build_object('observacion', o.numero, 'path', f.path_original), null);
end $$;

-- Comprobación en terreno por Revisor, Inspección o Administrador (§7.4).
create function marcar_subsanada(p_observacion uuid, p_comentario text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(null);
  o observacion;
  v_cond condicion_revision;
  v_antes jsonb;
begin
  select * into o from observacion where id = p_observacion for update;
  if o.id is null then
    raise exception 'Observación no encontrada';
  end if;
  select condicion into v_cond from revision where id = o.revision_id;
  if v_cond <> 'finalizada' then
    raise exception 'Solo se comprueban observaciones de fichas finalizadas';
  end if;
  if o.estado = 'subsanada' then
    return;
  end if;
  v_antes := _estado_json(o.recinto_id) || jsonb_build_object('estado', o.estado);
  update observacion
     set estado = 'subsanada', comprobada_por = yo.id, comprobada_en = now(), actualizada = now()
   where id = o.id;
  if nullif(trim(p_comentario), '') is not null then
    insert into comentario (observacion_id, autor, tipo, texto) values (o.id, yo.id, 'subsanacion', trim(p_comentario));
  end if;
  perform _evento(yo.id, 'observacion', o.id::text, o.recinto_id, 'subsanacion', v_antes,
    _estado_json(o.recinto_id) || jsonb_build_object('estado', 'subsanada'), nullif(trim(p_comentario), ''));
end $$;

-- Inspección comenta y mantiene o devuelve a pendiente una observación existente (§8).
create function mantener_pendiente(p_observacion uuid, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['inspeccion', 'admin']::rol_usuario[]);
  o observacion;
  v_cond condicion_revision;
  v_antes jsonb;
begin
  if nullif(trim(p_texto), '') is null then
    raise exception 'El comentario es obligatorio';
  end if;
  select * into o from observacion where id = p_observacion for update;
  if o.id is null then
    raise exception 'Observación no encontrada';
  end if;
  select condicion into v_cond from revision where id = o.revision_id;
  if v_cond <> 'finalizada' then
    raise exception 'Solo se devuelven observaciones de fichas finalizadas';
  end if;
  v_antes := _estado_json(o.recinto_id) || jsonb_build_object('estado', o.estado);
  insert into comentario (observacion_id, autor, tipo, texto) values (o.id, yo.id, 'devolucion', trim(p_texto));
  update observacion set estado = 'pendiente', actualizada = now() where id = o.id;
  perform _invalidar_recepcion(o.recinto_id, yo.id, 'Observación devuelta a pendiente por Inspección');
  perform _evento(yo.id, 'observacion', o.id::text, o.recinto_id, 'devolucion', v_antes,
    _estado_json(o.recinto_id) || jsonb_build_object('estado', 'pendiente'), trim(p_texto));
end $$;

-- Defecto sin observación previa detectado por Inspección (§16.1, resuelto):
-- crea una ficha de Inspección ya finalizada con una observación pendiente clasificada por especialidad.
create function observacion_inspeccion(
  p_recinto text, p_especialidad especialidad, p_descripcion text, p_client_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['inspeccion']::rol_usuario[]);
  v_estado text := estado_de(p_recinto);
  v_rev uuid;
  v_id uuid;
begin
  if p_client_id is not null then
    select id into v_id from observacion where client_id = p_client_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;
  if v_estado not in ('listo', 'recepcionado') then
    raise exception 'Solo se registra en recintos listos para Inspección o recepcionados';
  end if;
  insert into revision (recinto_id, autor, origen, condicion, fin)
  values (p_recinto, yo.id, 'inspeccion', 'finalizada', now())
  returning id into v_rev;
  insert into observacion (revision_id, recinto_id, especialidad, descripcion, origen, autor, client_id)
  values (v_rev, p_recinto, p_especialidad, trim(p_descripcion), 'inspeccion', yo.id, p_client_id)
  returning id into v_id;
  perform _invalidar_recepcion(p_recinto, yo.id, 'Observación de Inspección');
  perform _evento(yo.id, 'observacion', v_id::text, p_recinto, 'observacion_inspeccion',
    jsonb_build_object('estado_recinto', v_estado),
    _estado_json(p_recinto) || jsonb_build_object('especialidad', p_especialidad, 'descripcion', trim(p_descripcion)));
  return v_id;
end $$;

-- ───────────────────────── recepción ─────────────────────────

create function recepcionar(p_recinto text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['inspeccion']::rol_usuario[]);
  v_id uuid;
begin
  perform 1 from recinto where id = p_recinto for update;
  if estado_de(p_recinto) <> 'listo' then
    raise exception 'Solo se recepciona un recinto listo para Inspección (verde claro)';
  end if;
  insert into recepcion (recinto_id, inspector) values (p_recinto, yo.id) returning id into v_id;
  perform _evento(yo.id, 'recepcion', v_id::text, p_recinto, 'recepcion',
    jsonb_build_object('estado_recinto', 'listo'), _estado_json(p_recinto));
  return v_id;
end $$;

-- ───────────────────────── administración ─────────────────────────

create function reabrir_revision(p_revision uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin']::rol_usuario[]);
  v revision;
  v_antes jsonb;
begin
  select * into v from revision where id = p_revision for update;
  if v.id is null or v.condicion <> 'finalizada' then
    raise exception 'Solo se reabre una ficha finalizada';
  end if;
  if v.origen <> 'ordinaria' then
    raise exception 'Las fichas de Inspección no se reabren; anúlela si fue un error';
  end if;
  if exists (select 1 from revision where recinto_id = v.recinto_id and autor = v.autor and condicion = 'abierta') then
    raise exception 'El autor ya tiene otra ficha abierta en este recinto';
  end if;
  v_antes := _estado_json(v.recinto_id);
  update revision set condicion = 'abierta', fin = null where id = v.id;
  perform _evento(yo.id, 'revision', v.id::text, v.recinto_id, 'reapertura', v_antes, _estado_json(v.recinto_id));
end $$;

create function anular_revision(p_revision uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin']::rol_usuario[]);
  v revision;
  v_antes jsonb;
  v_rec uuid;
begin
  if nullif(trim(p_motivo), '') is null then
    raise exception 'Indique el motivo de la anulación';
  end if;
  select * into v from revision where id = p_revision for update;
  if v.id is null or v.condicion = 'anulada' then
    raise exception 'La ficha no existe o ya está anulada';
  end if;
  v_antes := _estado_json(v.recinto_id);
  update revision
     set condicion_previa = condicion, condicion = 'anulada',
         anulada_por = yo.id, anulada_en = now(), motivo_anulacion = trim(p_motivo)
   where id = v.id;
  -- Sin fichas finalizadas vigentes, una recepción anterior deja de sostenerse.
  if not exists (select 1 from revision where recinto_id = v.recinto_id and condicion = 'finalizada') then
    v_rec := _invalidar_recepcion(v.recinto_id, yo.id, 'Anulación de ficha');
    update revision set recepcion_invalidada = v_rec where id = v.id;
  end if;
  perform _evento(yo.id, 'revision', v.id::text, v.recinto_id, 'anulacion',
    v_antes || jsonb_build_object('condicion', v.condicion),
    _estado_json(v.recinto_id) || jsonb_build_object('condicion', 'anulada'), trim(p_motivo));
end $$;

create function revertir_anulacion(p_revision uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin']::rol_usuario[]);
  v revision;
  v_antes jsonb;
  v_pend int;
begin
  select * into v from revision where id = p_revision for update;
  if v.id is null or v.condicion <> 'anulada' then
    raise exception 'La ficha no está anulada';
  end if;
  if v.condicion_previa = 'abierta' and exists (
    select 1 from revision where recinto_id = v.recinto_id and autor = v.autor and condicion = 'abierta'
  ) then
    raise exception 'El autor ya tiene otra ficha abierta en este recinto';
  end if;
  v_antes := _estado_json(v.recinto_id);
  update revision
     set condicion = coalesce(condicion_previa, 'finalizada'), condicion_previa = null,
         anulada_por = null, anulada_en = null, motivo_anulacion = null, recepcion_invalidada = null
   where id = v.id;
  select count(*) into v_pend from observacion where revision_id = v.id and estado = 'pendiente';
  if v_pend > 0 then
    perform _invalidar_recepcion(v.recinto_id, yo.id, 'Reversión de anulación con pendientes');
  elsif v.recepcion_invalidada is not null
        and not exists (select 1 from recepcion where recinto_id = v.recinto_id and vigente)
        and estado_de(v.recinto_id) = 'listo' then
    update recepcion set vigente = true, invalidada_en = null, motivo_fin = null where id = v.recepcion_invalidada;
    perform _evento(yo.id, 'recepcion', v.recepcion_invalidada::text, v.recinto_id, 'restitucion_recepcion',
      jsonb_build_object('estado_recinto', 'listo'), jsonb_build_object('estado_recinto', 'recepcionado'));
  end if;
  perform _evento(yo.id, 'revision', v.id::text, v.recinto_id, 'reversion_anulacion',
    v_antes || jsonb_build_object('condicion', 'anulada'),
    _estado_json(v.recinto_id) || jsonb_build_object('condicion', coalesce(v.condicion_previa, 'finalizada')));
end $$;

create function admin_actualizar_perfil(p_usuario uuid, p_nombre text, p_rol rol_usuario, p_activo boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin']::rol_usuario[]);
  p perfil;
begin
  select * into p from perfil where id = p_usuario for update;
  if p.id is null then
    raise exception 'Usuario no encontrado';
  end if;
  if p.id = yo.id and (p_rol <> 'admin' or not p_activo) then
    raise exception 'No puede quitarse a sí mismo el rol de Administrador ni desactivar su cuenta';
  end if;
  update perfil set nombre = trim(p_nombre), rol = p_rol, activo = p_activo where id = p.id;
  perform _evento(yo.id, 'perfil', p.id::text, null, 'perfil',
    jsonb_build_object('nombre', p.nombre, 'rol', p.rol, 'activo', p.activo),
    jsonb_build_object('nombre', trim(p_nombre), 'rol', p_rol, 'activo', p_activo));
end $$;
