"""
Resume chatbot - AWS Lambda function.

Visitors on devinxiong.com ask questions; this function answers them using
Claude Haiku 5.5 and the resume text below. The Anthropic API key lives in the
Lambda environment variable ANTHROPIC_API_KEY, never in the website.
"""

import json
import time
import urllib.request

import anthropic

MODEL = "claude-haiku-5-5"
MAX_QUESTION_CHARS = 500   # longest question a visitor can send
MAX_HISTORY_TURNS = 6      # how many earlier messages to keep for context
MAX_ANSWER_TOKENS = 1200   # caps cost per answer; mock-ticket runbooks need the room

# Extra notes Devin edits without redeploying: hobbies, career gap, location, etc.
NOTES_URL = "https://devinxiong.com/bot-notes.txt"
NOTES_REFRESH_SECONDS = 600

# Public GitHub repos the bot can talk about. READMEs are pulled live, so editing
# a README on GitHub updates the bot within PROJECTS_REFRESH_SECONDS.
GITHUB_USER = "devinxiong97"
PROJECT_REPOS = [
    "it-service-agent",
    "jeff-bot",
    "onboarding-offboarding-automation",
    "access-governance-toolkit",
    "Google-IT-Automation",
    "gdrive-mcp-server",
]
PROJECTS_REFRESH_SECONDS = 3600
MAX_README_CHARS = 7000

ALLOWED_ORIGINS = {
    "https://devinxiong.com",
    "https://www.devinxiong.com",
}

RESUME = """
Name: Anourack Devin Xiong
Email: devin.xiong97@outlook.com
LinkedIn: https://www.linkedin.com/in/devin-xiong/
GitHub: https://github.com/devinxiong97

Summary: IT professional with 5+ years supporting and administering hybrid macOS
and Windows environments across identity, device management, SaaS, networking,
and security compliance. Focused on using scripting and AI to take repetitive
work off people's plates, and helping teams adopt AI tools that make them faster
and better at their jobs.

Skills:
- Identity & Access: Okta, Okta Workflows, JumpCloud, Entra ID, Active Directory,
  SCIM, SAML, OIDC, SSO, MFA, IAM
- Endpoint & Cloud: Jamf Pro, macOS, Windows, AWS (S3, IAM, Route 53, CloudFront,
  Lambda), Azure, GCP, DNS, firewalls, networking
- SaaS & Scripting: Google Workspace (GAM/CLI), Microsoft 365, Slack, Atlassian,
  Zoom, PowerShell, Python, SQL, GitHub, VS Code
- AI & Automation: Claude, Claude Code, Atlassian Rovo, Okta Workflows, webhooks,
  AI agents and bots (in progress), runbooks, Workato
- Security & Compliance: SOC 2, ISO 27001, HIPAA, HITRUST, access reviews,
  CompTIA Security+ (SY0-701), CatoVPN

Experience:

RxSense, Boston, MA - Senior Information Technology Support Analyst (Jul 2026 - Present)
- Primary IT escalation point for executives and staff, owning the support queue
  and resolving complex, multi-system issues across macOS, Windows, and cloud.
- Administers identity and access across Okta, Entra ID, Active Directory, Google
  Workspace, and Windows 365: account lifecycle, MFA, groups, SSO troubleshooting.
- Builds and maintains PowerShell and Python automation for IT administration,
  version-controlled in GitHub, using Claude to speed up scripting and documentation.
- Supports AWS, Azure, and GCP administration, office networking, A/V, and Brivo
  physical access in a SOC 2, HIPAA, HITRUST, and ISO 27001 regulated environment.

Brightcove, Boston, MA - Information Technology Specialist (Nov 2022 - Mar 2025)
- Managed IT for a 300-person hybrid macOS/Windows company: identity, endpoint,
  SaaS, networking, A/V, and security controls.
- Resolved 80-100 tickets a week, averaging 10-20 complex, high-level requests a day.
- Reduced Tier 1 ticket volume by 35% by deploying Atlassian Rovo and Okta
  Workflows, backed by a self-built GitHub repository of webhook and Slack automation.
- Automated routine requests (provisioning, access changes): requests that took
  about a working day by hand, against a 24-hour SLA, dropped to 1-2 hours, and
  about 4 hours for more complex ones.
- Administered lifecycle operations across Okta and JumpCloud.
- Led SOC 2 Type I/II and ISO 27001 programs: control scoping, evidence
  collection, access reviews, and audit coordination.
- Built Jamf Pro MDM from scratch: configuration profiles, endpoint security,
  patch management.
- Owned SaaS administration across Google Workspace, Slack, Atlassian, and Zoom,
  including licensing and access governance.
- Primary IT escalation point for the C-suite; managed hardware, ISP, and SaaS
  vendor contracts, pricing benchmarks, and renewals.

Electric Supply Center, Burlington, MA - IT Support Specialist (Jan 2022 - Nov 2022)
- Managed IT operations across Microsoft 365, Windows and macOS endpoints,
  on-premise servers, switches, firewalls, and wireless access points.
- Managed Active Directory accounts, permissions, and group policies; handled
  provisioning and deprovisioning.
- Created and maintained technical documentation and infrastructure specs.

Amazon - Technical Customer Support Associate (Aug 2021 - Dec 2021)
- End-to-end technical support for Blink smart home and security cameras.
- Tracked recurring failure patterns and surfaced product trends to team leads.

Education: University of Massachusetts Lowell - B.S. Business Administration,
Management Information Systems concentration, 2024.

Certifications: CompTIA Security+ (SY0-701); Workato Automation Pro I.

This website itself: a static HTML/CSS/JavaScript site Devin built and hosts on
AWS (private S3 bucket behind CloudFront with HTTPS), with the domain on
Cloudflare DNS. This chatbot runs on AWS Lambda and Claude.
"""

SYSTEM_PROMPT_TEMPLATE = """You are the assistant on Devin Xiong's personal resume website. \
Visitors are mostly recruiters and hiring managers. You know Devin well, and \
everything you know about him is below. Answer questions about his experience, \
skills, projects, and background from it.

<career_history>
{resume}
</career_history>

<more_about_devin>
{notes}
</more_about_devin>

<github_projects>
{projects}
</github_projects>

How to answer:
- Keep answers short: 2-4 sentences, plain text, no markdown headings.
- Speak about Devin in the third person, using he/him pronouns.
- Talk like a colleague who simply knows these things about Devin. Never refer \
to where your information comes from: no "his notes", "his resume", "according \
to", "the information I have", or "it says". State the facts directly.
- For the career gap, what Devin wants next, and similar personal topics, stay \
close to the wording and framing in more_about_devin.
- If something isn't covered above, say you don't know that about Devin and \
suggest emailing him at devin.xiong97@outlook.com. Never guess or fill gaps, \
especially about employment gaps, reasons for leaving a job, or availability.
- Never state salary figures, and don't commit Devin to anything (start dates, \
relocation, interviews). Point those to email.
- Don't discuss Devin's age, health, family, religion, politics, or other \
personal matters unless more_about_devin explicitly covers them.
- Don't exaggerate or invent numbers, employers, or dates.
- If a question has nothing to do with Devin or hiring, politely say you can \
only answer questions about Devin's background.

GitHub projects:
- When asked what Devin has built, or about a specific project, describe it and \
include the repo link. Several projects use fictional clients and \
sample data; say so when relevant, and don't present them as work for a named employer.

Mock tickets:
- If a visitor wants to see how Devin would handle an IT problem, tell them to \
type "Mock ticket:" followed by the problem, or click one of the sample tickets.
"""

# Extra instructions used only when the visitor asks for a mock ticket. The answer
# comes back as JSON (TICKET_SCHEMA) and the website renders it as a ticket card.
TICKET_INSTRUCTIONS = """
This request is a mock IT ticket. Show how Devin's IT Service Agent approach \
would triage it, as a short, polished demo for a recruiter or IT leader.
- issue: the ticket as a user would report it, one sentence. If the visitor gave \
no specific problem, invent a realistic one for a 300-person hybrid company.
- priority: use the P1-P4 scale from the it-service-agent project. \
priority_reason: under 10 words.
- summary: one sentence on the goal.
- steps: 4-6 steps, in order. Each starts with a verb, is under 15 words, and \
names the specific tool (Okta, Jamf Pro, Google Workspace/GAM, Slack, Entra ID, etc.).
- related_repo: the single most relevant project.
- This is a demonstration, not a record of real past work.
"""

TICKET_SCHEMA = {
    "type": "object",
    "properties": {
        "issue": {"type": "string"},
        "priority": {"type": "string", "enum": ["P1", "P2", "P3", "P4"]},
        "priority_reason": {"type": "string"},
        "category": {
            "type": "string",
            "enum": ["network", "hardware", "software", "access", "security", "provisioning", "other"],
        },
        "summary": {"type": "string"},
        "steps": {"type": "array", "items": {"type": "string"}},
        "related_repo": {"type": "string", "enum": PROJECT_REPOS},
    },
    "required": ["issue", "priority", "priority_reason", "category", "summary", "steps", "related_repo"],
    "additionalProperties": False,
}

_projects_cache = {"text": "", "fetched_at": 0.0}


def _load_projects():
    """Fetch the README of each repo in PROJECT_REPOS, cached for PROJECTS_REFRESH_SECONDS."""
    if time.time() - _projects_cache["fetched_at"] < PROJECTS_REFRESH_SECONDS:
        return _projects_cache["text"]
    sections = []
    for repo in PROJECT_REPOS:
        url = f"https://raw.githubusercontent.com/{GITHUB_USER}/{repo}/HEAD/README.md"
        try:
            with urllib.request.urlopen(url, timeout=3) as resp:
                readme = resp.read(MAX_README_CHARS).decode("utf-8", errors="replace")
        except Exception as e:
            print(f"Could not load README for {repo}: {e}")
            continue
        sections.append(f"### {repo}\nLink: https://github.com/{GITHUB_USER}/{repo}\n\n{readme.strip()}")
    if sections:
        _projects_cache["text"] = "\n\n".join(sections)
    _projects_cache["fetched_at"] = time.time()
    return _projects_cache["text"]

_notes_cache = {"text": "", "fetched_at": 0.0}


def _load_notes():
    """Fetch bot-notes.txt from the website, cached for NOTES_REFRESH_SECONDS.

    Lines starting with # are instructions for Devin and are stripped. If the
    fetch fails, the last good copy is kept so the bot still works.
    """
    if time.time() - _notes_cache["fetched_at"] < NOTES_REFRESH_SECONDS:
        return _notes_cache["text"]
    try:
        with urllib.request.urlopen(NOTES_URL, timeout=3) as resp:
            raw = resp.read(20_000).decode("utf-8", errors="replace")
        lines = [line for line in raw.splitlines() if not line.lstrip().startswith("#")]
        _notes_cache["text"] = "\n".join(lines).strip()
    except Exception as e:
        print(f"Could not load bot notes: {e}")
    _notes_cache["fetched_at"] = time.time()
    return _notes_cache["text"]

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from the environment


def _response(status, body, origin):
    # CORS headers are added by the Lambda Function URL's CORS settings, not here,
    # so the browser never sees them twice.
    return {"statusCode": status, "headers": {"Content-Type": "application/json"}, "body": json.dumps(body)}


def _clean_history(raw):
    """Keep only well-formed, short user/assistant turns from the browser."""
    history = []
    if not isinstance(raw, list):
        return history
    for item in raw[-MAX_HISTORY_TURNS:]:
        if not isinstance(item, dict):
            continue
        role, text = item.get("role"), item.get("content")
        if role in ("user", "assistant") and isinstance(text, str) and text.strip():
            history.append({"role": role, "content": text[:MAX_QUESTION_CHARS * 2]})
    # The conversation must start with a user turn.
    while history and history[0]["role"] != "user":
        history.pop(0)
    return history


def lambda_handler(event, context):
    origin = (event.get("headers") or {}).get("origin", "")

    # Blocks casual use from other sites. Scripts can fake this header, so the
    # real cost protection is the spend limit and concurrency cap set in AWS/Anthropic.
    if origin not in ALLOWED_ORIGINS:
        return _response(403, {"error": "Forbidden"}, origin)

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Invalid request"}, origin)

    question = str(body.get("question", "")).strip()
    if not question:
        return _response(400, {"error": "Please type a question."}, origin)
    if len(question) > MAX_QUESTION_CHARS:
        return _response(400, {"error": f"Please keep questions under {MAX_QUESTION_CHARS} characters."}, origin)

    messages = _clean_history(body.get("history")) + [{"role": "user", "content": question}]
    # Two user turns in a row aren't allowed; drop the stray one if the browser sent it.
    if len(messages) >= 2 and messages[-2]["role"] == "user":
        messages.pop(-2)

    is_ticket = "mock" in question.lower() and "ticket" in question.lower()
    system = SYSTEM_PROMPT_TEMPLATE.format(
        resume=RESUME,
        notes=_load_notes() or "(none yet)",
        projects=_load_projects() or "(unavailable right now)",
    )
    output_config = {"effort": "low"}
    if is_ticket:
        system += TICKET_INSTRUCTIONS
        output_config["format"] = {"type": "json_schema", "schema": TICKET_SCHEMA}
        messages = [{"role": "user", "content": question}]  # tickets stand alone

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_ANSWER_TOKENS,
            system=system,
            output_config=output_config,
            messages=messages,
        )
    except anthropic.RateLimitError:
        return _response(429, {"error": "Lots of questions right now. Please try again in a minute."}, origin)
    except anthropic.APIStatusError as e:
        print(f"Anthropic API error {e.status_code}: {e.message}")
        return _response(502, {"error": "The assistant is unavailable right now. Please email Devin instead."}, origin)
    except anthropic.APIConnectionError as e:
        print(f"Anthropic connection error: {e}")
        return _response(502, {"error": "The assistant is unavailable right now. Please email Devin instead."}, origin)

    if response.stop_reason == "refusal":
        return _response(200, {"answer": "I can only help with questions about Devin's background. Feel free to email Devin directly."}, origin)

    answer = "".join(block.text for block in response.content if block.type == "text").strip()
    print(json.dumps({"input_tokens": response.usage.input_tokens, "output_tokens": response.usage.output_tokens}))

    if is_ticket:
        try:
            ticket = json.loads(answer)
            ticket["steps"] = ticket["steps"][:6]
            return _response(200, {"ticket": ticket}, origin)
        except (json.JSONDecodeError, KeyError, TypeError):
            print(f"Bad ticket JSON (stop_reason={response.stop_reason}): {answer[:300]}")
            return _response(200, {"answer": "Sorry, I couldn't build that ticket. Please try again."}, origin)

    if not answer:
        answer = "Sorry, I couldn't come up with an answer. Please try rephrasing, or email Devin directly."

    return _response(200, {"answer": answer}, origin)
