CREATE FUNCTION pg_temp.words_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Ptown Words proof: %',label;END IF;END $$;
CREATE FUNCTION pg_temp.words_tile(id int,face text,letter text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('id',id,'face',face,'value',private.ptown_words_value(face))||CASE WHEN letter IS NOT NULL THEN jsonb_build_object('letter',letter,'blank',face='?') ELSE '{}'::jsonb END $$;
CREATE FUNCTION pg_temp.words_state(rack jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s jsonb;
BEGIN
 s:=private.ptown_words_deal(jsonb_build_object('rules',private.ptown_words_rules(),'players',jsonb_build_array(jsonb_build_object('id','p1'),jsonb_build_object('id','p2'))),1000);
 RETURN s||jsonb_build_object('turnIndex',0,'racks',jsonb_build_object('p1',rack,'p2',jsonb_build_array(pg_temp.words_tile(99,'Q'))));
END $$;
DO $$
#variable_conflict use_column
DECLARE s jsonb;t jsonb;u jsonb;b jsonb;rack jsonb;items jsonb;i int;v int;
BEGIN
 PERFORM pg_temp.words_assert((SELECT count(*)=173528 FROM private.ptown_words_lexicon),'full vocabulary');
 PERFORM pg_temp.words_assert((SELECT count(*)=3 FROM private.ptown_words_lexicon WHERE word IN('XYLYL','QUIXOTRY','ZYZZYVA')),'obscure legal words');
 PERFORM pg_temp.words_assert(NOT EXISTS(SELECT 1 FROM private.ptown_words_lexicon WHERE word IN('QI','ZA','ZZZZZZ')),'no silent supplementation');
 SELECT jsonb_agg(pg_temp.words_tile(i,substr('CAT',i+1,1))) INTO rack FROM generate_series(0,2)i;
 s:=pg_temp.words_state(rack);t:=private.ptown_words_reduce(s,'place','[{"tileId":0,"square":111,"letter":"C"},{"tileId":1,"square":112,"letter":"A"},{"tileId":2,"square":113,"letter":"T"}]',2000);
 PERFORM pg_temp.words_assert(t#>>'{scores,p1}'='10' AND jsonb_array_length(t#>'{racks,p1}')=7,'center double word and refill');
 s:=pg_temp.words_state(jsonb_build_array(pg_temp.words_tile(0,'C'),pg_temp.words_tile(1,'?'),pg_temp.words_tile(2,'T')));
 t:=private.ptown_words_reduce(s,'place','[{"tileId":0,"square":111,"letter":"C"},{"tileId":1,"square":112,"letter":"A"},{"tileId":2,"square":113,"letter":"T"}]',2000);
 PERFORM pg_temp.words_assert(t#>>'{scores,p1}'='8' AND t#>>'{board,112,value}'='0','assigned blank remains zero on premium');
 SELECT jsonb_agg(pg_temp.words_tile(i,substr('RETAINS',i+1,1))),jsonb_agg(jsonb_build_object('tileId',i,'square',109+i,'letter',substr('RETAINS',i+1,1))) INTO rack,items FROM generate_series(0,6)i;
 t:=private.ptown_words_reduce(pg_temp.words_state(rack),'place',items,2000);
 PERFORM pg_temp.words_assert(t#>>'{scores,p1}'='64','seven-tile bingo 50 plus center 14');
 s:=pg_temp.words_state(jsonb_build_array(pg_temp.words_tile(0,'T'),pg_temp.words_tile(1,'O')));
 s:=jsonb_set(jsonb_set(s,'{board,97}',pg_temp.words_tile(50,'A','A')),'{board,98}',pg_temp.words_tile(51,'T','T'));
 t:=private.ptown_words_reduce(s,'place','[{"tileId":0,"square":112,"letter":"T"},{"tileId":1,"square":113,"letter":"O"}]',2000);
 PERFORM pg_temp.words_assert(t#>>'{scores,p1}'='10' AND jsonb_array_length(t#>'{moves,0,words}')=3,'primary and both perpendiculars scored');
 s:=jsonb_set(s,'{racks,p1}',jsonb_build_array(pg_temp.words_tile(0,'A'),pg_temp.words_tile(1,'X')));
 BEGIN PERFORM private.ptown_words_reduce(s,'place','[{"tileId":0,"square":112,"letter":"A"},{"tileId":1,"square":113,"letter":"X"}]',2000);RAISE EXCEPTION 'missing invalid cross';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:invalid_word:TX' THEN RAISE;END IF;END;
 s:=pg_temp.words_state(jsonb_build_array(pg_temp.words_tile(0,'C'),pg_temp.words_tile(1,'A')));
 BEGIN PERFORM private.ptown_words_reduce(s,'place','[{"tileId":0,"square":112,"letter":"C"},{"tileId":1,"square":114,"letter":"A"}]',2000);RAISE EXCEPTION 'missing gap';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:gap' THEN RAISE;END IF;END;
 SELECT jsonb_agg(pg_temp.words_tile(i,'E')) INTO b FROM generate_series(60,65)i;s:=s||jsonb_build_object('bag',b);
 BEGIN PERFORM private.ptown_words_reduce(s,'exchange','[{"tileId":0}]',2000);RAISE EXCEPTION 'missing exchange limit';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:need_seven_in_bag' THEN RAISE;END IF;END;
 s:=s||jsonb_build_object('bag',b||jsonb_build_array(pg_temp.words_tile(66,'E')));
 t:=private.ptown_words_reduce(s,'exchange','[{"tileId":0}]',2000);
 PERFORM pg_temp.words_assert(t#>>'{racks,p1,0,face}'='A' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(t#>'{racks,p1}')x WHERE x->>'id'='0'),'exchange draws before return');
 s:=pg_temp.words_state(jsonb_build_array(pg_temp.words_tile(0,'C'),pg_temp.words_tile(1,'A'),pg_temp.words_tile(2,'T')))||'{"bag":[]}'::jsonb;
 t:=private.ptown_words_reduce(s,'place','[{"tileId":0,"square":111,"letter":"C"},{"tileId":1,"square":112,"letter":"A"},{"tileId":2,"square":113,"letter":"T"}]',2000);
 PERFORM pg_temp.words_assert(t->>'phase'='complete' AND t#>>'{scores,p1}'='20' AND t#>>'{scores,p2}'='-10' AND t#>>'{winnerIds,0}'='p1','rack-out deductions and bonus');
 s:=pg_temp.words_state(jsonb_build_array(pg_temp.words_tile(0,'A')));FOR i IN 1..3 LOOP s:=private.ptown_words_reduce(s,'pass',NULL,2000+i);END LOOP;
 PERFORM pg_temp.words_assert(s->>'phase'='playing','three passes do not end two-player match');
 t:=private.ptown_words_reduce(s,'pass',NULL,2004);PERFORM pg_temp.words_assert(t->>'phase'='complete' AND t#>>'{scores,p1}'='-1' AND t#>>'{scores,p2}'='-10','two full pass circuits');
 SELECT count(*) INTO v FROM generate_series(0,224)i WHERE private.ptown_words_premium(i)='TW';PERFORM pg_temp.words_assert(v=8,'8 triple words');
 SELECT count(*) INTO v FROM generate_series(0,224)i WHERE private.ptown_words_premium(i)='DW';PERFORM pg_temp.words_assert(v=17,'17 double words');
 SELECT count(*) INTO v FROM generate_series(0,224)i WHERE private.ptown_words_premium(i)='TL';PERFORM pg_temp.words_assert(v=12,'12 triple letters');
 SELECT count(*) INTO v FROM generate_series(0,224)i WHERE private.ptown_words_premium(i)='DL';PERFORM pg_temp.words_assert(v=24,'24 double letters');
 s:=private.ptown_words_deal(jsonb_build_object('rules',private.ptown_words_rules(),'players',jsonb_build_array(jsonb_build_object('id','a'),jsonb_build_object('id','b'),jsonb_build_object('id','c'),jsonb_build_object('id','d'))),1000);
 PERFORM pg_temp.words_assert(jsonb_array_length(s->'bag')=72 AND (SELECT sum(jsonb_array_length(value))=28 FROM jsonb_each(s->'racks')),'four-player 100-tile conservation');
 PERFORM pg_temp.words_assert(NOT(private.ptown_words_visible(s,'a')?'bag') AND NOT(private.ptown_words_visible(s,'a')?'racks') AND jsonb_array_length(private.ptown_words_visible(s,'a')->'rack')=7 AND private.ptown_words_visible(s)->'rack'='[]'::jsonb,'rack/bag/history privacy');
END $$;
SELECT 'Ptown Words core proof passed' proof;
