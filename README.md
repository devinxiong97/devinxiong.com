# devinxiong.com — Resume Website, AI Chatbot + Portuguese Course

My resume as a live website on AWS, with an AI chatbot that answers questions about my experience and walks through mock IT tickets, plus a self-paced Brazilian Portuguese course with real Brazilian pronunciation.

**Live:** [devinxiong.com](https://devinxiong.com) · **Course:** [devinxiong.com/portuguese](https://devinxiong.com/portuguese/index.html)

---

## The Problem

A PDF resume only *says* I know AWS, DNS, and security. I wanted something I could actually show:
- Real cloud infrastructure, set up the way I'd want a production system set up
- Private by default, HTTPS everywhere, secrets kept server-side
- A way for people to get answers about my background without waiting on me
- No chance of a surprise bill if someone abuses it

Then I wanted to learn Brazilian Portuguese properly, so I built a course into the same site, separate from the resume.

---

## What It Does

### 1. Hosts my resume on AWS
A static site served from a **private S3 bucket** behind **CloudFront**. Only my CloudFront distribution can read the bucket, using Origin Access Control. HTTPS comes from an **ACM certificate**, and the domain is on **Cloudflare DNS**.

### 2. Answers questions with an AI chatbot
Visitors click **Ask about Devin** and ask about my experience. A **Lambda** function sends the question to **Claude** along with my resume, a notes file I control, and the READMEs of my GitHub projects.

### 3. Runs mock IT tickets
Visitors can click a sample like *"A user is locked out of Okta after losing their phone"* and get a demo ticket card: priority, category, numbered steps, and the related project. It follows the same triage format as my [IT Service Agent](https://github.com/devinxiong97/it-service-agent). The ticket comes back as **structured JSON**, so it always renders the same way.

### 4. Teaches Brazilian Portuguese
A separate section at `/portuguese/` with a 16-week, two-semester course (PORT 101 and 102). Each week has a lesson covering grammar, conjugation, sentence structure, nuance, and slang, plus typing drills, flashcards, a quiz that must be passed at 80% to unlock the next week, and progress tracking.

### 5. Speaks with a real Brazilian voice
Every Portuguese phrase plays audio from **Amazon Polly**'s neural Brazilian voice (Camila). A script generates each recording once and stores it in S3, so it sounds the same in every browser.

### 6. Keeps costs capped
Prepaid API credits with auto-reload off mean the chatbot can never cost more than $5. CloudFront is on the flat-rate free plan, so traffic spikes can't create overage charges. Polly audio costs well under $1 for the whole course, one time.

---

## Architecture

```
Visitor ──▶ Cloudflare DNS ──▶ CloudFront (HTTPS, cache, DDoS protection)
                                   │
                                   ├── /*            ──▶ S3: resume (private, OAC only)
                                   ├── /portuguese/* ──▶ S3: course + Polly audio
                                   └── /api/visit    ──▶ Lambda ──▶ DynamoDB   (in progress)

Chat box ──▶ Lambda Function URL ──▶ Claude API
make_audio.py (CloudShell) ──▶ Amazon Polly ──▶ S3 portuguese/audio/
```

Full diagram, request flows, and design decisions: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Tech Stack

| Tool | Purpose |
|------|---------|
| **Amazon S3** | Stores the site, course, and audio in a private bucket |
| **Amazon CloudFront** | HTTPS, caching, DDoS protection, Origin Access Control |
| **AWS Certificate Manager** | Free TLS certificate for the custom domain |
| **Cloudflare DNS** | Domain registration and DNS (DNS only, not proxied) |
| **AWS Lambda (Python 3.13)** | Chatbot backend, no server to run or patch |
| **Claude API (Haiku)** | Chatbot answers and structured mock tickets |
| **Amazon Polly (neural, pt-BR)** | Native Brazilian Portuguese pronunciation |
| **Amazon DynamoDB** | Visit counts by country (in progress) |
| **CloudWatch Logs** | Errors and token usage per question |
| **Cloudflare Web Analytics** | Cookieless, country-level visitor stats |

---

## Security

- **Private bucket.** A direct S3 link returns Access Denied. CloudFront is the only way in.
- **Secrets stay server-side.** The API key lives only in Lambda's environment, never in the site code or this repo.
- **Locked-down chatbot.** Only my domain can call it. I tested a request from another origin and got 403 Forbidden.
- **Input and output limits.** Questions capped at 500 characters, answers capped in length.
- **No HTML injection.** Bot replies and tickets are inserted as plain text.
- **Hard spending cap.** $5 prepaid credits, auto-reload off.
- **Least privilege.** The visit counter can only update and read one DynamoDB table.

---

## Files

| File | Purpose |
|------|---------|
| `site/` | The resume site: `index.html`, `styles.css`, `script.js`, `bot-notes.txt` |
| `site/portuguese/` | The course: dashboard, lesson template, `course.js` engine, and `data/week-NN.json` lessons |
| `tools/make_audio.py` | Generates Brazilian Portuguese audio with Amazon Polly and stores it in S3 |
| `lambda/chatbot/` | Chatbot Lambda: builds the prompt, calls Claude, returns answers or mock tickets |
| `lambda/visit-counter/` | Visit counter Lambda: counts visits by country only |
| `aws/` | Example bucket policy and IAM policy, with account details removed |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | How it all fits together, and why I made each choice |
| [`SETUP.md`](SETUP.md) | Step-by-step playbook to build it from scratch |
| [`ROADMAP.md`](ROADMAP.md) | What's live and what's next |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | Everything that broke and how I fixed it |
| [`docs/learning-notes.md`](docs/learning-notes.md) | Every concept the project uses, explained plainly |

---

## How I Built It

### The decisions I made, and why

| Decision | Why I made it |
|---|---|
| **Kept the storage bucket private** instead of making it public | A public bucket means anyone can reach the files directly. I wanted one controlled way in. |
| **Put CloudFront in front of everything** | It gives HTTPS, speed, and DDoS protection, and it's the only thing allowed to read the bucket. |
| **Picked CloudFront's flat-rate plan** | If someone floods the site with traffic, the bill can't grow. Cost risk was a design requirement, not an afterthought. |
| **Bought the domain on Cloudflare, not AWS** | About half the yearly cost. The trade-off was setting up DNS and certificate records by hand, which I did. |
| **Capped the chatbot at $5, total** | Prepaid credits with auto-reload off. Even if someone abuses it, the worst case is the bot goes quiet, not a surprise bill. |
| **Locked the chatbot to my domain only** | Other websites can't use my API. I tested it by sending a request from a fake site and confirming it was blocked. |
| **Used a small, cheap AI model** | Answering questions from a resume is a simple job. About a tenth of a cent per question. |
| **Tracked visitors by country only** | Enough to see my reach without storing anyone's personal data. |
| **Switched to Amazon Polly for pronunciation** | I noticed the browser's voice didn't sound Brazilian. Polly records each phrase once with a native-sounding Brazilian voice, so it sounds right in every browser. |
| **Rotated an exposed API key immediately** | I treated it as a security incident: revoke first, replace second. |

### What I set up and ran myself
- Created and secured the storage, CDN, certificate, and DNS, then connected the domain end to end
- Deployed the chatbot backend, configured its settings, and stored its secret key server-side
- Generated the Portuguese audio with Polly and published the course in its own section, separate from the resume
- Found and fixed 14 real problems by reading logs, testing live URLs, and checking one layer at a time. Every one is written up in the [troubleshooting log](docs/troubleshooting.md)

### Terms in plain English

| Term | What it means |
|---|---|
| **S3** | AWS file storage. My website files live here. |
| **CloudFront** | AWS's delivery network. It serves the site fast from locations worldwide and handles HTTPS. |
| **OAC (Origin Access Control)** | A lock between CloudFront and S3. Only my CloudFront can read the files; everyone else gets "Access Denied." |
| **ACM (Certificate Manager)** | Gives the site its free security certificate, the padlock in the browser. |
| **DNS** | The internet's phone book. It points `devinxiong.com` at my site. |
| **Cache invalidation** | Telling CloudFront to throw out its saved copies so visitors see my latest changes. |
| **Lambda** | Code that runs only when needed. No server to maintain, and no cost when idle. |
| **CORS** | A browser rule I set so only my website can use my chatbot. |
| **Environment variable** | A secure place inside Lambda to store a secret, like an API key, so it's never in the website code. |
| **Least privilege** | Giving each part only the exact access it needs. The visitor counter can touch one table and nothing else. |
| **Amazon Polly** | AWS text-to-speech. It produces natural-sounding audio in many languages and accents. |
| **Structured output** | Making the AI answer in a fixed format, so mock tickets always look the same and can't break the page. |

### How I used AI
I used Claude as a coding assistant to write and iterate on the code faster, the same way I use it at work for PowerShell and Python. The architecture, the security and cost decisions, the setup, and the troubleshooting were mine.
