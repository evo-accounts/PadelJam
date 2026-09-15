# Enabling real SMS for phone sign-in

Phone sign-in works locally today only because GoTrue returns a fixed code for two
hard-coded numbers. No SMS has ever been sent by this project. This document lists
everything the hosted project needs before a real person can receive a code.

Audit item UX-AUTH-03 asks for the phone path to work end to end. The app side is
fixed separately; this is the part that needs credentials.

## What you need from Twilio

Create a Twilio account and a Messaging Service, then collect three values:

| Value | Where it is in the Twilio console |
| --- | --- |
| Account SID | Account Info on the dashboard, starts with `AC` |
| Auth Token | Account Info, next to the Account SID |
| Messaging Service SID | Messaging, then Services, starts with `MG` |

Use a Messaging Service rather than a single sender number. It handles sender
selection per country, which matters because the two launch markets have different
rules. Brazil requires a registered sender and rejects traffic from unregistered
numbers. Portugal accepts an alphanumeric sender ID, which reads better than a
foreign number.

## What to set on the hosted project

The `infra/supabase/config.toml` file in this repository does **not** apply to the
hosted project unless it is pushed with the Supabase CLI. This project is
administered through the dashboard, so set these there.

In Authentication, then Providers, then Phone:

- Enable the phone provider.
- Choose Twilio as the SMS provider.
- Paste the Account SID, the Auth Token and the Messaging Service SID.
- Set the message template to exactly this, with nothing around it:

  ```
  Your code is {{ .Code }}
  ```

  This went wrong once and cost a TestFlight round trip, so it is worth being
  precise about. The value has three different spellings in this repository and
  only one of them is what you paste:

  | where | what it looks like | paste it? |
  |---|---|---|
  | the dashboard field | `Your code is {{ .Code }}` | this one |
  | `infra/supabase/config.toml` | `Your code is {{ \`{{ .Code }}\` }}` | no |
  | a markdown code span in a doc | wrapped in backtick characters | no |

  The config.toml form carries backticks because the Supabase CLI runs that file
  through Go templating itself; the escape makes the inner placeholder survive so
  GoTrue receives it intact. Paste that spelling into the dashboard and the
  backticks become part of the message, and the code never reaches the user —
  the SMS arrives, which makes it look like a delivery problem rather than a
  template one.

  A live send is the only way to be sure. `POST /auth/v1/otp` tells you whether
  Twilio ACCEPTED the message, not what the message said.
- Enable phone confirmations. The account completion step attaches a second
  identifier with `updateUser`, and this setting is what forces that attachment to
  be verified by a code rather than trusted.

In Authentication, then Rate Limits, raise the SMS limit from its default of 30 per
hour. That default is a local development value and will throttle real traffic. Pick
a number from your expected sign-ups per hour with headroom, and remember that
Twilio bills per message, so the limit is also your spend cap.

## Two traps

**The test code map must not exist in production.** The `[auth.sms.test_otp]`
block in `config.toml` maps `351912345678` and `5511987654321` to `123456`. If that
block ever reaches the hosted project, those two numbers become permanent backdoors
into any account that owns them. It exists for local development and for the end to
end suite. Check the dashboard has no test numbers configured before launch.

**A pushed config would overwrite the dashboard.** If anyone later runs a config
push against the hosted project, the placeholder Twilio credentials in this
repository would replace the real ones and phone sign-in would stop working. The
placeholders are deliberately obvious, `local_test_sid` and
`local_test_message_service_sid`, so this is easy to spot.

## How to confirm it works

1. Sign in with a real phone number on a device, in the hosted build.
2. The code should arrive within a few seconds.
3. Check Twilio's Messaging logs for the delivery status. A message that is
   accepted but never delivered usually means the destination country needs a
   registered sender.
4. Try a second code straight away. It should be refused until the minimum interval
   has passed, which is five seconds locally and should be raised in production.

## What stays unchanged locally

Local development and the end to end suite keep using the fixed codes, and need no
Twilio account. Before starting the local stack, export the dummy token so the
environment reference in `config.toml` resolves:

```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
```
