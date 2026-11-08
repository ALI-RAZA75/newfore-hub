-- Goals become weekly. Run once, after 003, in Supabase -> SQL Editor.
--
-- "sum" metrics (visits, leads, clicks, views, calls...) were 28-day numbers: divide target and
-- baseline by 4, rounded to a whole number, minimum 1 (a 0 stays 0).
-- "count" (AI platforms, top-5 searches), "avg" (rankings) and "snapshot" (review totals) goals,
-- and goals updated by hand, are left as they are.
--
-- Only goals created before 2026-11-10 are converted: fresh installs seed weekly targets already
-- (002_seed_plan.sql), and this keeps them from being divided twice.
--
-- 1) Preview first (changes nothing):
--
-- select g.label, g.metric_key, g.baseline, g.target,
--        case when g.baseline > 0 then greatest(1, round(g.baseline / 4.0)) else g.baseline end as new_baseline,
--        case when g.target   > 0 then greatest(1, round(g.target   / 4.0)) else g.target   end as new_target
-- from public.goals g
-- where g.metric_key in ('ai_sessions_28d','ai_leads_28d','total_leads_28d','sessions_28d','maps_sessions_28d',
--   'organic_sessions_28d','question_impressions_28d','brand_clicks_28d','nonbrand_clicks_28d','gsc_clicks_28d',
--   'gsc_impressions_28d','gbp_calls_28d','gbp_website_28d','gbp_directions_28d','gbp_views_28d')
--   and g.created_at < '2026-11-10'
-- order by g.plan_id, g.sort;

-- 2) Convert:
begin;

update public.goals
set baseline = case when baseline > 0 then greatest(1, round(baseline / 4.0)) else baseline end,
    target   = case when target   > 0 then greatest(1, round(target   / 4.0)) else target   end
where metric_key in ('ai_sessions_28d','ai_leads_28d','total_leads_28d','sessions_28d','maps_sessions_28d',
  'organic_sessions_28d','question_impressions_28d','brand_clicks_28d','nonbrand_clicks_28d','gsc_clicks_28d',
  'gsc_impressions_28d','gbp_calls_28d','gbp_website_28d','gbp_directions_28d','gbp_views_28d')
  and created_at < '2026-11-10';

commit;
