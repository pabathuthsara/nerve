-- The scene the engine is given and the scene line the user reads are not the
-- same sentence. `scene` is stage direction written for the model — "quiet,
-- near the fiction shelves" — and it reads as noise under a name on a card.
-- `setting_label` is the label. Both are authored in the registry and seeded
-- together, so they can differ in register without differing in fact.

alter table public.personas add column setting_label text;
