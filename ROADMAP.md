# Roadmap

A technical roadmap for devinxiong.com — what's live today, what's being built next, and where it's headed.

---

## Current State (v1.0)

The site and chatbot are live.

| Capability | Status |
|-----------|--------|
| Static site on a private S3 bucket behind CloudFront (OAC) | Live |
| HTTPS on devinxiong.com and www via ACM | Live |
| Cloudflare DNS, all records DNS only | Live |
| AI chatbot on Lambda + Claude Haiku | Live |
| Bot context from resume, bot-notes.txt, and 6 GitHub READMEs | Live |
| Mock IT tickets as structured JSON, rendered as ticket cards | Live |
| Origin check, input/output limits, $5 prepaid spending cap | Live |
| Cloudflare Web Analytics (cookieless, country level) | Live |
| Brazilian Portuguese course at /portuguese/ (Week 1 of 16) | Live |
| Native Brazilian audio with Amazon Polly (Camila) | Live |
| Visit counter by country (Lambda + DynamoDB) | In progress |

---

## Phase 2 — Finish the Visit Counter

**Goal:** Show live visits by country on the site, without storing anything personal.

```
[ ] DynamoDB table site-visits
[ ] visit-counter Lambda with least-privilege IAM (UpdateItem + Scan, one table)
[ ] CloudFront /api/* behavior with secret origin header
[ ] Origin request policy forwarding CloudFront-Viewer-Country
[ ] Site Stats section live on the page
```

---

## Phase 3 — Harden It

The controls work, but some are "good enough for a personal project." This phase makes them production-grade.

**Goal:** Close the gaps I'd flag if I were reviewing someone else's setup.

```
[ ] Turn on S3 versioning so a bad upload can be rolled back
[ ] Move ANTHROPIC_API_KEY to AWS Secrets Manager, with rotation
[ ] WAF rate-based rule in front of the chatbot
      The origin header can be faked outside a browser, so rate limiting
      is the real abuse control after the spending cap
[ ] Reserved concurrency on the chatbot Lambda
[ ] CloudWatch alarm on Lambda errors → email
[ ] Security headers on CloudFront (CSP, HSTS, X-Content-Type-Options)
```

---

## Phase 4 — Automate Deploys

Right now deploys are manual: upload to S3, invalidate CloudFront, repackage Lambda in CloudShell.

**Goal:** Push to GitHub and everything deploys itself.

```
[ ] Terraform for S3, CloudFront, ACM, Lambda, DynamoDB, and IAM
[ ] GitHub Actions: on push to main
      sync site/ to S3
      invalidate CloudFront /*
      package and deploy both Lambdas
[ ] GitHub OIDC role for Actions, so no long-lived AWS keys are stored
```

---

## Phase 5 — Better Chatbot

```
[ ] Log questions (no personal data) to see what visitors actually ask
[ ] Use those logs to fill gaps in bot-notes.txt
[ ] Prompt caching to cut cost per question
[ ] "Message Devin" button that sends a push notification to my phone
```

---

## Phase 6 — Finish the Portuguese Course

```
[ ] Weeks 2–8 (PORT 101) and 9–16 (PORT 102) as JSON lessons
[ ] Polly audio for every week
[ ] AI tutor Lambda: conversation practice that knows the current week
[ ] Private sync key so progress follows me across devices (DynamoDB)
[ ] CloudFront function so /portuguese/ loads without typing index.html
```