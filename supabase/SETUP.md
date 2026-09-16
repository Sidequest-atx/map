# SideQuest backend setup (shared Supabase project)

Do these in order. Steps 1-5 get sign-in working; 6-8 can follow.

1. **Run `schema.sql` before turning Email on.** SQL editor: paste `supabase/schema.sql` (uncomment the `sq_config` insert at the bottom and paste your Mapbox `pk.` token), Run. It is idempotent, and on a project that ran an older version it also removes the old email-match moderator trigger.
2. **Minimum password length 8.** Authentication → Sign In / Providers → Email. Both sign-in forms require 8, so a shorter password set anywhere else could never sign in.
3. **Enable the Email provider.** Same screen. Leave "Confirm email" off until step 6 is done (the built-in mailer can't deliver to your users).
4. **Sign up in the app** as `jamesjli2025+sidequest@gmail.com`.
5. **Grant yourself moderator**, once, in the SQL editor. Then sign out and back in so the role reaches your session:
   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"sq_role":"moderator"}'::jsonb
   where email = 'jamesjli2025+sidequest@gmail.com';
   ```
   Only run it right after you created the account yourself. Moderators are never granted by email match.
6. **Email for password resets.** Supabase's default mailer only delivers to project team members, about 2 emails an hour, so resets need custom SMTP: Authentication → Emails → SMTP Settings (any transactional provider). Then paste `supabase/templates/recovery.html` into the "Reset password" template, subject "Your SideQuest reset code". It sends a 6-digit code, so no link or Site URL is involved. The templates are shared with Sundial, which only uses Google sign-in today.
7. **Redirect URLs.** Authentication → URL Configuration → Redirect URLs: add `https://sidequest-atx.vercel.app/**` (and `http://localhost:5173/**` for dev). Leave the Site URL alone; it belongs to Sundial.
8. **Abuse and spend.**
   - Authentication → Rate Limits: keep sign-up and sign-in limits low.
   - CAPTCHA (Attack Protection) only after the clients send a `captchaToken`. Turning it on first would block every sign-in.
   - Anthropic Console: set a monthly spend limit and an alert on the workspace. The `ai_monthly_budget_usd` row (default 90) is the in-app stop.

## Accepted for now
- **Sign-up reveals whether an email is registered** ("User already registered") while "Confirm email" is off. Turning confirmation on after step 6 makes Supabase answer the same way either way.

## Moving to a dedicated project later
1. Create the project and run `schema.sql` there. Set its Site URL to the SideQuest site, and repeat steps 2-8.
2. Copy data: `pg_dump --data-only -t 'public.sq_*'` from the shared project into the new one, and copy the `sidequest-photos` bucket objects (same paths).
3. Accounts: migrate the SideQuest users' `auth.users` rows, or ask the few users to sign up again. Re-run the step 5 grant.
4. Point the clients at it: `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (web) and `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (app), or update the defaults in `src/lib/supabase.ts` and `mobile/src/lib/supabase.ts`.
5. Redeploy `sq-classify` there with `ANTHROPIC_API_KEY` set as a secret.
