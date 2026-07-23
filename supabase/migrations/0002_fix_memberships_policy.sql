-- Fix: the memberships SELECT policy referenced is_org_member(), which reads
-- `memberships` itself -> infinite RLS recursion (500 on any authed page).
-- A user only needs to read their own membership rows here.

drop policy if exists memberships_self_read on memberships;

create policy memberships_self_read on memberships
  for select using (user_id = auth.uid());
