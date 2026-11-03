CREATE OR REPLACE FUNCTION public.consume_session_interjections(_session uuid)
RETURNS TABLE(content text, created_at timestamptz) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.session_interjections i SET consumed_at = now()
  WHERE i.session_id = _session AND i.user_id = auth.uid() AND i.consumed_at IS NULL
  RETURNING i.content, i.created_at;
$$;
REVOKE ALL ON FUNCTION public.consume_session_interjections(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.consume_session_interjections(uuid) TO authenticated;