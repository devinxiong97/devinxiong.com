# Setup Playbook

A step-by-step guide to build this resume website and chatbot from scratch.

**Time to complete:** ~3 hours
**Prerequisites:** An AWS account, a Cloudflare account, and a Claude API account at console.anthropic.com

---

## Phase 1 — Lock Down the Accounts First

### 1.1 AWS
1. Turn on **MFA** for the root user, and use an IAM user for everyday work
2. **Billing → Budgets → Create budget → Zero spend budget** so you get an email at the first dollar

### 1.2 Claude API
1. Buy a small amount of prepaid credit ($5 is plenty)
2. Leave **auto-reload OFF**. This is the hard spending cap for the chatbot
3. Create an API key and keep it somewhere safe. Never paste it into chats, code, or screenshots

---

## Phase 2 — Host the Site on S3 + CloudFront

### 2.1 Create the bucket
1. **S3 → Create bucket**, global namespace
2. Keep **Block all public access ON**
3. Leave static website hosting **off**. CloudFront handles everything
4. Upload everything in `site/`

### 2.2 Create the CloudFront distribution
1. **CloudFront → Create distribution**, choose the **Free** plan
2. Origin: pick the bucket **from the dropdown** (the REST endpoint, not the website endpoint)
3. Origin access: **Origin access control**, create a new OAC
4. Viewer protocol policy: **Redirect HTTP to HTTPS**
5. After it's created, set **Default root object** to `index.html`
6. Confirm the bucket policy CloudFront added matches `aws/s3-bucket-policy.json`

### 2.3 Test
1. Open the `*.cloudfront.net` address. The site should load
2. Open the S3 object URL directly. It should say **Access Denied**

---

## Phase 3 — Custom Domain, Certificate, and DNS

### 3.1 Buy the domain
1. Register the domain on Cloudflare with auto-renew on

### 3.2 Get the certificate
1. **CloudFront → your distribution → Add domain**
2. Enter `yourdomain.com` and `www.yourdomain.com`, then **Create certificate**
3. ACM shows two CNAME validation records

### 3.3 Add the DNS records in Cloudflare
1. Add both validation CNAMEs. For the name, enter only the part before your domain
2. **Turn the orange cloud off (DNS only).** Proxied records fail validation
3. Wait for the certificate to show **Issued** in ACM (us-east-1), then finish **Add domain**
4. Add CNAME `@` → your `*.cloudfront.net` address (DNS only)
5. Add CNAME `www` → your `*.cloudfront.net` address (DNS only)
6. Keep the validation records forever. ACM uses them to auto-renew

---

## Phase 4 — Build the Chatbot

### 4.1 Create the function
1. **Lambda → Create function**, Python **3.13**, x86_64
2. Note the region. Every later command needs it

### 4.2 Package and deploy (in CloudShell, same region)
```bash
mkdir -p package
pip3 install anthropic -t package --platform manylinux2014_x86_64 --only-binary=:all: --python-version 3.13
cp lambda_function.py package/
cd package && zip -qr ../function.zip . && cd ..
aws lambda update-function-code --function-name resume-chatbot --zip-file fileb://function.zip --region YOUR-REGION
aws lambda update-function-configuration --function-name resume-chatbot --runtime python3.13 --timeout 30 --memory-size 256 --region YOUR-REGION
```
The runtime has to match `--python-version`. Some of the libraries are compiled for one specific Python version.

### 4.3 Add the API key
1. **Configuration → Environment variables → Edit**
2. Key `ANTHROPIC_API_KEY`, value = your key. Make sure the value box isn't empty before saving

### 4.4 Create the Function URL
1. **Configuration → Function URL → Create**, auth type **NONE**
2. Turn on **CORS**: allow origins `https://yourdomain.com` and `https://www.yourdomain.com`, header `content-type`, method `POST`
3. Paste the Function URL into `CHAT_API` in `site/script.js` and re-upload it

### 4.5 Test
1. Ask the bot a question **on the live domain**. Opening the file locally fails on purpose (origin `null`)
2. Check **CloudWatch Logs** for errors and token counts

---

## Phase 5 — Visit Counter (in progress)

1. **DynamoDB → Create table** `site-visits`, partition key `id` (String)
2. **Lambda → Create function** `visit-counter`, Python 3.13, paste `lambda/visit-counter/lambda_function.py`. No packaging needed, boto3 is built in
3. Environment variables: `TABLE_NAME=site-visits`, `ORIGIN_SECRET=<long random string>`
4. Attach `aws/visit-counter-iam-policy.json` to the function's role (least privilege, one table only)
5. Create a Function URL, auth type **NONE**
6. **CloudFront:** add the Function URL as an origin with custom header `x-origin-verify: <same secret>`, create an origin request policy that forwards `CloudFront-Viewer-Country` and all query strings, then add a behavior for `/api/*` with caching disabled

---

## Phase 6 — Analytics

1. **Cloudflare → Web Analytics → Add a site**
2. Choose **Enable with JS Snippet installation** (the automatic option only works on proxied sites)
3. Paste the snippet before `</body>` in `index.html`

---

## Updating the Site

```
1. Upload changed files to S3
2. CloudFront → Invalidations → Create → /*
3. Hard refresh (Ctrl+Shift+R)
```

Changes to `bot-notes.txt` reach the bot within ~10 minutes. README changes on GitHub reach it within ~1 hour. No redeploy needed for either.