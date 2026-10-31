CREATE TABLE public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  stage text NOT NULL DEFAULT 'RECEIVED',
  objective text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  autonomy text NOT NULL DEFAULT '',
  trace_id text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  next_seq integer NOT NULL DEFAULT 0,
  outcome text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
GRANT SELECT ON public.agent_runs TO authenticated;
GRANT ALL ON public.agent_runs TO service_role;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own runs read" ON public.agent_runs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX agent_runs_session_idx ON public.agent_runs (session_id, started_at DESC);
CREATE INDEX agent_runs_user_idx ON public.agent_runs (user_id, started_at DESC);

CREATE TABLE public.agent_run_transitions (
  id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  from_stage text NOT NULL,
  to_stage text NOT NULL,
  actor text NOT NULL DEFAULT 'engine',
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agent_run_transitions TO authenticated;
GRANT ALL ON public.agent_run_transitions TO service_role;
ALTER TABLE public.agent_run_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transitions read" ON public.agent_run_transitions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX agent_run_transitions_run_idx ON public.agent_run_transitions (run_id, id);

CREATE TABLE public.agent_events (
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, seq)
);
GRANT SELECT ON public.agent_events TO authenticated;
GRANT ALL ON public.agent_events TO service_role;
ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events read" ON public.agent_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX agent_events_session_idx ON public.agent_events (session_id, created_at);

CREATE TABLE public.agent_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  trace_id text NOT NULL DEFAULT '',
  category text NOT NULL,
  service text NOT NULL,
  message text NOT NULL,
  retryable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agent_error_logs TO authenticated;
GRANT ALL ON public.agent_error_logs TO service_role;
ALTER TABLE public.agent_error_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own errors read" ON public.agent_error_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX agent_error_logs_user_idx ON public.agent_error_logs (user_id, created_at DESC);
CREATE INDEX agent_error_logs_session_idx ON public.agent_error_logs (session_id, created_at DESC);

CREATE TABLE public.skill_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  skill_name text NOT NULL,
  version_hash text NOT NULL,
  status text NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.skill_executions TO authenticated;
GRANT ALL ON public.skill_executions TO service_role;
ALTER TABLE public.skill_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own skill executions read" ON public.skill_executions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX skill_executions_run_idx ON public.skill_executions (run_id);

CREATE TABLE public.mcp_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  server_name text NOT NULL,
  tool_name text NOT NULL,
  decision text NOT NULL,
  ok boolean,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mcp_execution_logs TO authenticated;
GRANT ALL ON public.mcp_execution_logs TO service_role;
ALTER TABLE public.mcp_execution_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own mcp logs read" ON public.mcp_execution_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX mcp_execution_logs_user_idx ON public.mcp_execution_logs (user_id, created_at DESC);

CREATE TABLE public.project_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  repo text NOT NULL,
  category text NOT NULL CHECK (category IN ('project','preference','decision','error')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 3 AND 2000),
  source text NOT NULL DEFAULT 'agent',
  session_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_memories TO authenticated;
GRANT ALL ON public.project_memories TO service_role;
ALTER TABLE public.project_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memories" ON public.project_memories FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX project_memories_repo_idx ON public.project_memories (user_id, repo, updated_at DESC);

ALTER TABLE public.mcp_connections ADD COLUMN tool_policies jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.agent_sessions ADD COLUMN fallback_model text;

CREATE OR REPLACE FUNCTION public.engine_stage_allowed(_from text, _to text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _from
    WHEN 'RECEIVED' THEN _to IN ('DISCOVERING','FAILED','CANCELLED')
    WHEN 'DISCOVERING' THEN _to IN ('PLANNING','EXECUTING','FAILED','CANCELLED','BLOCKED')
    WHEN 'PLANNING' THEN _to IN ('AWAITING_APPROVAL','EXECUTING','COMPLETED','FAILED','CANCELLED','BLOCKED')
    WHEN 'EXECUTING' THEN _to IN ('VERIFYING','AWAITING_APPROVAL','COMPLETED','FAILED','CANCELLED','BLOCKED')
    WHEN 'VERIFYING' THEN _to IN ('EXECUTING','REPAIRING','AWAITING_APPROVAL','COMPLETED','FAILED','CANCELLED','BLOCKED')
    WHEN 'REPAIRING' THEN _to IN ('EXECUTING','VERIFYING','FAILED','CANCELLED','BLOCKED')
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.engine_start_run(_session uuid, _objective text, _provider text, _model text, _autonomy text)
RETURNS public.agent_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.agent_runs;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM agent_sessions WHERE id = _session AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  -- Close abandoned runs of this task so only one run is open.
  UPDATE agent_runs SET stage = 'FAILED', outcome = 'abandoned', ended_at = now()
   WHERE session_id = _session AND ended_at IS NULL;
  INSERT INTO agent_runs (session_id, user_id, objective, provider, model, autonomy, next_seq)
  VALUES (_session, auth.uid(), left(_objective, 500), _provider, _model, _autonomy, 1) RETURNING * INTO r;
  INSERT INTO agent_events (run_id, seq, user_id, session_id, type, payload)
  VALUES (r.id, 1, r.user_id, _session, 'run.created', jsonb_build_object('model', _model, 'autonomy', _autonomy));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.engine_event(_run uuid, _type text, _payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; r public.agent_runs;
BEGIN
  UPDATE agent_runs SET next_seq = next_seq + 1 WHERE id = _run AND user_id = auth.uid() RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'not allowed'; END IF;
  n := r.next_seq;
  INSERT INTO agent_events (run_id, seq, user_id, session_id, type, payload)
  VALUES (_run, n, r.user_id, r.session_id, left(_type, 60), CASE WHEN octet_length(_payload::text) > 8000 THEN jsonb_build_object('truncated', true) ELSE _payload END);
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.engine_transition(_run uuid, _to text, _reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur text;
BEGIN
  SELECT stage INTO cur FROM agent_runs WHERE id = _run AND user_id = auth.uid() FOR UPDATE;
  IF cur IS NULL THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF NOT engine_stage_allowed(cur, _to) THEN RETURN false; END IF;
  UPDATE agent_runs SET stage = _to,
    ended_at = CASE WHEN _to IN ('COMPLETED','FAILED','CANCELLED','BLOCKED','AWAITING_APPROVAL') THEN now() ELSE NULL END,
    outcome = CASE WHEN _to IN ('COMPLETED','FAILED','CANCELLED','BLOCKED','AWAITING_APPROVAL') THEN lower(_to) ELSE outcome END
   WHERE id = _run;
  INSERT INTO agent_run_transitions (run_id, user_id, from_stage, to_stage, reason) VALUES (_run, auth.uid(), cur, _to, left(_reason, 300));
  PERFORM engine_event(_run, 'stage.changed', jsonb_build_object('from', cur, 'to', _to, 'reason', left(_reason, 300)));
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.engine_record(_run uuid, _kind text, _row jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.agent_runs;
BEGIN
  SELECT * INTO r FROM agent_runs WHERE id = _run AND user_id = auth.uid();
  IF r.id IS NULL THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _kind = 'error' THEN
    INSERT INTO agent_error_logs (run_id, session_id, user_id, trace_id, category, service, message, retryable)
    VALUES (_run, r.session_id, r.user_id, r.trace_id, left(_row->>'category', 40), left(_row->>'service', 40), left(_row->>'message', 500), coalesce((_row->>'retryable')::boolean, false));
  ELSIF _kind = 'skill' THEN
    INSERT INTO skill_executions (run_id, user_id, skill_name, version_hash, status, reason)
    VALUES (_run, r.user_id, left(_row->>'name', 120), left(_row->>'hash', 64), left(_row->>'status', 20), left(_row->>'reason', 300));
  ELSIF _kind = 'mcp' THEN
    INSERT INTO mcp_execution_logs (run_id, user_id, session_id, server_name, tool_name, decision, ok, duration_ms)
    VALUES (_run, r.user_id, r.session_id, left(_row->>'server', 120), left(_row->>'tool', 160), left(_row->>'decision', 20), (_row->>'ok')::boolean, (_row->>'ms')::integer);
  ELSIF _kind = 'metrics' THEN
    UPDATE agent_runs SET metrics = _row WHERE id = _run;
  ELSE
    RAISE EXCEPTION 'unknown kind';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.engine_start_run(uuid, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.engine_event(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.engine_transition(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.engine_record(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.engine_start_run(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engine_event(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engine_transition(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engine_record(uuid, text, jsonb) TO authenticated;