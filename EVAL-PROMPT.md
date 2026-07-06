# Evaluation Prompt — paste into a fresh slowking session

Fill the two placeholders (`<PASTE_PR_URL>`, `<PASTE_DEMO_VIDEO_URL>`) once the PR and video exist. Deliberately neutral: gives the evaluator everything it needs and lets it run its real gated pass, so the number it returns is trustworthy.

**Run it AFTER the PR and demo video exist and are linked from the PR body.** With empty placeholders the PR and demo gates fail and it returns 0/100 by rule — telling you nothing. For an interim read before the video is ready, tell the evaluator explicitly to run as a "dress rehearsal, runtime-only, not a terminal gate-fail" (like the session that produced this) so you still get useful per-dimension feedback.

```
Evaluate this candidate submission for PrismTeam Assignment B, the "Oracle Property
Intelligence Platform," as a full gated scoring pass against your 100-point rubric.
Drive the live hosted runtime with the Playwright browser and credit only what you
can personally make happen — do not take documentation claims on faith.

Submission artifacts:
- Assignment repo (source of truth for requirements): prismteam-ai/oracle-property-intelligence-platform  (README has the 24 required demo inquiries, Demo Requirements, Definition of Done)
- Candidate PR: <PASTE_PR_URL>
- Hosted runtime (public, no login): https://2vpmrwfxgv.us-east-2.awsapprunner.com
- Demo video: <PASTE_DEMO_VIDEO_URL>
- Credentials: none — the runtime is fully public
- Assignment sent: 2026-07-05 ; use the candidate's latest commit timestamp for the speed dimension

What to verify through the live runtime:
1. All four exploration views (Property, Tenant, Business, Contractor) render real Lee
   County records with their required panels.
2. All 24 required demo inquiries (verbatim list in the README) plus the stretch
   inquiries run from /insights and return non-empty real rows with citations; report
   any that are empty or error.
3. The RAG Q&A at /ask returns source-backed, cited answers (entity id + resolvable
   source URL); note which retrieval/answer mode it uses.
4. Provenance resolves (ipfs://, bbb.org, county permit links) — sample a few.
5. Data is real at scale (not a toy sample); confirm the coverage counts on /sources.
6. Access boundary: confirm the app reads its own reconciled Postgres and that data
   provenance is the public Oracle IPFS export; flag anything touching a gated surface.

Then apply the gates and the full weighted scorecard, including the Functional Outcome
Breakdown, exactly as specified in your rubric. Be factual and cite what you observed.
```

When the report comes back, read it as a to-do list: whatever dimension it docks points on is a concrete, honest improvement to make before submitting — the fastest legitimate path to a higher number.
