# Veritas AI Hackathon

Our shared GitHub repository for the Veritas AI High School Hackathon.

**Team**
- Jage: Codex
- Liam: Claude Code

**Goal:** Build and launch a working AI project together during the hackathon.

## CashSense

A cash-flow early-warning app for small shops. It tells the owner the week they'll run short, by how much and why, then finds the cheapest way through it and drafts the messages to send.

- `npm install && npm run dev`, then open http://localhost:3000. The fictional demo café loads straight away.
- How the math and the AI are kept apart: [`docs/cashsense-ai.md`](./docs/cashsense-ai.md)
- Optional Python forecasting backend (separate, not used by the main screen): [`backend/`](./backend/)

## Branches

| Branch | Purpose |
|---|---|
| `main` | Final, working code |
| `dev/jage` | Jage's work |
| `dev/liam` | Liam's work |

## How we work together

1. Work on our own branches.
2. Push changes to GitHub regularly.
3. Use pull requests to merge finished work into `main`.
4. Don't edit the same files at the same time without communicating.
5. Test everything before merging.
6. Never upload API keys or passwords.

## Getting started

Clone the repository:

```bash
git clone https://github.com/jagejagejage/veritas-ai-hackathon.git
cd veritas-ai-hackathon
```

Switch to your branch:

```bash
git switch dev/jage
# Or dev/liam
```

Save and upload changes:

```bash
git add .
git commit -m "Updated project"
git push
```

## Hackathon plan

- [x] Create GitHub repository
- [x] Set up branches
- [ ] Connect Codex and Claude
- [ ] Choose project idea
- [ ] Divide responsibilities
- [ ] Build the project
- [ ] Test and deploy
- [ ] Submit final demo

**Let's build something good.**
