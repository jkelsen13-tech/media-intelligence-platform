-- 15A: Atomic centroid and idempotent attachment.
--
-- Correctness fix, not an optimization. attachToArc (ingest-rss,
-- backfill-legacy) previously read the arc centroid, computed the running
-- centroid in JS, and wrote it back — a lost-update race under any
-- concurrent attach, masked only by operational serial execution, and a
-- double-count on any duplicate attach (retry/resumption/redelivery).
-- This migration adds a single atomic RPC: membership write, member-count
-- derivation, and centroid fold happen in ONE transaction, computed from
-- the current stored value inside it.
--
-- Additive only: creates one function. NO data mutation by this migration.
--
-- Rollback:  drop function if exists public.attach_article_to_arc(uuid, uuid, vector, jsonb);
-- (and revert the two attachToArc callers to the prior JS write sequence).
--
-- Known inherited limitation (documented, out of scope for 15A): a
-- RE-PARENTED article (moved from arc A to arc B, not a duplicate attach)
-- folds into arc B's centroid but arc A's centroid is never decremented —
-- identical to the pre-15A JS behavior, which also never touched the old
-- arc. Not corrected here.
--
-- Implementation note (2026-08-12, proven during the four-test run): this
-- pgvector build does NOT support vector subscripting (v[i] raises 42804),
-- so step 6 converts vectors to float8[] once via text round-trip and loops
-- over the arrays. Formula unchanged from the owner-approved body.

create or replace function public.attach_article_to_arc(
  p_article_id uuid,
  p_arc_id     uuid,
  p_embedding  vector(384) default null,
  p_evidence   jsonb       default null
) returns jsonb
language plpgsql
as $func$
declare
  v_prior_arc uuid;
  v_old       vector(384);
  v_old_arr   float8[];
  v_emb_arr   float8[];
  v_old_dims  int;
  v_emb_dims  int;
  v_m         int;
  v_next_text text;
  v_prev      double precision;
  v_i         int;
begin
  -- 1. Lock the article row and read its CURRENT arc_id. This row lock is
  --    also the idempotency mechanism: a concurrent duplicate attach of the
  --    SAME article blocks here until the first transaction commits, then
  --    reads the committed value at step 2 and no-ops.
  select arc_id into v_prior_arc
    from public.articles
   where id = p_article_id
     for update;

  if not found then
    return jsonb_build_object('status', 'error', 'reason', 'article_not_found');
  end if;

  -- 2. Duplicate attach: already a member of THIS arc => strict no-op.
  --    No centroid touch, no count touch, no last_update_at touch.
  if v_prior_arc = p_arc_id then
    return jsonb_build_object('status', 'already_attached', 'arc_id', p_arc_id);
  end if;

  -- 3. Membership write.
  update public.articles
     set arc_id = p_arc_id,
         arc_assignment_evidence = coalesce(p_evidence, arc_assignment_evidence)
   where id = p_article_id;

  -- 4. Lock the arc row. Concurrent attaches of DISTINCT articles serialize
  --    here; the centroid arithmetic below always reads the latest committed
  --    value. Lock ordering is always article-then-arc, so no deadlock cycle.
  select embedding into v_old
    from public.story_arcs
   where id = p_arc_id
     for update;

  if not found then
    raise exception 'arc % not found', p_arc_id;  -- rolls back step 3 as well
  end if;

  -- 5. Member count from current membership state INSIDE the transaction
  --    (the step-3 update is already visible to this count — mirrors the
  --    shipped "INCLUDING the one just attached" semantics).
  select count(*) into v_m
    from public.articles
   where arc_id = p_arc_id and embedding is not null;

  -- 6. Centroid fold, mirroring the shipped JS formula exactly:
  --    prev = old*(m-1) when old exists AND dims match AND m > 1, else 0;
  --    next = (prev + e) / m.
  --    (Vectors are converted to float8[] once via text round-trip: this
  --    pgvector build does not support vector subscripting.)
  if p_embedding is not null then
    v_emb_arr := string_to_array(trim(both '[]' from p_embedding::text), ',')::float8[];
    v_emb_dims := coalesce(array_length(v_emb_arr, 1), 0);
    if v_old is not null then
      v_old_arr := string_to_array(trim(both '[]' from v_old::text), ',')::float8[];
      v_old_dims := coalesce(array_length(v_old_arr, 1), 0);
    else
      v_old_dims := 0;
    end if;
    v_next_text := '[';
    for v_i in 1 .. v_emb_dims loop
      if v_old_dims = v_emb_dims and v_m > 1 then
        v_prev := v_old_arr[v_i] * (v_m - 1);
      else
        v_prev := 0;
      end if;
      v_next_text := v_next_text
        || case when v_i > 1 then ',' else '' end
        || ((v_prev + v_emb_arr[v_i]) / v_m)::text;
    end loop;
    v_next_text := v_next_text || ']';

    update public.story_arcs
       set embedding = v_next_text::vector,
           last_update_at = now()
     where id = p_arc_id;
  else
    -- No embedding: membership still lands, centroid untouched (mirrors the
    -- shipped ctx.embedding gate), but last_update_at still advances.
    update public.story_arcs
       set last_update_at = now()
     where id = p_arc_id;
  end if;

  return jsonb_build_object(
    'status',           'attached',
    'arc_id',           p_arc_id,
    'member_count',     v_m,
    'centroid_updated', p_embedding is not null
  );
end
$func$;
