-- AUD-274: make a board create request safe to replay after a lost response.
-- NULL keys preserve compatibility with existing rows and older API clients.
ALTER TABLE public.boards
  ADD COLUMN IF NOT EXISTS create_request_id uuid,
  ADD COLUMN IF NOT EXISTS create_request_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_boards_project_create_request
  ON public.boards (project_id, create_request_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'boards_create_request_fingerprint_check'
      AND conrelid = 'public.boards'::regclass
  ) THEN
    ALTER TABLE public.boards
      ADD CONSTRAINT boards_create_request_fingerprint_check
      CHECK (
        (create_request_id IS NULL AND create_request_fingerprint IS NULL)
        OR
        (create_request_id IS NOT NULL AND create_request_fingerprint ~ '^[0-9a-f]{64}$')
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.boards.create_request_id IS
  'Client-generated UUID used to replay one logical board creation without duplicates.';
COMMENT ON COLUMN public.boards.create_request_fingerprint IS
  'SHA-256 fingerprint of the immutable create payload; rejects reuse of a request key with different content.';
