-- Steps 1-4 (MIP Build Directive v2): sanitization, entity resolution,
-- attachment/consequence rules, milestones.
-- Applied to the live DB as migration 'entity_resolution_sanitization'.

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text not null,
  aliases text[] not null default '{}',
  entity_type text not null default 'other'
    check (entity_type in ('person','organization','institution','place','other')),
  mention_count integer not null default 0,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create unique index if not exists entities_normalized_name_key on public.entities (normalized_name);

create table if not exists public.article_entities (
  article_id uuid not null references public.articles(id) on delete cascade,
  entity_id uuid not null references public.entities(id) on delete cascade,
  confidence numeric not null default 0.5,
  -- 'heuristic' | 'model' | 'model+heuristic' (hybrid NER seam, §2.1 addendum)
  extraction_method text not null default 'heuristic',
  role text,
  created_at timestamptz not null default now(),
  primary key (article_id, entity_id)
);
create index if not exists article_entities_entity_idx on public.article_entities (entity_id);

create table if not exists public.arc_entities (
  arc_id uuid not null references public.story_arcs(id) on delete cascade,
  entity_id uuid not null references public.entities(id) on delete cascade,
  role text not null default 'participant' check (role in ('primary','participant')),
  created_at timestamptz not null default now(),
  primary key (arc_id, entity_id)
);
create index if not exists arc_entities_entity_idx on public.arc_entities (entity_id);

alter table public.entities enable row level security;
alter table public.article_entities enable row level security;
alter table public.arc_entities enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'entities' and policyname = 'entities_read') then
    create policy entities_read on public.entities for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'article_entities' and policyname = 'article_entities_read') then
    create policy article_entities_read on public.article_entities for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'arc_entities' and policyname = 'arc_entities_read') then
    create policy arc_entities_read on public.arc_entities for select using (true);
  end if;
end $$;

alter table public.articles add column if not exists is_digest boolean not null default false;
alter table public.articles add column if not exists image_url text;
alter table public.articles add column if not exists image_alt text;

alter table public.arc_milestones add column if not exists milestone_key text;

insert into public.pipeline_config (key, value, description) values
  ('digest_entity_count', '8', 'article resolving >= this many distinct org/person entities is treated as a digest and excluded from extraction/attachment'),
  ('entity_resolve_min_confidence', '0.5', 'minimum entity resolution confidence for an entity to count for attachment/origination'),
  ('entity_exact_confidence', '0.95', 'confidence assigned to exact canonical/alias matches'),
  ('entity_fuzzy_confidence', '0.7', 'confidence assigned to unambiguous token-subset matches'),
  ('entity_new_confidence', '0.5', 'confidence assigned to newly created entities'),
  ('attach_shortlist_similarity', '0.6', 'embedding cosine used only to shortlist/rank candidate arcs that already share a resolved entity'),
  ('milestone_patterns_version', '1', 'version of the milestone template/evidence pattern set'),
  ('category_confidence_floor', '0.35', 'provisional floor; recalibrated from the classifier confidence distribution after reprocessing')
on conflict (key) do nothing;

create or replace function public.mip_decode_entities(input text)
returns text language plpgsql immutable as $$
declare
  rest text := input;
  outp text := '';
  i int; j int; tok text; n int;
  named jsonb := '{"amp":"&","lt":"<","gt":">","quot":"\"","apos":"''","nbsp":" ","mdash":"—","ndash":"–","lsquo":"‘","rsquo":"’","ldquo":"“","rdquo":"”","hellip":"…","middot":"·","bull":"•","trade":"™","copy":"©","reg":"®","deg":"°","pound":"£","euro":"€","yen":"¥","cent":"¢","sect":"§","para":"¶","dagger":"†","Dagger":"‡","prime":"′","Prime":"″","minus":"−","permil":"‰","times":"×","divide":"÷","plusmn":"±","eacute":"é","Eacute":"É","egrave":"è","Egrave":"È","agrave":"à","Agrave":"À","ccedil":"ç","Ccedil":"Ç","uuml":"ü","ouml":"ö","auml":"ä","iuml":"ï","euml":"ë","Ouml":"Ö","Uuml":"Ü","Auml":"Ä","iacute":"í","Iacute":"Í","oacute":"ó","Oacute":"Ó","uacute":"ú","Uacute":"Ú","ntilde":"ñ","Ntilde":"Ñ","szlig":"ß","oelig":"œ","OElig":"Œ","aelig":"æ","AElig":"Æ","aring":"å","Aring":"Å","oslash":"ø","Oslash":"Ø","ecirc":"ê","Ecirc":"Ê","acirc":"â","Acirc":"Â","ocirc":"ô","Ocirc":"Ô","ucirc":"û","Ucirc":"Û","icirc":"î","Icirc":"Î","atilde":"ã","Atilde":"Ã","otilde":"õ","Otilde":"Õ","rsaquo":"›","lsaquo":"‹","rarr":"→","larr":"←","harr":"↔","sup2":"²","sup3":"³","frac12":"½","frac14":"¼","frac34":"¾","micro":"µ","brvbar":"¦","uml":"¨","acute":"´","cedil":"¸","ordf":"ª","ordm":"º","iexcl":"¡","iquest":"¿","laquo":"«","raquo":"»","shy":""}'::jsonb;
begin
  if input is null then return null; end if;
  loop
    i := position('&' in rest);
    if i = 0 then return outp || rest; end if;
    j := position(';' in substr(rest, i, 12));
    if j = 0 then return outp || rest; end if;
    tok := substr(rest, i + 1, j - 2);
    if tok ~ '^#x[0-9a-fA-F]+$' then
      n := ('x' || lpad(substr(tok, 3), 8, '0'))::bit(32)::int;
      if n > 0 and n <= 1114111 and not (n between 55296 and 57343) then
        outp := outp || substr(rest, 1, i - 1) || chr(n);
      else
        outp := outp || substr(rest, 1, i + j - 1);
      end if;
    elsif tok ~ '^#[0-9]+$' then
      n := substr(tok, 2)::int;
      if n > 0 and n <= 1114111 and not (n between 55296 and 57343) then
        outp := outp || substr(rest, 1, i - 1) || chr(n);
      else
        outp := outp || substr(rest, 1, i + j - 1);
      end if;
    elsif named ? tok then
      outp := outp || substr(rest, 1, i - 1) || (named ->> tok);
    else
      outp := outp || substr(rest, 1, i + j - 1);
    end if;
    rest := substr(rest, i + j);
  end loop;
end $$;

create or replace function public.mip_clean_text(input text)
returns text language plpgsql immutable as $$
declare t text;
begin
  if input is null then return null; end if;
  t := replace(replace(input, '<![CDATA[', ''), ']]>', '');
  t := regexp_replace(t, '<[^>]+>', ' ', 'g');
  t := public.mip_decode_entities(public.mip_decode_entities(t));
  t := regexp_replace(t, '&[a-zA-Z#0-9]{1,10};', ' ', 'g');
  t := trim(regexp_replace(t, '\s+', ' ', 'g'));
  return nullif(t, '');
end $$;

-- one-off corpus re-sanitization (image provenance captured before stripping)
update public.articles
set image_url = coalesce(image_url,
      substring(summary from '<img[^>]*?src="([^"]+)"'),
      substring(summary from '<img[^>]*?src=''([^'']+)''')),
    image_alt = coalesce(image_alt,
      substring(summary from '<img[^>]*?alt="([^"]*)"'),
      substring(summary from '<img[^>]*?alt=''([^'']*)'''))
where summary ~ '<img';

update public.articles
set title = public.mip_clean_text(title),
    summary = public.mip_clean_text(summary),
    body_text = public.mip_clean_text(body_text);

update public.articles set summary = trim(regexp_replace(summary, '<img(\s[^>]*)?($|>)', ' ', 'g')) where summary ~ '<img';

update public.articles a set claims = sub.new_claims
from (
  select id, jsonb_agg(jsonb_build_object('text', public.mip_clean_text(e->>'text'), 'kind', e->>'kind')) as new_claims
  from public.articles, jsonb_array_elements(claims) e
  where claims is not null and jsonb_typeof(claims) = 'array'
  group by id
) sub
where a.id = sub.id;

update public.story_arcs set title = public.mip_clean_text(title), summary = public.mip_clean_text(summary);
update public.nodes set label = public.mip_clean_text(label), description = public.mip_clean_text(description), summary = public.mip_clean_text(summary);
update public.arc_events set title = public.mip_clean_text(title), description = public.mip_clean_text(description);
update public.citations set cited_entity = public.mip_clean_text(cited_entity);
update public.authors set name = public.mip_clean_text(name);
