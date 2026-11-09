-- Run after migration 111 in the disposable PostgreSQL integration database.
DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_replayed uuid;
  v_count integer;
  v_key uuid := gen_random_uuid();
  v_fingerprint text := repeat('a', 64);
BEGIN
  INSERT INTO public.users(id, email)
  VALUES (v_user, 'board-idempotency-' || v_user || '@example.invalid');

  INSERT INTO public.projects(user_id, niche)
  VALUES (v_user, 'board idempotency test')
  RETURNING id INTO v_project;

  -- First request creates the row; replay uses the same conflict target and
  -- must not create another board even if two requests race.
  INSERT INTO public.boards(
    project_id, title, description, status,
    create_request_id, create_request_fingerprint
  )
  VALUES (
    v_project, 'Travel ideas', 'Travel', 'new', v_key, v_fingerprint
  )
  ON CONFLICT (project_id, create_request_id) DO NOTHING
  RETURNING id INTO v_board;

  IF v_board IS NULL THEN
    RAISE EXCEPTION 'first idempotent board insert did not create a row';
  END IF;

  INSERT INTO public.boards(
    project_id, title, description, status,
    create_request_id, create_request_fingerprint
  )
  VALUES (
    v_project, 'Travel ideas', 'Travel', 'new', v_key, v_fingerprint
  )
  ON CONFLICT (project_id, create_request_id) DO NOTHING;

  SELECT id INTO v_replayed
    FROM public.boards
   WHERE project_id = v_project AND create_request_id = v_key;
  SELECT count(*) INTO v_count
    FROM public.boards
   WHERE project_id = v_project AND create_request_id = v_key;

  IF v_replayed IS DISTINCT FROM v_board OR v_count <> 1 THEN
    RAISE EXCEPTION 'replayed board creation produced a duplicate or changed identity';
  END IF;

  -- Reusing a key with a different payload must not mutate the original row.
  INSERT INTO public.boards(
    project_id, title, description, status,
    create_request_id, create_request_fingerprint
  )
  VALUES (
    v_project, 'Different title', 'Travel', 'new', v_key, repeat('b', 64)
  )
  ON CONFLICT (project_id, create_request_id) DO NOTHING;

  IF (SELECT title FROM public.boards WHERE id = v_board) <> 'Travel ideas'
     OR (SELECT create_request_fingerprint FROM public.boards WHERE id = v_board) <> v_fingerprint THEN
    RAISE EXCEPTION 'conflicting replay mutated the original board';
  END IF;

  -- The DB check must reject a keyed request without a valid fingerprint.
  BEGIN
    INSERT INTO public.boards(
      project_id, title, create_request_id, create_request_fingerprint
    )
    VALUES (v_project, 'Invalid fingerprint', gen_random_uuid(), NULL);
    RAISE EXCEPTION 'board request without fingerprint unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;
