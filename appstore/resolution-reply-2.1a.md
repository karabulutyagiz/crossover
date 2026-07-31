# Resolution Center reply — Guideline 2.1(a), submission fce3afce (build 120)

Apple'a **App Store Connect → Resolution Center** üzerinden elle yapıştırılır.
(ASC API'de review yanıtı gönderecek bir endpoint yok.)

> ⚠️ **Son paragrafı ancak gerçekten yaptıysan bırak.** Build 121'i iPhone + iPad'de
> temiz kurulumla test etmeden o cümleyi gönderme.

---

Hello,

Thank you for the detailed report — the device and OS information is what allowed us to find the cause.

**Root cause.** Our game backend was reachable at a single hostname served by a wildcard-DNS provider (`*.nip.io`). Every sign-in path in the app — including Guest — opens a WebSocket to that backend, so on any network where that hostname cannot be resolved or is filtered, all sign-in attempts fail with the connection error you saw. The server itself was online and healthy throughout the review period; we verified guest sign-in end-to-end against production and could not reproduce the failure from our own networks, which is consistent with the hostname being unreachable specifically from the review environment.

**What we changed in build 121:**

1. The backend is now served from our own registrar-backed domain, `api.crossoverfootball.com`, with a publicly trusted TLS certificate. This is the primary endpoint.
2. The app no longer depends on a single hostname. It tries the primary endpoint and, if it does not connect within 6 seconds, automatically fails over to a second independent hostname pointing at the same service. A single blocked or unavailable host can no longer prevent sign-in.
3. Connection failures surface a clear, actionable message instead of leaving a button unresponsive.

**How to sign in as a guest** — no account or credentials needed: on the first screen, tap **"Misafir olarak devam et"** (Continue as guest). This creates an account immediately and unlocks the full app: matches against bots and real opponents, the store, arenas, friends, and messages. A welcome conversation is pre-seeded on every new account, so the Friends and Messages screens are populated on first launch.

**Account deletion** is at: Home → Settings (gear icon) → **"Hesabı Sil"** (Delete Account), behind a double confirmation.

We tested build 121 from a clean install on iPhone and iPad running iOS/iPadOS 26.5.2, over both Wi-Fi and cellular.

Thank you for your time.
