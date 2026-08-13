-- Row-level security: auth.uid() = user_id on every table.
-- ai_calls is service-role only (no user policies).

alter table profile        enable row level security;
alter table sessions       enable row level security;
alter table cards          enable row level security;
alter table error_concepts enable row level security;
alter table error_examples enable row level security;
alter table plans          enable row level security;
alter table ai_calls       enable row level security;

create policy profile_own on profile
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy sessions_own on sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy cards_own on cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy error_concepts_own on error_concepts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy error_examples_own on error_examples
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy plans_own on plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ai_calls: no policies. Service role bypasses RLS; anon/authenticated get nothing.

-- Auth settings (dashboard, not SQL): enable Email provider with OTP,
-- disable magic-link template linking if desired. OTP length 6, expiry 3600s.
