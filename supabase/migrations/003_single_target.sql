-- Goals get one target instead of a range. The target becomes the top of the old range
-- (40–60 -> 60; ranking 3–1 -> 1, because for lower_is_better goals the "top" is the best value).
-- Run after 001 and 002 in Supabase -> SQL Editor.
begin;

update public.goals
set target = target_high
where target_high is not null;

alter table public.goals drop column target_high;

commit;
