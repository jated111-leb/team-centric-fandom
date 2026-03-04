-- Add owner-scoped policies surfaced by the latest security scan.

-- Allow an authenticated invited admin to see only their own invite record.
create policy "Users can view their own admin invites"
on public.admin_invites
for select
to authenticated
using (
  auth.uid() = user_id
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

-- Let users manage only their own Copilot chat rows.
create policy "Users can update their own copilot messages"
on public.copilot_messages
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own copilot messages"
on public.copilot_messages
for delete
to authenticated
using (auth.uid() = user_id);

-- Let users delete only their own Copilot campaigns.
create policy "Users can delete their own copilot campaigns"
on public.copilot_campaigns
for delete
to authenticated
using (auth.uid() = created_by);