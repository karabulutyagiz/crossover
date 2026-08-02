# Resolution Center reply — build 122 (2.1a Google, 1.2 UGC, 3.1.1 Restore, 3.1.2c)

App Store Connect → Resolution Center'a elle yapıştırılır (ASC API'de review yanıtı
endpoint'i yok — 6 aday uç nokta denendi, `reviewSubmissions`'ın tek ilişkisi `items`).

Aynı içeriğin özeti **App Review Notes** alanına da API'den yazıldı.

> ⚠️ Ekran kaydı cümlesini ancak gerçekten kaydettiysen bırak.

---

Hello,

Thank you for the detailed report — each item is addressed below.

**Guideline 2.1(a) — "Continue with Google" error**

Root cause: our backend validates the Google ID token's audience against the OAuth client IDs, and that configuration value was empty in production, so every Google sign-in was rejected before the token was even parsed. Apple sign-in and Guest were unaffected, which matches what you observed. The configuration is now in place and verified on the production server. This was a server-side fix and it is already live — it also applies to build 121.

**Guideline 1.2 — User-generated content**

We removed the anonymity itself rather than only adding controls around it. Direct messages and friend requests now require a verified Apple, Google or Facebook identity; this is enforced on the server, not just in the UI. Guest players keep full access to the game, the store, arenas and leaderboards, but cannot create content that another user sees. There is no public feed — messaging is 1:1 between mutually connected, identity-verified accounts.

In addition, all of the listed precautions are now implemented:

- **Terms (EULA) agreement:** the sign-in screen states that continuing accepts our Terms, with working links to the Terms and the Privacy Policy. The Terms state explicitly that we have zero tolerance for objectionable content and abusive users. Acceptance is recorded server-side. Terms: https://crossoverfootball.com/kosullar/
- **Filtering objectionable content:** every message passes an automatic profanity/abuse filter before it is stored or delivered.
- **Flagging content:** long-pressing any message offers "Report", and the conversation's ⋯ menu offers reporting the user. Reports are stored with a snapshot of the content so it survives deletion.
- **Blocking abusive users:** the ⋯ menu offers "Block". A block is enforced in both directions and closes every contact path — messages, friend requests, match invites, user search and the inbox — and removes the friendship.
- **Removing your own posts:** long-pressing your own message offers "Delete"; it is removed for both sides immediately.
- **Acting within 24 hours:** reports are surfaced to us immediately, and the reporter is shown our commitment to review within 24 hours, remove violating content and eject the offending user. This commitment is also published in the Terms.
- **Contact information in the app:** Settings contains "Report a problem" with our contact address, plus a "Blocked users" list where blocks can be reviewed and undone.

Regarding the age rating: with anonymous posting removed, the app has no anonymous user-generated content. If you would still like us to raise the age rating, please confirm and we will do so.

**Guideline 3.1.1 — Restore Purchases**

The Store now has a distinct "Restore Purchases" button that the user taps; it re-validates every StoreKit entitlement and reports the result. (We previously only replayed transactions at launch, which we understand does not satisfy this guideline.)

**Guideline 3.1.2(c) — Subscription information**

The purchase flow now shows, in the app itself, each plan's title, its length (1 week / 1 month), its localized price, the auto-renewal terms including the 24-hour rule and how to cancel, and working links to the Terms of Use (EULA) and the Privacy Policy. The previous links pointed at a placeholder domain that was never published — that was our error. The App Store metadata also contains both links.

We tested build 122 from a clean install on iPhone and iPad running the latest iOS/iPadOS.

Thank you for your time.
