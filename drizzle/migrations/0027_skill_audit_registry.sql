ALTER TABLE public.skills ADD COLUMN registry jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE public.skill_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 name text NOT NULL,
 instructions text NOT NULL,
 source text,
 registry jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.skill_revisions TO authenticated;
GRANT ALL ON public.skill_revisions TO service_role;
ALTER TABLE public.skill_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_skill_revisions ON public.skill_revisions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX skill_revisions_owner_skill ON public.skill_revisions(user_id, skill_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.record_skill_revision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF ROW(OLD.name, OLD.instructions, OLD.source, OLD.registry) IS DISTINCT FROM ROW(NEW.name, NEW.instructions, NEW.source, NEW.registry) THEN
 INSERT INTO public.skill_revisions(skill_id,user_id,name,instructions,source,registry) VALUES (OLD.id,OLD.user_id,OLD.name,OLD.instructions,OLD.source,OLD.registry);
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_skill_revision() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER record_skill_revision BEFORE UPDATE ON public.skills FOR EACH ROW EXECUTE FUNCTION public.record_skill_revision();