# M3.5 — Stranger Test Protocol

## What this is

A structured test to find out whether an unfamiliar developer can use Memory Layer without us.

## Setup (before the test)

1. Make sure the repo is public (or give the tester access)
2. Provide credentials: a working `MEMORY_LAYER_KEY` against a running API
3. Confirm the API is reachable from their machine

Give them only:

```
GitHub repo URL
```

Nothing else. No walkthrough. No Slack thread. No architecture diagram.

## The task

Say exactly this:

> "You're building an AI application. Add Memory Layer so the application can remember something about a user and retrieve that context later."

Then stop talking.

## Signals to capture

### T+0 — Product comprehension

After they read the README (before they start coding), ask:

> "In your own words, what do you think Memory Layer does?"

Record their answer verbatim. Do not correct them.

- [ ] Understood the core value (persistent memory for AI apps)
- [ ] Understood user ownership model
- [ ] Confused it with something else (what?)
- [ ] Didn't understand the positioning

### T+2m — Installation

Watch silently. Record:

- [ ] Found the SDK package name without help
- [ ] Knew to run `npm install @memory-layer/sdk`
- [ ] Found the credentials setup (.env / API key)
- [ ] Knew it was server-side (not a browser widget)
- [ ] Got stuck on: _______________

### T+5m — Initialization

Record:

- [ ] Created `new MemoryLayer({ apiKey: ... })` without help
- [ ] Copied from quickstart vs. figured it out from API docs
- [ ] Started reading protocol internals (packages/protocol, etc.) — DX failure signal
- [ ] Got a working client without architectural archaeology
- [ ] Got stuck on: _______________

### T+10m — Write

Goal: "Make the application remember that the user prefers dark mode."

Record:

- [ ] Found `memory.observe()` naturally
- [ ] Understood predicate/value pattern
- [ ] Chose reasonable category ("preferences")
- [ ] Tried to directly manipulate claims/database — API design signal
- [ ] Got stuck on: _______________

### T+15m — Read

Goal: "Now retrieve that memory as context for the AI."

Record:

- [ ] Found `memory.context()` naturally
- [ ] Understood the response shape (items, summary, confidence)
- [ ] Could filter by category
- [ ] Got stuck on: _______________

## The question

After they finish (or stop), ask:

> "Would you actually put this into one of your AI applications?"

Then immediately:

> "Why or why not?"

### Classify the answer

| Signal | Response pattern | What it means |
|--------|-----------------|---------------|
| **A — Strong** | "Yes, I have an app where this solves a problem." | Ask: "What application?" — potential design partner |
| **B — Problem exists** | "Yes, but I'd use Mem0/Zep instead." | Problem validated, differentiation not validated. Ask: "What would we need to do for you to choose us?" |
| **C — Too complicated** | "I like it, but integration is too much work." | DX failure. Find the exact friction point. |
| **D — Don't care** | "I don't really need this." | If 2+ say this, revisit product thesis. |
| **E — Want it** | "Can I use this in my app?" / "How do I get a production key?" | Strongest signal. Stop asking questions. Start integrating. |

## Who to test

Run at least 3 tests. Target:

1. Developer building an AI application (chatbot, copilot, tutor, agent)
2. Indie/solo developer shipping AI features
3. Developer building an agent/assistant/copilot

They don't need to be senior. They need to resemble someone who might actually integrate this.

## Rules

- Do not explain architecture during the test
- Do not say "actually, Passport means..."
- Do not point them to the right file
- Do not fix bugs while they're testing
- If you interrupt the test, record that explicitly
- One developer is noise. Three with the same reaction is a pattern.

## Exit criteria

| Metric | Minimum |
|--------|---------|
| Understand basic value | 3/3 |
| Complete install without help | 2/3 |
| Complete write + retrieve | 2/3 |
| Understand context API | 2/3 |
| "I'd actually use this" | 1/3 |

This is developer validation, not product-market fit. PMF comes from repeated usage, retention, and money.

## Record template

```
Tester: [name/description]
Date: [date]
Background: [what they build, experience level]

T+0 comprehension: [their exact words]
T+2 installation: [pass/stuck on ___]
T+5 initialization: [pass/stuck on ___]
T+10 write: [pass/stuck on ___]
T+15 read: [pass/stuck on ___]

Would they use it: [A/B/C/D/E]
Verbatim response: [exact quote]

Friction points:
1. ___
2. ___
3. ___
```
