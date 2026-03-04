-- Tighten Copilot data access to resource owners and add a masked admin-invite reader for the admin UI.

-- 1) Masked admin invite reader to avoid exposing raw email addresses to the client.
create or replace function public.get_admin_invites_masked()
returns table (
  id uuid,
  user_id uuid,
  created_at timestamp with time zone,
  accepted_at timestamp with time zone,
  last_resent_at timestamp with time zone,
  resend_count integer,
  status text,
  masked_email text
)
language sql
security definer
set search_path = public
as $$
  select
    ai.id,
    ai.user_id,
    ai.created_at,
    ai.accepted_at,
    ai.last_resent_at,
    ai.resend_count,
    ai.status,
    case
      when position('@' in ai.email) = 0 then ai.email
      else
        left(split_part(ai.email, '@', 1), least(2, length(split_part(ai.email, '@', 1))))
        || repeat('•', greatest(length(split_part(ai.email, '@', 1)) - least(2, length(split_part(ai.email, '@', 1))), 1))
        || '@'
        || split_part(ai.email, '@', 2)
    end as masked_email
  from public.admin_invites ai
  where public.has_role(auth.uid(), 'admin');
$$;

revoke all on function public.get_admin_invites_masked() from public;
grant execute on function public.get_admin_invites_masked() to authenticated;

-- 2) Tighten Copilot chat/message access to the owner of each conversation.
drop policy if exists "Admins can insert copilot messages" on public.copilot_messages;
drop policy if exists "Admins can view copilot messages" on public.copilot_messages;

create policy "Users can insert their own copilot messages"
on public.copilot_messages
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can view their own copilot messages"
on public.copilot_messages
for select
to authenticated
using (auth.uid() = user_id);

-- 3) Tighten Copilot campaign history access to the campaign creator.
drop policy if exists "Admins can insert copilot campaigns" on public.copilot_campaigns;
drop policy if exists "Admins can update copilot campaigns" on public.copilot_campaigns;
drop policy if exists "Admins can view copilot campaigns" on public.copilot_campaigns;

create policy "Users can insert their own copilot campaigns"
on public.copilot_campaigns
for insert
to authenticated
with check (auth.uid() = created_by);

create policy "Users can update their own copilot campaigns"
on public.copilot_campaigns
for update
to authenticated
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

create policy "Users can view their own copilot campaigns"
on public.copilot_campaigns
for select
to authenticated
using (auth.uid() = created_by);