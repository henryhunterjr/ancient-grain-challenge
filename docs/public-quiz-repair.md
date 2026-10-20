# Public quiz access repair — October 20, 2026

## Incident and scope

At https://challenge.bakinggreatbread.com/ every one of the seven lesson quiz links, plus the optional Waking Up the Berry link, led to a Muse share URL. Fresh logged-out browser sessions showed Muse login instead of a usable quiz. The previously published underlying content URL for Why Ancient Wheat Dough Feels Different returned HTTP 503 with “Shared artifacts are unavailable.” The challenge custom domain itself is public. Vercel protects preview domains, not this custom domain.

Affected lesson keys and titles: m3 From Berries to Bread; m7 Rye Redefined; m1 Why Ancient Wheat Dough Feels Different; m2 The Kneading Fallacy; m4 Which Wheat Berry Should You Use?; m6 Mastering Einkorn; m5 Ancient Grain Sourdough Starter. Bonus: Waking Up the Berry.

## Replacement and content provenance

All eight quiz buttons now use `/quiz?quiz=ORIGINAL_QUIZ_ID` on the challenge domain. They open in the same tab. Native accessible radio controls grade ten questions, show answer explanations, allow unlimited retakes, and link to the existing score receiver through an ordinary same-origin link. No Muse account, iframe permission, popup, or external host is needed.

Only the original **m1** fifteen-question bank could be recovered: the full public iframe source captured during the prior October 7/8 audit, `registry-score-handoff/test-output/muse-actual-source.html` in that audit workspace. Question wording, choices, correct answers, and teaching notes were retained. The old presentation, sponsor intermission, and score graphics were not transplanted because their assets depend on the unavailable host.

The other six lesson banks and the optional bonus bank are **replacement questions**, not claimed verbatim restorations of the Muse originals. They were authored from Henry's current original YouTube lesson transcripts, retrieved October 20, 2026:

| Key | Source video(s) | Questions in bank |
| --- | --- | --- |
| m3 | https://www.youtube.com/watch?v=smiOhsBluSY | 10 |
| m7 | https://www.youtube.com/watch?v=Lyjw-E4a-Qk | 10 |
| m1 | Recovered original quiz bank; original lesson video remains https://www.youtube.com/watch?v=QoGpW6hXxz8 | 15 |
| m2 | https://www.youtube.com/watch?v=1GGZgB2TMgY | 10 |
| m4 | https://www.youtube.com/watch?v=xWSZYfOUkrw | 10 |
| m6 | https://www.youtube.com/watch?v=30SLfbm1fZk | 10 |
| m5 | https://www.youtube.com/watch?v=gK2UtnJUxX8 and https://www.youtube.com/watch?v=2d-3xPuWsQc | 10 |
| bonus | https://www.youtube.com/watch?v=_2hW2qzV3nc | 15 |

Supporting original Module One material was also reviewed at https://docs.google.com/document/d/1y4awQUQrUTQEyXAzT8TdYnG_9_fJGueNGnGVO_dZfm8/edit and https://docs.google.com/document/d/1oOhqGPXhm_gZiQP28oIXtERK2YBmhm854WdJjc-zSh8/edit. Only lesson questions are included in the public code, not the private documents or raw transcripts.

The m3 mapping retains the pre-existing series introduction video. Replacement questions follow that actual video. No teaching-video URL or eighth lesson was invented.

## Preserved contracts

- Seven stable task IDs, original quiz IDs, lesson titles/order, and all original video IDs.
- Existing `record-score`, guest registration, email sign-in, entry-code sign-in, pending-result expiration and cross-tab safeguards.
- Exact 70% passing boundary. Results remain browser-reported, not independently server-graded.
- Explicit save to the chosen entry; server retains best score. Comment details are still required for lesson credit; one lesson earns its existing 20 points once.
- Bonus quiz never offers a challenge-score handoff and never earns challenge points.
- No changes to Supabase migrations, database functions, registration, entrants, newsletter consent, giveaway rules, mixer weights, or grain-draw eligibility.

## Validation

The expanded browser suite passes 64 tests covering all eight quizzes at 390px and 1440px, question/answer validity, pass/fail boundary, keyboard controls, same-tab navigation, explicit score handoff, guest registration, existing email/code authentication, retries, best-result handling, comment completion, and giveaway regressions. Shared-helper validation passes.

Disposable localhost PostgreSQL tests pass score validation, ownership, 70% boundary, pass/comment ordering, best-score retakes, duplicate points prevention, ten concurrent result submissions, cutoff and permissions. Separate winner/mixer suites pass grain pools, test exclusion, mixer weights and eligibility, prize limits, fulfillment locks and concurrent-draw guards. These are synthetic local tests, not live giveaway drawings.

The connected Supabase SQL tool rejected access to the production project. No production entrant, subscription, score, or drawing was created for testing. Deployment acceptance requires fresh logged-out production desktop/mobile runs and live API availability checks; the final verification report records that result separately.

## External limitation

Existing Muse URLs in Skool posts, old messages, or other sites remain controlled by Muse and may still show login. This release repairs the challenge's own eight quiz buttons. Those external references can instead use the new challenge quiz URLs; it cannot redirect URLs owned by muse.ai.
