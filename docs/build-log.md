# Build Log

A dated record of what I built, why, and what I learned along the way. Problems and fixes from the first build are in [troubleshooting.md](troubleshooting.md).

---

## 2026-10-19 — Email on my own domain with Cloudflare Email Routing

**The problem:** I needed an Okta developer account for my next project ([okta-aws-sso](https://github.com/devinxiong97/okta-aws-sso)), and Okta's signup only accepts a business email. All I had were personal Gmail and Outlook addresses.

**My reasoning:** I already own `devinxiong.com`, and a business email is just an address on a domain you control. So I didn't need a paid mailbox, just a way to receive mail at my domain.

**What I did:**
1. In Cloudflare, opened **Email Routing** and onboarded `devinxiong.com`. Cloudflare added its mail DNS records automatically and locked them.
2. Added my Gmail as a **destination address** and verified it from the confirmation email.
3. Created a **routing rule**: `devin@devinxiong.com` → my Gmail.
4. Sent a test email from another account and confirmed it arrived.

**The technical pieces:**

| Record | What it does |
|---|---|
| **MX** | Tells the internet which servers receive mail for the domain. Cloudflare's MX records point to its mail servers, which forward to Gmail. |
| **SPF (TXT)** | Lists which servers may send mail for the domain. Receivers use it to spot forged senders. |
| **DMARC (TXT)** | Tells receivers what to do when SPF or DKIM checks fail, like rejecting the message. |

- **Email Routing is receive-only.** It forwards incoming mail; it doesn't send. Sending from `devin@` would need an SMTP service.
- **No conflicts with the website.** Email records (MX, TXT) are separate from the CNAME records that point the site at CloudFront, so the site wasn't affected.

**Security note:** the domain address is only as secure as the inbox it forwards to, so the Gmail account behind it has MFA on.

**Lesson:** when a requirement blocks you, check what you already own before paying for something new. A domain gives you more than a website.
