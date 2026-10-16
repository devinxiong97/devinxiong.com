# devinxiong.com

My resume as a website, hosted on AWS, with an AI chatbot that answers questions about my experience and can walk through mock IT tickets.

**Live site:** https://devinxiong.com

I built this to get real hands-on time with AWS instead of just listing it on my resume. I wanted to set it up the way I'd want a real system set up: private by default, HTTPS everywhere, secrets kept server-side, and no way for it to run up a surprise bill.

---

## How it works

```
Visitor
  │
  ▼
Cloudflare DNS (devinxiong.com, DNS only)
  │
  ▼
CloudFront (HTTPS via ACM certificate, DDoS protection, caching)
  │
  ├── /*          ──▶ S3 bucket (private, read only through Origin Access Control)
  │
  └── /api/visit  ──▶ Lambda: visit counter ──▶ DynamoDB (in progress)

Chat box on the page ──▶ Lambda Function URL: chatbot ──▶ Claude API (Haiku)
```

| Piece | Service | Why |
|---|---|---|
| Site files | S3, private bucket | Files are never publicly exposed |
| Delivery + HTTPS | CloudFront with Origin Access Control | Only CloudFront can read the bucket. HTTPS, caching, DDoS protection |
| Certificate | AWS Certificate Manager (us-east-1) | Free TLS cert, renews on its own |
| Domain + DNS | Cloudflare | About $10/yr, cheaper than Route 53 |
| Chatbot | AWS Lambda (Python 3.13) + Function URL | No server to run or patch, costs nothing when idle |
| AI model | Claude Haiku via the Claude API | Answering from a resume is a simple task, so a small cheap model is plenty |
| Visit counter | Lambda + DynamoDB (in progress) | Counts visits by country only |
| Analytics | Cloudflare Web Analytics | Cookieless, country level, no individual tracking |

---

## Repo layout

```
site/                       the website (uploaded to S3)
  index.html
  styles.css
  script.js
  bot-notes.txt             extra info the chatbot can share (career gap, etc.)
lambda/
  chatbot/lambda_function.py
  visit-counter/lambda_function.py
aws/
  s3-bucket-policy.json     example bucket policy for CloudFront OAC
  visit-counter-iam-policy.json
```

---

## Setup, step by step

### 1. S3 bucket
- Created a bucket and kept **Block all public access ON**.
- Did **not** turn on S3 static website hosting. That needs a public bucket and doesn't do HTTPS on a custom domain.
- Uploaded the files in `site/`.

### 2. CloudFront
- Created a distribution with the S3 bucket as the origin (the REST endpoint, not the website endpoint).
- Turned on **Origin Access Control**. CloudFront added a bucket policy that only allows this one distribution to read the bucket (see `aws/s3-bucket-policy.json`).
- Viewer protocol policy: **Redirect HTTP to HTTPS**.
- Default root object: `index.html`.
- Picked the **Free flat-rate plan**, which includes DDoS protection and WAF and has no overage charges.

### 3. Domain, certificate, DNS
- Bought `devinxiong.com` on Cloudflare.
- Requested a certificate for `devinxiong.com` and `www.devinxiong.com` in **ACM (us-east-1)**, which CloudFront requires.
- Added ACM's two CNAME validation records in Cloudflare. Once they were in, ACM issued the cert.
- Attached the cert to CloudFront as alternate domain names.
- Pointed `@` and `www` at the CloudFront domain with CNAME records (Cloudflare flattens the root CNAME).
- **Every record is DNS only (grey cloud).** CloudFront already does caching and DDoS protection, and proxying through Cloudflare broke certificate validation.

### 4. Chatbot (Lambda)
- Python 3.13 Lambda, 256 MB, 30 second timeout.
- Packaged with the `anthropic` library in AWS CloudShell:
  ```bash
  mkdir -p package
  pip3 install anthropic -t package --platform manylinux2014_x86_64 --only-binary=:all: --python-version 3.13
  cp lambda_function.py package/
  cd package && zip -qr ../function.zip . && cd ..
  aws lambda update-function-code --function-name resume-chatbot --zip-file fileb://function.zip --region us-east-2
  ```
- The Claude API key is stored in the Lambda environment variable `ANTHROPIC_API_KEY`. It is never in the website code or this repo.
- Function URL with auth type NONE, and CORS limited to `https://devinxiong.com` and `https://www.devinxiong.com`.
- The bot answers from my resume, `bot-notes.txt`, and the READMEs of my public GitHub repos, all passed in as context. No training and no vector database, since the data is small enough to fit in one request.
- Mock tickets come back as structured JSON (priority, category, steps, related repo), and the page renders them as a ticket card.

### 5. Visit counter (in progress)
- DynamoDB table `site-visits` with partition key `id`.
- Lambda reads the `CloudFront-Viewer-Country` header that CloudFront adds, and stores only the country code. No IP addresses are stored.
- CloudFront routes `/api/*` to the Lambda and adds a secret `x-origin-verify` header, so the Lambda refuses anything that didn't come through CloudFront.
- IAM permissions are limited to `UpdateItem` and `Scan` on that one table (see `aws/visit-counter-iam-policy.json`).

### 6. Analytics
- Cloudflare Web Analytics with the manual JS snippet. Cookieless, country level only.

---

## Security and cost controls

- **Private bucket.** Only my CloudFront distribution can read it. A direct S3 link returns Access Denied.
- **HTTPS everywhere.** HTTP redirects to HTTPS.
- **Secrets stay server-side.** The API key only exists in Lambda's environment.
- **Origin check.** The chatbot only accepts requests from my domain. I tested a request from another origin and got 403 Forbidden.
- **Limits.** Questions are capped at 500 characters, answers are capped in length, and only recent chat history is sent.
- **No HTML injection.** Bot replies are inserted as plain text, never as HTML.
- **Hard spending cap.** The Claude API runs on prepaid credits with auto-reload off, so the most the bot can ever cost is $5. CloudFront is on a flat-rate plan with no overages.
- **Cost:** about $0.001 per chatbot question. Hosting is $0. The domain is about $10 a year.

The origin header can be faked outside a browser, so the spending cap is the real backstop. A WAF rate rule is the next layer I'd add.

---

## Things that broke and how I fixed them

| Problem | Cause | Fix |
|---|---|---|
| `ResourceNotFoundException` when deploying | The function was in us-east-2, the CLI was looking in us-east-1 | Deployed to the right region |
| Runtime set to Python 3.14 | The packaged libraries (pydantic-core, jiter) were built for 3.13 | Switched the runtime to 3.13 |
| Chatbot returned 502 | CloudWatch Logs showed no API key. The variable existed but its value was empty | Re-entered the key, checking only the first few characters so the full key was never printed |
| ACM validation records rejected | Cloudflare proxies new records by default | Set them to DNS only |
| Site changes not showing | The invalidation only cleared `/`, not `/*` | Invalidated `/*` |
| "Couldn't connect" when testing | I was opening the file locally (origin `null`), which the bot blocks on purpose | Tested on the live domain |
| An API key got exposed | Pasted somewhere it shouldn't have been | Revoked it right away and made a new one |

---

## What I'd add next

- Secrets Manager for the API key, with rotation
- A WAF rate-based rule in front of the chatbot
- Terraform for the whole setup
- GitHub Actions to deploy on push (upload to S3, invalidate CloudFront, update Lambda)

---

## How I built it

I used Claude as a pair programmer, and it wrote a lot of the code. I made the architecture and security decisions, did all the AWS and DNS setup myself, deployed it, and debugged it from the logs when things broke.