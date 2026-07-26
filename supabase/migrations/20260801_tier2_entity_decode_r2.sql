-- Tier 2 round 2: repair half-stripped entities.
-- (1) Bare known-entity words whose '&' was stripped upstream by legacy
--     cleaners ("Trump apos;s", 'quot;60 Minutes quot;') decode to their
--     character; an optional leading '&' and whitespace before ';' are
--     tolerated.
-- (2) Truncated entity tails at end-of-text ("...war&", "...Asia.&lt",
--     "...podcast &") are removed. Trailing punctuation is kept and never
--     duplicated ("Asia.&lt." -> "Asia."). Single-letter and non-entity
--     tails ("M&A", "AT&T", "& Co") survive.
CREATE OR REPLACE FUNCTION mip_clean_display_text(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $func$
DECLARE
  s text := input;
BEGIN
  IF s IS NULL THEN RETURN NULL; END IF;
  s := mip_decode_entities(s);                                        -- decode first: encoded tags become literal
  s := regexp_replace(s, '<[^>]+>', ' ', 'g');                        -- complete tags (incl. decoded ones)
  s := regexp_replace(s, '</?[a-zA-Z][a-zA-Z0-9]*&[a-zA-Z]{0,9}', ' ', 'g'); -- broken fragments: </span&, </a&gt
  s := regexp_replace(s, '</?[a-zA-Z!][^>]{0,200}$', ' ', 'g');       -- unterminated tag at end (<a href="htt)
  s := regexp_replace(s, '</?$', ' ', 'g');                           -- bare trailing < or </
  s := regexp_replace(s, '&[[:space:]]*[a-zA-Z#0-9]{1,10};', ' ', 'g'); -- residual unknown entities (ws-tolerant)
  -- r2 (1): bare known-entity words (apos;/quot;/nbsp;/amp;/lt;/gt;).
  s := regexp_replace(s, '&?[[:space:]]+apos[[:space:]]*;', '''', 'g');  -- "Trump apos;s" -> "Trump's"
  s := regexp_replace(s, '&?\mapos[[:space:]]*;', '''', 'g');
  s := regexp_replace(s, '&?[[:space:]]+quot[[:space:]]*;([[:space:]]|$)', '"\1', 'g'); -- closing quote
  s := regexp_replace(s, '&?\mquot[[:space:]]*;', '"', 'g');             -- opening/other quote
  s := regexp_replace(s, '&?[[:space:]]*\mnbsp[[:space:]]*;', ' ', 'g');
  s := regexp_replace(s, '&?\mamp[[:space:]]*;', '&', 'g');
  s := regexp_replace(s, '&?\mlt[[:space:]]*;', '<', 'g');
  s := regexp_replace(s, '&?\mgt[[:space:]]*;', '>', 'g');
  -- r2 (2): truncated entity tails at end-of-text, with punctuation handling.
  -- (a) ".&lt." style: punct before AND after the fragment (same char) -> keep one.
  s := regexp_replace(s, '([.,;:!?)\]])&(#[xX][0-9a-fA-F]{0,6}|#[0-9]{0,7}|lt|gt|am|amp|qu|quo|quot|ap|apo|apos|nb|nbs|nbsp|hel|hell|helli|hellip|mda|mdas|mdash|nda|ndas|ndash|lsq|lsqu|lsquo|rsq|rsqu|rsquo|ldq|ldqu|ldquo|rdq|rdqu|rdquo|mid|midd|middo|middot|bul|bull|cop|copy|reg|tra|trad|trade|deg)\1[[:space:]]*$', '\1', 'g');
  -- (b) named/numeric fragment + optional trailing punct -> keep punct.
  s := regexp_replace(s, '&(#[xX][0-9a-fA-F]{0,6}|#[0-9]{0,7}|lt|gt|am|amp|qu|quo|quot|ap|apo|apos|nb|nbs|nbsp|hel|hell|helli|hellip|mda|mdas|mdash|nda|ndas|ndash|lsq|lsqu|lsquo|rsq|rsqu|rsquo|ldq|ldqu|ldquo|rdq|rdqu|rdquo|mid|midd|middo|middot|bul|bull|cop|copy|reg|tra|trad|trade|deg)([.,;:!?)\]]*)[[:space:]]*$', '\2', 'g');
  -- (c) bare trailing '&' + optional trailing punct -> keep punct ("war&." -> "war.").
  s := regexp_replace(s, '&([[:space:]]*[.,;:!?)\]]*)$', '\1', 'g');
  s := regexp_replace(s, '[[:space:]]+', ' ', 'g');
  RETURN btrim(s);
END
$func$;
