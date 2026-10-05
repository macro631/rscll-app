-- RSCLL · El Administrador corrige observaciones registradas en el recinto equivocado (05-10-2026).
-- Solo agrega una función: no modifica tablas ni datos existentes.
-- Las observaciones elegidas de una ficha finalizada pasan a una ficha nueva en el recinto destino,
-- con el mismo autor, origen y fechas. Conservan número, especialidad, descripción, estado,
-- fotos y comentarios (las fotos se guardan por id de observación, no por recinto).
-- No se permite sobre fichas abiertas para no interferir con quien está revisando.

create function mover_observaciones(p_observaciones uuid[], p_recinto text, p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  yo perfil := _exigir(array['admin']::rol_usuario[]);
  v revision;
  v_rev uuid;
  v_revs uuid[];
  v_total int;
  v_numeros bigint[];
  v_pend int;
begin
  if nullif(trim(p_motivo), '') is null then
    raise exception 'Indique el motivo del traslado';
  end if;
  if coalesce(cardinality(p_observaciones), 0) = 0 then
    raise exception 'Seleccione al menos una observación';
  end if;
  -- Bloquea el recinto destino: serializa con recepcionar().
  perform 1 from recinto where id = p_recinto and activo for update;
  if not found then
    raise exception 'Recinto destino no encontrado';
  end if;

  select array_agg(distinct revision_id), count(*), array_agg(numero order by numero),
         count(*) filter (where estado = 'pendiente')
    into v_revs, v_total, v_numeros, v_pend
    from (select * from observacion where id = any (p_observaciones) for update) o;
  if v_total <> cardinality(array(select distinct unnest(p_observaciones))) then
    raise exception 'Alguna observación no existe';
  end if;
  if cardinality(v_revs) <> 1 then
    raise exception 'Las observaciones deben pertenecer a una misma ficha';
  end if;

  select * into v from revision where id = v_revs[1] for update;
  if v.condicion <> 'finalizada' then
    raise exception 'Solo se trasladan observaciones de fichas finalizadas';
  end if;
  if v.recinto_id = p_recinto then
    raise exception 'Las observaciones ya pertenecen a ese recinto';
  end if;

  insert into revision (recinto_id, autor, origen, condicion, inicio, fin)
  values (p_recinto, v.autor, v.origen, 'finalizada', v.inicio, v.fin)
  returning id into v_rev;
  update observacion set revision_id = v_rev, recinto_id = p_recinto, actualizada = now()
   where id = any (p_observaciones);
  if v_pend > 0 then
    perform _invalidar_recepcion(p_recinto, yo.id, 'Observaciones trasladadas desde otro recinto');
  end if;

  perform _evento(yo.id, 'revision', v.id::text, v.recinto_id, 'traslado_observaciones',
    jsonb_build_object('recinto', v.recinto_id, 'revision', v.id, 'numeros', v_numeros),
    jsonb_build_object('recinto', p_recinto, 'revision', v_rev) || _estado_json(v.recinto_id), trim(p_motivo));
  perform _evento(yo.id, 'revision', v_rev::text, p_recinto, 'traslado_observaciones',
    jsonb_build_object('recinto', v.recinto_id, 'revision', v.id, 'numeros', v_numeros),
    jsonb_build_object('recinto', p_recinto, 'revision', v_rev) || _estado_json(p_recinto), trim(p_motivo));
  return v_rev;
end $$;

revoke execute on function mover_observaciones(uuid[], text, text) from public, anon;
grant execute on function mover_observaciones(uuid[], text, text) to authenticated;
