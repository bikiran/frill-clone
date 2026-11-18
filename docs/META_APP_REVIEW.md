# Meta App Review: switching on Messenger, and resubmitting what was rejected

Result of the review on 24 Oct 2026:

| Permission / feature | Result | Meta's reason |
|---|---|---|
| pages_manage_metadata, pages_messaging, pages_read_engagement | Approved | |
| Human Agent | Rejected | "Disallowed use case": the use case wasn't clear or needed |
| instagram_business_basic, instagram_business_manage_messages, instagram_business_manage_comments, instagram_basic | Rejected | The screencast didn't show the whole flow, end to end |

---

## 1. Switch on Messenger now (pages_messaging is approved)

Colvy only asks Facebook for the permissions listed in `META_EXTRA_SCOPES`.
Until that includes `pages_messaging`, a connected Page has no Messenger
permission, so its messages never reach the inbox.

1. **Vercel → the Colvy project → Settings → Environment Variables.** Add
   `META_EXTRA_SCOPES` with the value `pages_messaging`, for Production (and
   Preview if you test there).
   - Don't set `META_ENABLE_MESSAGING_SCOPES=true`. That asks for every
     messaging permission, including the rejected Instagram ones, and Facebook
     then refuses the whole login with "Invalid Scopes".
2. **If `META_LOGIN_CONFIG_ID` is set in Vercel**, Facebook ignores Colvy's
   permission list and uses the saved configuration instead. In the Meta
   dashboard go to **Facebook Login for Business → Configurations**, edit the
   one in use, add `pages_messaging`, and remove any permission that isn't
   approved.
3. **Redeploy.** Go to Vercel → Deployments → the latest one → ⋯ → Redeploy.
   Environment variables only reach new deployments.
4. **Reconnect the Page in Colvy.** Go to Settings → Channels → Instagram &
   Messenger and connect Facebook again. Pick the Page and allow the new
   permission. The old connection's token doesn't have Messenger, so this step
   is needed.
5. **Check the Page's card.** It should say **Webhook subscribed**, and its
   fields should include `messages`. If it shows "Messenger messages aren't
   subscribed", the token still lacks `pages_messaging`: go back to step 2 or 4.
6. **In the Meta dashboard, check Webhooks → Page.** The callback is
   `https://<your domain>/api/meta/webhook`, the verify token matches
   `META_VERIFY_TOKEN`, and the `messages` field is subscribed.
7. **Test.** From a personal Facebook account, message the Page. It should
   appear in the Colvy inbox within seconds. Reply from Colvy and check it
   arrives in Messenger.

---

## 2. Human Agent: what changed, and what to send Meta

**What changed in Colvy.** The Human Agent tag now goes only on replies a
person on the team writes and sends from the inbox, 24 hours to 7 days after
the customer's last message. Automatic messages are never tagged: AI agents,
automations, payment reminders and scheduled messages. Outside 24 hours,
Colvy refuses them with a clear reason. After 7 days every reply is blocked,
and the team is told to use SMS or email.

### Notes to paste (Meta asks three questions)

**1. Which part of the app needs it?**
Colvy is a shared inbox for small businesses. Staff answer their customers'
Facebook Messenger messages from Colvy. Some questions can't be answered within
24 hours: a stock check at another store, a refund that needs approval, a quote
from a tradesperson, or a message sent on Friday night that is answered on
Monday. A member of staff then writes the answer in the Colvy inbox, and Colvy
sends it with the HUMAN_AGENT tag.

**2. How does it work in the app?**
Colvy adds the tag only when both of these are true:
- a signed-in member of the business's team wrote and sent the reply from the
  inbox;
- the customer's last message was between 24 hours and 7 days ago.

AI replies, automations, reminders and scheduled messages are never sent with
the tag, and are refused outside the 24-hour window. Replies more than 7 days
later are blocked, and the agent is asked to use another channel. The tag is
never used for promotional messages.

**3. How does it help the customer?**
The customer gets a real answer from a real person to the question they asked,
even when it takes more than a day, instead of the conversation going quiet.

### Screencast (Human Agent)

Set up the day before: from a test Facebook account, message a Page that one
of the app's admins manages. Meta lets people with a role on the app (admins,
developers, testers) use a feature before it's approved, so record with them.

1. Sign in to Colvy and open the inbox. Use English, and turn on captions.
2. Open the Messenger conversation. Caption: "The customer asked yesterday.
   It's now more than 24 hours later."
3. A person types a reply and presses Send. Caption: "A person on the team
   replies. Colvy sends it with the HUMAN_AGENT tag."
4. Show the reply arriving in Messenger on the test account.
5. Optional: caption that automated messages are refused after 24 hours, and
   all replies after 7 days.

---

## 3. Instagram: submit one way of connecting, with one screencast

Colvy has two ways to connect Instagram, and each needs its own permissions:

- **Connect Instagram directly** (Instagram Login, no Facebook Page needed):
  `instagram_business_basic`, `instagram_business_manage_messages`,
  `instagram_business_manage_comments`.
- **Through a Facebook Page** (Facebook Login): `instagram_basic`,
  `instagram_manage_messages`, `instagram_manage_comments`.

Requesting both sets at once needs two complete screencasts. **Recommended:**
resubmit the three `instagram_business_*` permissions together, with one
screencast of "Connect Instagram directly", and leave `instagram_basic` out
for now. Submit the Facebook-Page set later, if you want it, with its own
screencast.

Meta asked for:
- the complete login flow;
- the user granting the permission;
- each permission used end to end;
- English, with captions and tooltips explaining the buttons.

### Screencast (Instagram Login)

You need: a Colvy test login for reviewers (add it under App Review → Test
credentials), an Instagram **professional** (Business or Creator) account, and
a second, personal Instagram account on a phone.

1. Sign in to Colvy. Caption what Colvy is: a shared inbox for small
   businesses.
2. Go to **Settings → Channels → Instagram & Messenger → Connect Instagram
   directly.** Caption: "The business connects its Instagram account."
3. On Instagram's login screen, sign in with the business account. Show the
   permission screen listing all three permissions, and tap **Allow**.
4. Back in Colvy, show the connected account with its @username. Caption:
   "instagram_business_basic: Colvy reads the account's username, to show
   which account is connected."
5. **Messages.** From the personal account on the phone, send a DM to the
   business account. Show it arriving in the Colvy inbox, reply from Colvy,
   then show the reply in the Instagram app on the phone. Caption:
   "instagram_business_manage_messages: customers' DMs arrive in the shared
   inbox, and the team replies from Colvy."
6. **Comments.** From the personal account, comment on one of the business
   account's posts. In Colvy, open **Social engagement**, find the comment
   and choose **Reply** (a public reply). Show the reply under the post in
   Instagram. Caption: "instagram_business_manage_comments: the team reads and
   replies to comments on the business's posts from Colvy."

### Notes to paste (one per permission)

**instagram_business_basic.** Colvy shows which Instagram account a business
has connected, by its @username, so the team knows which
account they're replying as. It's also needed to receive the account's
messages and comments. It helps the user because they can see at a glance that
the right account is connected, and switch accounts if not.

**instagram_business_manage_messages.** Colvy is a shared inbox. Customers'
Instagram DMs to the business arrive in Colvy alongside the business's other
channels, and staff reply from Colvy. Replies follow Meta's messaging window.
It helps the user because customers get faster answers, and no DM is missed
because it was on one staff member's phone.

**instagram_business_manage_comments.** Colvy's Social engagement page lists
comments on the business's Instagram posts, so staff can reply publicly, or
reply privately where Meta allows it, from one place. It helps the user because
customers asking questions in the comments get answered, and nothing gets lost
under a busy post.

---

## 4. Customers' names and photos: Business Asset User Profile Access

Messenger messages arrive with only an ID for the sender. Meta shares the
sender's name and profile photo only with apps that have **Advanced Access to
"Business Asset User Profile Access"**. Without it, Meta returns an empty
profile and gives no error. Until then:

- Colvy takes the name from the Page's conversation list, which needs only
  `pages_messaging`. If that gives none, the customer shows as "Messenger
  user".
- There's no photo, so customers show their initials.
- If the conversation is already linked to a customer, alerts use that
  customer's name.

The Page's card under **Settings → Channels → Instagram & Messenger** shows
whether Meta is sharing them. It checks against the last person who messaged
the Page.

Meta's documentation says the feature needs App Review and a verified
business.

**Request it.** In the Meta dashboard, go to **App Review → Permissions and
Features**, find **Business Asset User Profile Access** and choose **Request
advanced access**. If the app's business isn't verified yet, Meta asks for
that first.

### Notes to paste

**How Colvy uses it.** Colvy is a shared inbox for small businesses. When a
customer messages the business's Facebook Page, Colvy shows the customer's name
and profile photo beside their conversation and in the team's notifications.
That way staff can tell customers apart, and know who they're answering. The
name and photo are shown only to the business's own team, inside Colvy. They
aren't used for advertising, and aren't shared with anyone else.

**How it helps the user.** Without it, every customer appears as the same
"Messenger user" with no photo. Staff can't tell who they're replying to, and
two customers' questions get mixed up.

### Screencast

Use a test Facebook account that has a role on the app. Before approval, Meta
normally lets the feature work for people with a role, but check that it does
before recording. Record in English, with captions.

1. From the test account, message the Page.
2. In Colvy, show the conversation arriving in the inbox list with the
   customer's name and profile photo. Caption: "Business Asset User Profile
   Access: the customer's name and photo, so the team knows who they're
   talking to."
3. Open the conversation and show the name and photo at the top. Reply, and
   show the reply arriving in Messenger.
4. Show the team's notification naming the customer.
