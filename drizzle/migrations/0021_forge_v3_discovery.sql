ALTER TABLE public.agent_sessions
  ADD COLUMN IF NOT EXISTS reasoning_profile text NOT NULL DEFAULT 'auto' CHECK (reasoning_profile IN ('auto','speed','balanced','deep')),
  ADD COLUMN IF NOT EXISTS coding_model text,
  ADD COLUMN IF NOT EXISTS reviewer_model text;

CREATE TABLE public.task_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  run_id uuid,
  position int NOT NULL DEFAULT 0,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '',
  type text NOT NULL CHECK (type IN ('single_select','multi_select','text','confirmation')),
  required boolean NOT NULL DEFAULT true,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_option_ids text[] NOT NULL DEFAULT '{}',
  recommendation_reason text NOT NULL DEFAULT '',
  safe_default text,
  allow_custom_answer boolean NOT NULL DEFAULT false,
  allow_skip boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','skipped','cancelled')),
  answer jsonb,
  answer_key text,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, answer_key)
);
CREATE INDEX task_questions_session_idx ON public.task_questions (session_id, status, created_at);
GRANT SELECT, INSERT, UPDATE ON public.task_questions TO authenticated;
GRANT ALL ON public.task_questions TO service_role;
ALTER TABLE public.task_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own questions read" ON public.task_questions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own questions insert" ON public.task_questions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'open' AND answer IS NULL AND EXISTS (SELECT 1 FROM public.agent_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));
CREATE POLICY "own questions cancel" ON public.task_questions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.task_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  run_id uuid,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '',
  requested_approach text NOT NULL DEFAULT '',
  recommended_approach text NOT NULL,
  rationale text NOT NULL DEFAULT '',
  expected_benefit text[] NOT NULL DEFAULT '{}',
  complexity text NOT NULL CHECK (complexity IN ('low','medium','high')),
  risk text NOT NULL DEFAULT '',
  estimated_impact text NOT NULL CHECK (estimated_impact IN ('low','medium','high')),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','rejected','discussed','implemented')),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_suggestions_session_idx ON public.task_suggestions (session_id, created_at);
GRANT SELECT, INSERT, UPDATE ON public.task_suggestions TO authenticated;
GRANT ALL ON public.task_suggestions TO service_role;
ALTER TABLE public.task_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own suggestions read" ON public.task_suggestions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own suggestions insert" ON public.task_suggestions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'proposed' AND EXISTS (SELECT 1 FROM public.agent_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));
CREATE POLICY "own suggestions update" ON public.task_suggestions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.task_specifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  run_id uuid,
  version int NOT NULL,
  task_class text NOT NULL CHECK (task_class IN ('small','medium','large','high_risk')),
  spec jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, version)
);
GRANT SELECT, INSERT ON public.task_specifications TO authenticated;
GRANT ALL ON public.task_specifications TO service_role;
ALTER TABLE public.task_specifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own specs read" ON public.task_specifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own specs insert" ON public.task_specifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.agent_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

-- Atomic, idempotent answer: saves the answer and marks it answered in one statement; only the
-- call that closes the last open required question of the run gets resume=true.
CREATE OR REPLACE FUNCTION public.answer_task_question(_question uuid, _answer jsonb, _key text, _skip boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q task_questions; changed int; remaining int;
BEGIN
  SELECT * INTO q FROM task_questions WHERE id = _question AND user_id = auth.uid();
  IF q.id IS NULL THEN RAISE EXCEPTION 'not allowed'; END IF;
  -- Serialize answers per task so two final answers cannot both resume.
  PERFORM 1 FROM agent_sessions WHERE id = q.session_id AND user_id = auth.uid() FOR UPDATE;
  IF EXISTS (SELECT 1 FROM task_questions WHERE session_id = q.session_id AND answer_key = _key AND id <> _question) THEN
    RAISE EXCEPTION 'duplicate idempotency key';
  END IF;
  UPDATE task_questions SET status = CASE WHEN _skip THEN 'skipped' ELSE 'answered' END, answer = _answer, answer_key = _key, answered_at = now()
   WHERE id = _question AND status = 'open';
  GET DIAGNOSTICS changed = ROW_COUNT;
  SELECT count(*) INTO remaining FROM task_questions
   WHERE session_id = q.session_id AND status = 'open' AND required AND run_id IS NOT DISTINCT FROM q.run_id;
  IF changed > 0 AND q.run_id IS NOT NULL THEN
    BEGIN PERFORM engine_event(q.run_id, 'question.answered', jsonb_build_object('question', _question, 'skipped', _skip)); EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN jsonb_build_object('changed', changed > 0, 'remaining', remaining, 'resume', changed > 0 AND remaining = 0);
END $$;
REVOKE ALL ON FUNCTION public.answer_task_question(uuid, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.answer_task_question(uuid, jsonb, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.engine_stage_allowed(_from text, _to text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _from
    WHEN 'RECEIVED' THEN _to IN ('DISCOVERING','FAILED','CANCELLED')
    WHEN 'DISCOVERING' THEN _to IN ('PLANNING','EXECUTING','AWAITING_INPUT','FAILED','CANCELLED','BLOCKED')
    WHEN 'PLANNING' THEN _to IN ('AWAITING_APPROVAL','AWAITING_INPUT','EXECUTING','COMPLETED','FAILED','CANCELLED','BLOCKED')
    WHEN 'EXECUTING' THEN _to IN ('VERIFYING','AWAITING_APPROVAL','AWAITING_INPUT','COMPLETED','FAILED','CANCELLED','BLOCKED')
    WHEN 'VERIFYING' THEN _to IN ('EXECUTING','REPAIRING','AWAITING_APPROVAL','AWAITING_INPUT','COMPLETED','FAILED','CANCELLED','BLOCKED')
    WHEN 'REPAIRING' THEN _to IN ('EXECUTING','VERIFYING','AWAITING_INPUT','FAILED','CANCELLED','BLOCKED')
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.engine_transition(_run uuid, _to text, _reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur text;
BEGIN
  SELECT stage INTO cur FROM agent_runs WHERE id = _run AND user_id = auth.uid() FOR UPDATE;
  IF cur IS NULL THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT engine_stage_allowed(cur, _to) THEN RETURN false; END IF;
  UPDATE agent_runs SET stage = _to,
    ended_at = CASE WHEN _to IN ('COMPLETED','FAILED','CANCELLED','BLOCKED','AWAITING_APPROVAL','AWAITING_INPUT') THEN now() ELSE NULL END,
    outcome = CASE WHEN _to IN ('COMPLETED','FAILED','CANCELLED','BLOCKED','AWAITING_APPROVAL','AWAITING_INPUT') THEN lower(_to) ELSE outcome END
   WHERE id = _run;
  INSERT INTO agent_run_transitions (run_id, user_id, from_stage, to_stage, reason) VALUES (_run, auth.uid(), cur, _to, left(_reason, 300));
  PERFORM engine_event(_run, 'stage.changed', jsonb_build_object('from', cur, 'to', _to, 'reason', left(_reason, 300)));
  RETURN true;
END $$;