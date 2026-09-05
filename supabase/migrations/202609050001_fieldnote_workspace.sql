begin;

create table if not exists public.fieldnote_workspaces (
  id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.fieldnote_workspaces is
  'Transactional source of truth for one Fieldnote workflow workspace.';

create index if not exists fieldnote_workspaces_state_gin
  on public.fieldnote_workspaces using gin (state jsonb_path_ops);

alter table public.fieldnote_workspaces enable row level security;
revoke all on table public.fieldnote_workspaces from public, anon, authenticated;
grant select, insert, update on table public.fieldnote_workspaces to service_role;

create or replace function public.fieldnote_compare_and_swap_workspace(
  p_workspace_id text,
  p_expected_revision bigint,
  p_state jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed integer;
begin
  if jsonb_typeof(p_state) <> 'object' then
    raise exception 'Workspace state must be a JSON object';
  end if;

  update public.fieldnote_workspaces
     set state = p_state,
         revision = revision + 1,
         updated_at = now()
   where id = p_workspace_id
     and revision = p_expected_revision;

  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.fieldnote_compare_and_swap_workspace(text, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.fieldnote_compare_and_swap_workspace(text, bigint, jsonb)
  to service_role;

create or replace view public.fieldnote_projects
with (security_invoker = true)
as
select
  id as workspace_id,
  revision,
  state -> 'config' as configuration,
  created_at,
  updated_at
from public.fieldnote_workspaces;

create or replace view public.fieldnote_team_members
with (security_invoker = true)
as
select
  workspace.id as workspace_id,
  member ->> 'email' as email,
  member ->> 'role' as role
from public.fieldnote_workspaces as workspace
cross join lateral jsonb_array_elements(coalesce(workspace.state -> 'members', '[]'::jsonb)) as member;

create or replace view public.fieldnote_tasks
with (security_invoker = true)
as
select
  workspace.id as workspace_id,
  task ->> 'id' as task_id,
  task ->> 'name' as filename,
  task ->> 'contributor' as contributor_id,
  task ->> 'status' as status,
  task ->> 'audioKey' as audio_key,
  task ->> 'mime' as mime_type,
  (task ->> 'bytes')::bigint as byte_size,
  task ->> 'checksum' as sha256,
  task ->> 'language' as language,
  task ->> 'locale' as locale,
  task ->> 'transcript' as current_transcript,
  task ->> 'originalTranscript' as original_transcript,
  task ->> 'source' as transcript_source,
  coalesce((task ->> 'streak')::integer, 0) as no_edit_streak,
  task -> 'quality' as audio_quality,
  to_timestamp((task ->> 'created')::numeric / 1000) as created_at
from public.fieldnote_workspaces as workspace
cross join lateral jsonb_array_elements(coalesce(workspace.state -> 'tasks', '[]'::jsonb)) as task;

create or replace view public.fieldnote_audio_assets
with (security_invoker = true)
as
select
  workspace_id,
  task_id,
  audio_key,
  filename,
  mime_type,
  byte_size,
  sha256,
  audio_quality,
  created_at
from public.fieldnote_tasks;

create or replace view public.fieldnote_quick_reviews
with (security_invoker = true)
as
select
  workspace.id as workspace_id,
  task ->> 'id' as task_id,
  task #>> '{quick,actor}' as reviewer,
  coalesce((task #>> '{quick,approved}')::boolean, false) as approved,
  task #>> '{quick,note}' as feedback,
  to_timestamp((task #>> '{quick,at}')::numeric / 1000) as reviewed_at
from public.fieldnote_workspaces as workspace
cross join lateral jsonb_array_elements(coalesce(workspace.state -> 'tasks', '[]'::jsonb)) as task
where task ? 'quick';

create or replace view public.fieldnote_rounds
with (security_invoker = true)
as
select
  workspace.id as workspace_id,
  (round_record ->> 'number')::integer as round_number,
  round_record ->> 'status' as status,
  round_record -> 'taskIds' as task_ids,
  to_timestamp((round_record ->> 'opened')::numeric / 1000) as opened_at,
  case
    when round_record ? 'closed'
      then to_timestamp((round_record ->> 'closed')::numeric / 1000)
    else null
  end as closed_at
from public.fieldnote_workspaces as workspace
cross join lateral jsonb_array_elements(coalesce(workspace.state -> 'rounds', '[]'::jsonb)) as round_record;

create or replace view public.fieldnote_deep_reviews
with (security_invoker = true)
as
select
  workspace.id as workspace_id,
  task ->> 'id' as task_id,
  (review ->> 'round')::integer as round_number,
  review ->> 'actor' as reviewer,
  (review ->> 'edited')::boolean as edited,
  review ->> 'before' as previous_transcript,
  review ->> 'after' as submitted_transcript,
  to_timestamp((review ->> 'at')::numeric / 1000) as reviewed_at
from public.fieldnote_workspaces as workspace
cross join lateral jsonb_array_elements(coalesce(workspace.state -> 'tasks', '[]'::jsonb)) as task
cross join lateral jsonb_array_elements(coalesce(task -> 'reviews', '[]'::jsonb)) as review;

create or replace view public.fieldnote_transcription_jobs
with (security_invoker = true)
as
select
  workspace.id as workspace_id,
  task ->> 'id' as task_id,
  task ->> 'status' as task_status,
  coalesce((task #>> '{job,attempts}')::integer, 0) as attempts,
  task #>> '{job,error}' as last_error,
  task #>> '{job,lease}' as lease_id,
  case
    when task #>> '{job,nextAttempt}' is not null
      then to_timestamp((task #>> '{job,nextAttempt}')::numeric / 1000)
    else null
  end as next_attempt_at,
  case
    when task #>> '{job,leaseUntil}' is not null
      then to_timestamp((task #>> '{job,leaseUntil}')::numeric / 1000)
    else null
  end as lease_expires_at
from public.fieldnote_workspaces as workspace
cross join lateral jsonb_array_elements(coalesce(workspace.state -> 'tasks', '[]'::jsonb)) as task;

create or replace view public.fieldnote_audit_log
with (security_invoker = true)
as
select
  workspace.id as workspace_id,
  audit ->> 'actor' as actor,
  audit ->> 'action' as action,
  audit ->> 'taskId' as task_id,
  to_timestamp((audit ->> 'at')::numeric / 1000) as occurred_at
from public.fieldnote_workspaces as workspace
cross join lateral jsonb_array_elements(coalesce(workspace.state -> 'audit', '[]'::jsonb)) as audit;

create or replace view public.fieldnote_ready_to_deliver
with (security_invoker = true)
as
select *
from public.fieldnote_tasks
where status = 'READY_TO_DELIVER';

revoke all on table
  public.fieldnote_projects,
  public.fieldnote_team_members,
  public.fieldnote_tasks,
  public.fieldnote_audio_assets,
  public.fieldnote_quick_reviews,
  public.fieldnote_rounds,
  public.fieldnote_deep_reviews,
  public.fieldnote_transcription_jobs,
  public.fieldnote_audit_log,
  public.fieldnote_ready_to_deliver
from public, anon, authenticated;

grant select on table
  public.fieldnote_projects,
  public.fieldnote_team_members,
  public.fieldnote_tasks,
  public.fieldnote_audio_assets,
  public.fieldnote_quick_reviews,
  public.fieldnote_rounds,
  public.fieldnote_deep_reviews,
  public.fieldnote_transcription_jobs,
  public.fieldnote_audit_log,
  public.fieldnote_ready_to_deliver
to service_role;

commit;
