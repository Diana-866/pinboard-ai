-- Keep a board's UI category separate from its human-readable description.
-- Older manually-created boards stored one of these category labels in description.
ALTER TABLE public.boards
  ADD COLUMN IF NOT EXISTS category text;

UPDATE public.boards
SET category = btrim(description)
WHERE category IS NULL
  AND btrim(COALESCE(description, '')) IN (
    'Home Decor',
    'Recipes',
    'Wellness',
    'Travel',
    'Digital Products',
    'Fashion'
  );

COMMENT ON COLUMN public.boards.category IS
  'Optional board category label; distinct from description, which may contain generated SEO copy.';
