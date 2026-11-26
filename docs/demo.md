# Demonstration and presentation
1. Start backend and frontend using README. Open http://localhost:5173.
2. Dashboard: show actual dataset baskets/products and latest completed run counts.
3. Dataset: explain sequential exclusions, missing-customer retention and Boolean product presence.
4. Configure mining: explain support .02, confidence .50, lift 1, itemset size 3. Enter the local operator token privately. Never display `.env` on the projector. Submit once and show Queued/Running/Completed.
5. Rules: search "REGENCY", sort confidence, inspect directional metrics and pagination.
6. Visualization: inspect a tea-cup relationship, select an edge, zoom/pan/reset; emphasize conceptual adjacency rather than physical floor planning.
7. Report: show ranked pairs, thresholds and caveats; export CSV and compare with graph evidence.
8. Refresh/reopen: results persist in PostgreSQL. Show /docs without displaying credentials.

Suggested slides: problem and users; scope and non-causal decision support; dataset and cleaning; FP-Growth and metric definitions; architecture/data flow/ERD; six-screen demo; measured real results/resources; correctness tests and limitations; Supabase/Render/Vercel deployment plan; future planner validation and real floor-plan overlay (only with dimensions).
