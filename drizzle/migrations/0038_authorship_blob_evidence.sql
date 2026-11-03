ALTER TABLE public.change_provenance ADD COLUMN blob_sha text;
COMMENT ON COLUMN public.change_provenance.blob_sha IS 'Git blob SHA of authored content, matched against current diff to avoid attributing later human edits to an earlier agent write.';
CREATE INDEX change_provenance_blob_idx ON public.change_provenance (session_id, path, blob_sha);