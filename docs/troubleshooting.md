# Troubleshooting Log

Everything that broke while building this, how I figured out the cause, and what fixed it. Each one taught me something.

---

## 1. `ResourceNotFoundException` when deploying the Lambda

**Symptom:** `aws lambda update-function-code` said the function didn't exist.
**Cause:** I created the function in **us-east-2 (Ohio)**, but the command pointed at **us-east-1**.
**How I found it:**
```bash
for r in us-east-1 us-east-2 us-west-1 us-west-2; do
  aws lambda get-function --function-name resume-chatbot --region $r \
    --query "Configuration.FunctionArn" --output text 2>/dev/null
done
```
**Fix:** Deployed with `--region us-east-2`.
**Lesson:** Check the region first. It's the most common reason AWS says something doesn't exist. CloudShell also keeps separate files per region.

---

## 2. Python runtime mismatch

**Symptom:** After deploying, the function config showed `python3.14`.
**Cause:** I packaged the libraries with `--python-version 3.13`. `pydantic-core` and `jiter` are compiled for one specific Python version, so they would fail to import on 3.14.
**Fix:**
```bash
aws lambda update-function-configuration --function-name resume-chatbot \
  --runtime python3.13 --timeout 30 --memory-size 256 --region us-east-2
```
**Lesson:** Compiled dependencies have to match both the runtime and the CPU architecture.

---

## 3. Chatbot returned 502 Internal Server Error

**Symptom:** Every question failed with a 502.
**How I found it:**
```bash
aws logs tail /aws/lambda/resume-chatbot --since 15m --region us-east-2
```
The log said `Could not resolve authentication method`. Then I confirmed the variable **name** existed, and checked only the first 10 characters of the **value** so the full key never printed:
```bash
aws lambda get-function-configuration --function-name resume-chatbot --region us-east-2 \
  --query "keys(Environment.Variables)"
aws lambda get-function-configuration --function-name resume-chatbot --region us-east-2 \
  --query "Environment.Variables.ANTHROPIC_API_KEY" --output text | cut -c1-10
```
The value was empty.
**Fix:** Re-entered the key in the console and made sure the box wasn't empty before saving.
**Lesson:** Read the logs before guessing, and verify secrets without printing them.

---

## 4. An API key got exposed

**What happened:** A key got pasted somewhere it shouldn't have been.
**Response:** Treated it as an incident. Revoked it right away, made a new one, and only entered keys directly into Lambda after that.
**Lesson:** Assume anything pasted is compromised. Rotate first.

---

## 5. ACM validation records rejected by Cloudflare

**Symptom:** `Target ... is not allowed for a proxied record.`
**Cause:** Cloudflare turns the proxy (orange cloud) on by default for new records.
**Fix:** Switched each record to **DNS only**. The certificate issued within minutes.
**Lesson:** With CloudFront in front, Cloudflare should only do DNS.

---

## 6. CloudFront invalidation path rejected

**Symptom:** `Paths must start with a /.`
**Cause:** A blank second line under `/*` in the invalidation box.
**Fix:** Deleted the empty line.

---

## 7. Site changes not showing up

**Symptom:** New features didn't appear after uploading.
**How I found it:** Fetched the live files directly. The new versions were there, so S3 was fine.
**Cause:** An earlier invalidation only cleared `/`, not `/*`, and the browser had a cached copy.
**Fix:** Invalidated `/*` and hard refreshed.
**Lesson:** Check the origin, the CDN, and the browser cache separately.

---

## 8. "Couldn't connect" when testing the chatbot

**Symptom:** `Access to fetch ... from origin 'null' has been blocked by CORS policy`
**Cause:** I was opening `index.html` from my computer. A local file has origin `null`, and the bot only allows `devinxiong.com`.
**Fix:** Tested on the live domain.
**Lesson:** That block was the security control working, not a bug.

---

## 9. CORS origin typo

**Symptom:** `An origin must be in a valid URL format.`
**Cause:** A leftover `*` in front of the URL.
**Fix:** Removed it.