# Learning Notes

What I learned building devinxiong.com, written so I can explain every piece in plain terms. Each concept has **what it is**, **how I used it**, and **the one thing worth remembering**.

---

## Explaining the Project

**Short version:**
> My resume is a static site in a private S3 bucket behind CloudFront, with HTTPS from ACM and DNS on Cloudflare. It has a Lambda chatbot that calls Claude to answer questions about my experience and run mock IT tickets, and a separate Brazilian Portuguese course with lessons, drills, quizzes, and real Brazilian pronunciation from Amazon Polly. Costs are capped so abuse can't create a surprise bill.

**Longer version, in the order a request travels:**
1. A visitor's browser asks Cloudflare DNS where `devinxiong.com` lives. The answer is my CloudFront distribution.
2. CloudFront serves the page over HTTPS with my ACM certificate. It caches files at the edge and only goes back to S3 when it needs to.
3. S3 is private. CloudFront signs its requests with Origin Access Control, and the bucket policy allows only that one distribution.
4. The chat box calls a Lambda Function URL. Lambda checks where the request came from, builds a prompt from my resume and project READMEs, calls Claude, and returns the answer.
5. On the course pages, tapping a Portuguese phrase plays an MP3 that Polly generated ahead of time and stored in S3.

---

## Storage and Delivery

### S3: objects, keys, and "folders"
- **What it is:** object storage. Every file is an object with a key like `portuguese/data/week-01.json`.
- **How I used it:** hosts every site file in a private bucket.
- **Remember:** there are no real folders, only key prefixes. Uploading the same key **overwrites with no warning**. That's how my course page once replaced my homepage. Versioning is the safety net.

### Private bucket + CloudFront Origin Access Control (OAC)
- **What it is:** CloudFront signs requests to S3, and the bucket policy only trusts that signature from my distribution.
- **How I used it:** Block Public Access stays on. A direct S3 link returns Access Denied.
- **Remember:** a private bucket returns **403 for missing files**, not 404. S3 won't confirm what exists to someone without permission to list the bucket.

### Caching and invalidation
- **What it is:** CloudFront keeps copies of files at edge locations so they load fast.
- **How I used it:** after every upload, I invalidate `/*` so visitors get the new version.
- **Remember:** when a change "isn't showing up," check each layer on its own: S3 (is the new file there?), CloudFront (is it cached?), and the browser (hard refresh).

---

## Domains and HTTPS

### DNS records
- **A record:** a name points to an IP address.
- **CNAME:** a name points to another name, like `www` → `d3kxx4empbte74.cloudfront.net`.
- **The root domain problem:** standards don't allow a CNAME on the bare domain. Cloudflare solves it with **CNAME flattening**. Route 53 uses **alias records**.
- **Proxy vs DNS only:** Cloudflare's orange cloud puts Cloudflare in the traffic path. With CloudFront already doing that, I set every record to **DNS only**.

### TLS certificates and ACM
- **What it is:** a certificate proves the site is really mine and encrypts traffic.
- **How I used it:** ACM gave me two CNAME records. Once they existed in Cloudflare, ACM knew I controlled the domain and issued the certificate.
- **Remember:** CloudFront certificates must be in **us-east-1**. Keep the validation records forever, since ACM uses them to auto-renew.

---

## Serverless Backend

### Lambda and Function URLs
- **What it is:** code that runs on demand. No server to patch, and no cost when idle.
- **How I used it:** the chatbot is a Python 3.13 Lambda behind a Function URL.
- **Remember:** a Function URL is the simplest HTTPS endpoint, but it has no built-in throttling. API Gateway or a WAF rate rule adds that.

### Packaging dependencies
- **What it is:** Lambda only has the standard library and boto3, so other packages ship in the zip.
- **How I used it:** `pip install anthropic -t package --platform manylinux2014_x86_64 --only-binary=:all: --python-version 3.13`, then zip and deploy from CloudShell.
- **Remember:** compiled packages must match the **runtime version** and **CPU architecture**, or they fail at import.

### CORS
- **What it is:** a browser rule that decides which websites may read responses from an API.
- **How I used it:** the chatbot only allows `devinxiong.com` and `www.devinxiong.com`.
- **Remember:** CORS only binds browsers. A script can fake the `Origin` header, so CORS is not a cost or abuse control by itself.

---

## Security and Cost

### Secrets
- The Claude API key lives only in Lambda's environment variables, encrypted at rest. It is never in the site code or this repo.
- To debug a missing key, I checked the variable name and the first few characters of the value, never the whole key.
- When a key was exposed, I revoked and replaced it first.
- **Next:** Secrets Manager with rotation.

### Least privilege
- The visit-counter Lambda can only `UpdateItem` and `Scan` on one DynamoDB table. Nothing else.

### Limiting the blast radius
- **Prepaid API credits with auto-reload off:** the chatbot can never cost more than $5.
- **CloudFront flat-rate plan:** no overage charges, so a traffic flood can't become a bill.
- **Input and output caps:** short questions, short answers, a small model.
- **Remember:** layered controls matter because each one can be bypassed on its own.

### Privacy
- Analytics are cookieless and country-level only.
- The visit counter stores only the two-letter country code CloudFront provides. No IP addresses.

---

## AI Features

### Context instead of training
- The chatbot isn't trained on anything. Each request includes my resume, a notes file, and my project READMEs as context.
- **Why not a vector database (RAG)?** The data is small enough to fit in one request. Retrieval only pays off at hundreds of documents.

### Structured output
- Mock tickets come back as JSON that matches a schema: priority, category, summary, steps, related repo.
- **Why:** the page can render a consistent ticket card, and the model's text can never break the layout. Replies are inserted as plain text, never HTML.

### Prompt rules
- Answer only from what's provided. Never invent numbers, employers, or dates. Never state salary. Say "I don't know" and point to email instead of guessing.

---

## The Portuguese Course

### Data-driven pages
- One `lesson.html` template renders every week from a JSON file (`data/week-01.json`), so adding a week means adding data, not code.

### Amazon Polly and content-addressed caching
- **What it is:** Polly turns text into speech. The neural voice **Camila** is native Brazilian Portuguese.
- **How I used it:** `tools/make_audio.py` sends each phrase to Polly once and stores `audio/<id>.mp3` in S3. The id is the first 16 hex characters of the phrase's SHA-1.
- **Why the hash:** the browser computes the same id from the phrase, so it finds the recording with no lookup table. Re-running the script skips phrases that already have audio, so it only pays for new ones.
- **Remember:** the browser's built-in voices vary by device and browser. For anything that has to sound the same everywhere, generate it once on the server.

### Shared browser state
- The resume and the course share a `theme` value in `localStorage`. They broke each other when one stored `dark` and the other stored `"dark"`.
- **Remember:** agree on the format, not just the key.

---

## How I Debug Now

1. **Read the logs first.** CloudWatch told me exactly what was wrong with the chatbot.
2. **Reproduce outside the browser.** Calling the live URLs directly showed which layer was broken.
3. **Check one layer at a time:** DNS → CloudFront → S3 → Lambda → the API.
4. **Confirm the region.** Half of AWS "not found" errors are the wrong region.
5. **Verify secrets without exposing them.**
6. **Write down what broke.** That's what [troubleshooting.md](troubleshooting.md) is.

---

## Mistakes and What I Changed

| Mistake | What I do now |
|---|---|
| Uploaded the course to the bucket root and overwrote my homepage | Upload with **Add folder**; resume at the top level, course under `portuguese/`; versioning next |
| Pasted an API key where it didn't belong | Keys go straight into the secret store, nowhere else |
| Trusted browser speech for pronunciation | Generate audio once with Polly and cache it |
| Invalidated `/` instead of `/*` | Always invalidate `/*` after an upload |
| Downloaded files got renamed `(1)` | Upload straight from my working folder, and check names before uploading |
