# Account username onboarding

Apply `supabase/migrations/20261014000100_account_usernames.sql` to the same Supabase project used by the frontend before publishing the updated frontend. This also applies in local Node analysis mode, because account sign-in still uses Supabase.

The migration adds a case-insensitive unique username index, metadata validation trigger and authenticated availability RPC. It does not delete or rename existing accounts. If existing accounts share a valid username, it stops with an explicit error; resolve those duplicates before retrying. Existing valid usernames skip onboarding. Google names are not used as implicit usernames.

Newly signed-in users without a valid username choose one once. Metadata is saved to Supabase Auth and restored on other devices. Settings can change it. Daily Challenge reuses it. Existing published leaderboard entries keep their original display name. Usernames are 3–24 ASCII letters, numbers, underscores or hyphens. Availability is advisory; the database unique index resolves competing saves atomically.

Verification: run `npm test` and `npm run build`. In a disposable account, check Google sign-in, missing-name onboarding, validation, taken-name handling, repeat login, cross-device login, settings changes and Daily Challenge reuse. No live accounts are created by the tests.
