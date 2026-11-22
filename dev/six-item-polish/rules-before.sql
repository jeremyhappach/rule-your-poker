CREATE OR REPLACE FUNCTION private.ptown_words_rules_for(version text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT CASE version WHEN 'ptown-words/1' THEN base WHEN 'ptown-words/2' THEN
 base||'{"version":"ptown-words/2","timeBankUses":2,"timeBankMs":180000}'::jsonb WHEN 'ptown-words/3' THEN base||'{"version":"ptown-words/3","turnMs":129600000,"expiryDisposition":"forfeit"}'::jsonb WHEN 'ptown-words/4' THEN base||'{"version":"ptown-words/4","turnMs":300000,"timeBankUses":2,"timeBankMs":180000}'::jsonb END
 FROM (SELECT '{"version":"ptown-words/1","dictionaryId":"enable2k/1","dictionarySha256":"d5ec7b3b1d35db798cee044fe3ec37e7cc0a96a00dee5695ad34c767f1797925","turnMs":180000,"exchangeMinimum":7,"passCycles":2,"bingo":50}'::jsonb base) r
$function$;
