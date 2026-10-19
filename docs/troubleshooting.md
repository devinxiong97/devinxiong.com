# Troubleshooting Log

Everything that broke while building this, how I found the cause, and what fixed it. Each entry follows the same pattern I'd use on a real incident: **symptom → diagnosis → fix → lesson.**

---

## 1. `ResourceNotFoundException` when deploying the Lambda

**Symptom:** `aws lambda update-function-code` said the function didn't exist.
**Diagnosis:** The function was in **us-east-2 (Ohio)**, but the command pointed at **us-east-1**. I looped the lookup across regions to find it:
```bash
for r in us-east-1 us-east-2 us-west-1 us-west-2; do
  aws lambda get-function --function-name resume-chatbot --region $r \
    --query "Configuration.FunctionArn" --output text 2>/dev/null
done
```
**Fix:** Deployed with `--region us-east-2`.
**Lesson:** Check the region first. It's the most common reason AWS says something doesn't exist. CloudShell also keeps separate home directories per region, so files I'd uploaded in one region weren't there in the other.

---

## 2. Python runtime mismatch

**Symptom:** After deploying, the function showed `python3.14`.
**Diagnosis:** I packaged the dependencies with `--python-version 3.13`. `pydantic-core` and `jiter` ship compiled binaries built for one Python version, so they'd fail to import on 3.14.
**Fix:**
```bash
aws lambda update-function-configuration --function-name resume-chatbot \
  --runtime python3.13 --timeout 30 --memory-size 256 --region us-east-2
```
**Lesson:** Compiled dependencies have to match both the runtime version and the CPU architecture (x86_64 here).

---

## 3. Chatbot returned 502 Internal Server Error

**Symptom:** Every question failed with a 502.
**Diagnosis:** CloudWatch Logs showed `Could not resolve authentication method`. I confirmed the variable **name** existed, then checked only the first 10 characters of the **value**, so the full key never printed:
```bash
aws logs tail /aws/lambda/resume-chatbot --since 15m --region us-east-2
aws lambda get-function-configuration --function-name resume-chatbot --region us-east-2 \
  --query "keys(Environment.Variables)"
aws lambda get-function-configuration --function-name resume-chatbot --region us-east-2 \
  --query "Environment.Variables.ANTHROPIC_API_KEY" --output text | cut -c1-10
```
The value was empty. The paste hadn't gone in before saving.
**Fix:** Re-entered the key in the console and confirmed the box wasn't empty before saving.
**Lesson:** Read the logs before guessing, and verify secrets without printing them.

---

## 4. An API key got exposed

**What happened:** A key got pasted somewhere it shouldn't have been.
**Response:** Treated it as an incident. Revoked it immediately, issued a new one, and from then on only entered keys directly into the Lambda configuration.
**Lesson:** Assume anything pasted outside the secret store is compromised. Rotate first, investigate second.

---

## 5. ACM validation records rejected by Cloudflare

**Symptom:** `Target ... is not allowed for a proxied record.`
**Diagnosis:** Cloudflare turns its proxy (orange cloud) on by default for new records. ACM validation needs a plain DNS answer.
**Fix:** Switched every record to **DNS only**. The certificate issued within minutes.
**Lesson:** With CloudFront in front, Cloudflare should only do DNS. Two proxies in a row also cause redirect loops.

---

## 6. CloudFront invalidation path rejected

**Symptom:** `Paths must start with a /.`
**Diagnosis:** A blank second line under `/*` in the invalidation box.
**Fix:** Deleted the empty line.

---

## 7. Site changes not showing up

**Symptom:** New features didn't appear after uploading.
**Diagnosis:** I fetched the live files directly and the new versions were there, so S3 was fine. An earlier invalidation had only cleared `/`, not `/*`, and the browser also had a cached copy.
**Fix:** Invalidated `/*` and hard refreshed.
**Lesson:** Check each layer separately: origin (S3), CDN (CloudFront), and browser cache.

---

## 8. "Couldn't connect" when testing the chatbot locally

**Symptom:** `Access to fetch ... from origin 'null' has been blocked by CORS policy`
**Diagnosis:** I was opening `index.html` from disk. A local file has origin `null`, and the bot only allows `devinxiong.com`.
**Fix:** Tested on the live domain. For local previews of the course, I ran a small local web server instead of opening files directly, since `fetch()` of lesson files also fails from `file://`.
**Lesson:** That block was the security control working, not a bug.

---

## 9. CORS origin typo

**Symptom:** `An origin must be in a valid URL format.`
**Diagnosis:** A leftover `*` in front of the URL.
**Fix:** Removed it.

---

## 10. The Portuguese course replaced the resume homepage

**Symptom:** devinxiong.com suddenly showed the course instead of my resume.
**Diagnosis:** I fetched the live `index.html` and it was the course page. The course files had been uploaded to the **top level** of the bucket instead of into a `portuguese/` folder. Both pages are named `index.html`, so the upload silently overwrote the resume.
**Fix:** Re-uploaded the resume `index.html` to the top level, then uploaded the course with **Add folder** so every file landed under the `portuguese/` prefix.
**Lesson:** S3 doesn't really have folders. A "folder" is just a key prefix, and uploading the same key overwrites with no warning. Rule I follow now: top level is the resume, `portuguese/` is the course. Next step is turning on **S3 versioning** so a bad upload can be rolled back in one click.

---

## 11. Homepage showed `AccessDenied` after the fix

**Symptom:** An XML `AccessDenied` error on devinxiong.com.
**Diagnosis:** I probed the likely object names one by one and found `index%20(1).html` returning 200. The browser had saved the downloads as `index (1).html`, `styles (1).css`, and `script (1).js` because older copies were already in Downloads. CloudFront's default root object is `index.html`, so it found nothing. With a private bucket and OAC, a missing object returns **403, not 404**, because S3 won't confirm what does or doesn't exist to a caller without list permission.
**Fix:** Uploaded the files with their exact names and deleted the `(1)` copies.
**Lesson:** File names are part of the contract between CloudFront, the HTML, and S3. A 403 from a private bucket usually means "not found."

---

## 12. The pronunciation audio didn't sound Brazilian

**Symptom:** Tap-to-hear phrases in the course sounded wrong.
**Diagnosis:** The first version used the browser's built-in speech. It depends on which voices the device has installed. Brave doesn't ship Google's voices, so it fell back to whatever Windows had, sometimes a Portugal Portuguese voice and sometimes an English one.
**Fix:** Switched to **Amazon Polly** with the neural Brazilian voice **Camila**. `tools/make_audio.py` reads each lesson, sends every Portuguese phrase to Polly once, and stores the MP3 in S3 under an id made from the first 16 characters of the phrase's SHA-1. The browser computes the same id, so it finds the recording without a lookup table. The browser voice is still a fallback, but now it's only ever a `pt-BR` voice.
**Lesson:** Don't depend on the client for something that has to be consistent. Generate it once on the server and cache it.

---

## 13. Dark mode didn't carry over between the resume and the course

**Symptom:** Switching themes on one page didn't stick on the other.
**Diagnosis:** Both pages used the same `localStorage` key, `theme`, but one stored the plain string `dark` and the other stored JSON, `"dark"`, with quotes. Each page couldn't read the other's value.
**Fix:** Both pages now store the plain string.
**Lesson:** When two parts of a system share state, agree on the format, not just the key.

---

## 14. GitHub API returned `Problems parsing JSON`

**Symptom:** Publishing files to this repo from PowerShell failed with HTTP 400.
**Diagnosis:** Windows PowerShell 5.1 re-encodes text piped into native programs, which corrupted the JSON body before `gh` sent it.
**Fix:** Passed the fields as arguments (`gh api -f content=...`) instead of piping JSON.
**Lesson:** When a request body is "invalid" but looks fine, check the encoding between the tools, not just the content.
