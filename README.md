# devinxiong.com — Resume Website + AI Chatbot

My resume as a live website on AWS, with an AI chatbot that answers recruiters' questions about my experience and walks through mock IT tickets.

**Live:** [devinxiong.com](https://devinxiong.com)

---

## The Problem

A PDF resume only *says* I know AWS, DNS, and security. I wanted something I could actually show:
- Real cloud infrastructure, set up the way I'd want a production system set up
- Private by default, HTTPS everywhere, secrets kept server-side
- A way for recruiters to get answers about my background without waiting on me
- No chance of a surprise bill if someone abuses it

This project is that.

---

## What It Does

### 1. Hosts my resume on AWS
A static site served from a **private S3 bucket** behind **CloudFront**. The bucket is never public. Only my CloudFront distribution can read it, using Origin Access Control. HTTPS comes from an **ACM certificate**, and the domain is on **Cloudflare DNS**.

### 2. Answers questions with an AI chatbot
Visitors click **Ask about Devin** and ask anything about my experience. A **Lambda** function sends the question to **Claude** along with my resume, a notes file I control, and the READMEs of my GitHub projects. The answer comes back in a couple of seconds.

### 3. Runs mock IT tickets
Visitors can click a sample like *"A user is locked out of Okta after losing their phone"* and get a demo ticket back: priority, category, numbered steps, and the related project. It follows the same triage format as my [IT Service Agent](https://github.com/devinxiong97/it-service-agent).

### 4. Keeps costs capped
Prepaid API credits with auto-reload off mean the chatbot can never cost more than $5. CloudFront is on the flat-rate free plan, so traffic spikes can't create overage charges.

---

## Architecture

```
Visitor ──▶ Cloudflare DNS ──▶ CloudFront (HTTPS, cache, DDoS protection)
                                   │
                                   ├── /*         ──▶ S3 (private, OAC only)
                                   └── /api/visit ──▶ Lambda ──▶ DynamoDB   (in progress)

Chat box ──▶ Lambda Function URL ──▶ Claude API
```

Full diagram and request flows: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Tech Stack

| Tool | Purpose |
|------|---------|
| **Amazon S3** | Stores the site files in a private bucket |
| **Amazon CloudFront** | HTTPS, caching, DDoS protection, Origin Access Control |
| **AWS Certificate Manager** | Free TLS certificate for the custom domain |
| **Cloudflare DNS** | Domain registration and DNS (DNS only, not proxied) |
| **AWS Lambda (Python 3.13)** | Chatbot backend, no server to run or patch |
| **Claude API (Haiku)** | Writes the chatbot answers and mock tickets |
| **Amazon DynamoDB** | Visit counts by country (in progress) |
| **CloudWatch Logs** | Errors and token usage per question |
| **Cloudflare Web Analytics** | Cookieless, country-level visitor stats |

---

## Security

- **Private bucket.** A direct S3 link returns Access Denied. CloudFront is the only way in.
- **Secrets stay server-side.** The API key lives only in Lambda's environment, never in the site code or this repo.
- **Locked-down chatbot.** Only my domain can call it. I tested a request from another origin and got 403 Forbidden.
- **Input and output limits.** Questions capped at 500 characters, answers capped in length.
- **No HTML injection.** Bot replies are inserted as plain text.
- **Hard spending cap.** $5 prepaid credits, auto-reload off.

---

## Files

| File | Purpose |
|------|---------|
| `site/` | The website: `index.html`, `styles.css`, `script.js`, and `bot-notes.txt` (extra info the bot can share) |
| `lambda/chatbot/` | Chatbot Lambda: builds the prompt, calls Claude, returns answers or mock tickets |
| `lambda/visit-counter/` | Visit counter Lambda: counts visits by country only |
| `aws/` | Example bucket policy and IAM policy, with account details removed |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | How it all fits together, and why I made each choice |
| [`SETUP.md`](SETUP.md) | Step-by-step playbook to build it from scratch |
| [`ROADMAP.md`](ROADMAP.md) | What's live and what's next |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | Everything that broke and how I fixed it |

---

## How I Built It

I used Claude as a pair programmer, and it wrote a lot of the code. I made the architecture and security decisions, did all the AWS and DNS setup myself, deployed it, and debugged it from the CloudWatch logs when things broke.