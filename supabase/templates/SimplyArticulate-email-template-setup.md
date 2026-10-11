# Install SimplyArticulate authentication emails

In your SimplyArticulate Supabase project, open Authentication > Email Templates (or Authentication > Emails > Templates).

| Template | Subject | HTML body file |
| --- | --- | --- |
| Magic Link | Your SimplyArticulate sign-in link | SimplyArticulate-magic-link.html |
| Confirm Signup | Welcome to SimplyArticulate - confirm your email | SimplyArticulate-confirm-signup.html |

Open each HTML file as text, copy its complete contents into the corresponding template's HTML/source editor, set the subject above, and save. Both templates are provided because existing-account sign-in and first-time signup can use different emails.

Keep {{ .ConfirmationURL }} intact in the button and fallback link. Supabase replaces it with the correct secure link for each recipient. The footer uses {{ .SiteURL }} from your project's configured Site URL.

The design matches SimplyArticulate's charcoal background, gray panels, silver buttons, and serif wordmark. It uses table layout and inline styles, with no external images, fonts, tracking, or scripts. Actual appearance may vary by email app. No specific expiration duration is hardcoded.

To change the sender shown in the inbox to SimplyArticulate, configure the sender name in your project's email/SMTP settings. Changing the HTML alone does not change the sender name or address.

These files do not automatically update the hosted Supabase templates. Dashboard access is needed to save them there. Check both emails with test accounts you control after applying them.

Supabase documentation: https://supabase.com/docs/guides/auth/auth-email-templates
