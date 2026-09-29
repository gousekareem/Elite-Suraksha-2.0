# Video plan (2–5 minutes)

| Time | Screen | Say / show |
|---|---|---|
| 0:00–0:30 | Login page | The problem: earnings change, workers can't tell why or whether it happened before. "EliteSuraksha remembers the worker's history." |
| 0:30–1:00 | Judge Demo → Reset → Load history; then **Without vs With Memory** (first column) | "Without memory the agent can only see today." Show the stateless answer. |
| 1:00–3:00 | Ask "What do I normally earn on Friday evenings?" → Introduce first anomaly → Ask "Why did my earnings drop?" → Agent Memory Trace (Hindsight recall step, memories) → Create investigation → Resolve with platform clarification | Real Hindsight retain/recall: point at the trace, the Memory Inspector (live bank contents, "retained because"), and the API terminal showing `[HINDSIGHT] RETAIN … investigation_outcome`. |
| 3:00–4:00 | Jump to 14 Aug → Ask "Why did my earnings drop again?" | The banner "I found a similar situation in your previous history", the recalled outcome, "check eligibility first (from memory)", and the refined inference about acceptance rate. Then the three-column comparison. |
| 4:00–4:30 | Open investigation for 14 Aug → Generate report | Previous outcome appears as evidence; 13-section report with disclaimer. |
| 4:30–5:00 | Memory Journey | "First case → outcome remembered → similar problem → recalled → better investigation → it learns again." |

Tip: keep the API terminal visible (`npm run dev:api`) to show real `[HINDSIGHT]` log lines.
