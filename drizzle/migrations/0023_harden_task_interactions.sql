REVOKE UPDATE ON public.task_questions FROM authenticated;
DROP POLICY IF EXISTS "own questions cancel" ON public.task_questions;
REVOKE UPDATE ON public.task_suggestions FROM authenticated;
DROP POLICY IF EXISTS "own suggestions update" ON public.task_suggestions;

CREATE OR REPLACE FUNCTION public.answer_task_question(_question uuid, _answer jsonb, _key text, _skip boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q public.task_questions;
  changed integer := 0;
  remaining integer := 0;
BEGIN
  IF _key IS NULL OR length(_key) < 8 OR length(_key) > 80 THEN
    RAISE EXCEPTION 'invalid idempotency key';
  END IF;
  SELECT * INTO q FROM public.task_questions WHERE id = _question AND user_id = auth.uid() FOR UPDATE;
  IF q.id IS NULL THEN RAISE EXCEPTION 'not allowed'; END IF;
  PERFORM 1 FROM public.agent_sessions WHERE id = q.session_id AND user_id = auth.uid() FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.task_questions WHERE session_id = q.session_id AND answer_key = _key AND id <> _question) THEN
    RAISE EXCEPTION 'duplicate idempotency key';
  END IF;
  UPDATE public.task_questions
  SET status = CASE WHEN _skip THEN 'skipped' ELSE 'answered' END,
      answer = _answer, answer_key = _key, answered_at = now()
  WHERE id = _question AND user_id = auth.uid() AND status = 'open';
  GET DIAGNOSTICS changed = ROW_COUNT;
  SELECT count(*) INTO remaining FROM public.task_questions
  WHERE session_id = q.session_id AND status = 'open' AND run_id IS NOT DISTINCT FROM q.run_id;
  IF changed > 0 AND q.run_id IS NOT NULL THEN
    BEGIN
      PERFORM public.engine_event(q.run_id, 'question.answered', jsonb_build_object('question', _question, 'skipped', _skip));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN jsonb_build_object('changed', changed > 0, 'remaining', remaining, 'resume', changed > 0 AND remaining = 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_task_suggestion(_suggestion uuid, _decision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.task_suggestions;
BEGIN
  IF _decision NOT IN ('accepted', 'rejected', 'discussed') THEN
    RAISE EXCEPTION 'invalid suggestion decision';
  END IF;
  SELECT * INTO s FROM public.task_suggestions WHERE id = _suggestion AND user_id = auth.uid() FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF s.status NOT IN ('proposed', 'discussed') THEN
    RETURN jsonb_build_object('changed', false, 'title', s.title, 'recommended_approach', s.recommended_approach);
  END IF;
  UPDATE public.task_suggestions SET status = _decision, decided_at = now()
  WHERE id = _suggestion AND user_id = auth.uid();
  RETURN jsonb_build_object('changed', true, 'title', s.title, 'recommended_approach', s.recommended_approach, 'decision', _decision);
END;
$$;

REVOKE ALL ON FUNCTION public.answer_task_question(uuid, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.answer_task_question(uuid, jsonb, text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.decide_task_suggestion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_task_suggestion(uuid, text) TO authenticated;