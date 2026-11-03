ALTER TABLE public.project_memories DROP CONSTRAINT IF EXISTS project_memories_category_check;
ALTER TABLE public.project_memories ADD CONSTRAINT project_memories_category_check CHECK (category = ANY (ARRAY['project','preference','decision','error','episodic','semantic','procedural']));
ALTER TABLE public.project_memories
  ADD COLUMN IF NOT EXISTS confidence real NOT NULL DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  ADD COLUMN IF NOT EXISTS sensitivity text NOT NULL DEFAULT 'internal' CHECK (sensitivity IN ('public','internal','confidential')),
  ADD COLUMN IF NOT EXISTS source_ref text,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','stale','superseded')),
  ADD COLUMN IF NOT EXISTS supersedes uuid;