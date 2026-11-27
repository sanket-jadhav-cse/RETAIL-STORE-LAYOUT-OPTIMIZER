> Historical design/demo notes. For the current nine-page application and verified commands, use [the improvement report](improvement-report.md) and [README](../README.md).

# Screen designs
Shared responsive shell: dark left navigation (wrapped top navigation on narrow screens), page title, refresh action, dataset selector and persisted-run selector. White evidence panels, teal actions, explicit status/error/empty messages. Labels and keyboard focus remain visible.

| Screen | Main region | Actions / states |
|---|---|---|
|Dashboard|Six statistic cards; planning guidance|Dataset selection, configure mining; unknown metrics show em dash|
|Dataset|Source/version/import time; quality table|Original/cleaned records, exclusion counts and denominator policy|
|Configure mining|Two-column labeled threshold form|Password field for operator token; submission lock; queued/running polling|
|Association rules|Search/lift/sort controls; evidence table|Names and codes, support/confidence/lift; pagination|
|Layout visualization|Product focus, zoom and reset; SVG graph; relationship evidence|Drag-to-pan, keyboard edge selection; paginated graph explicitly labeled conceptual|
|Recommendation report|Run/dataset/threshold context; ranked pairs and caveat|Complete CSV export, directional confidence and rationale, pagination|

Graph nodes are codes with product names in relationship inspection/tooltips. Edges are persisted recommendations. Graph pages contain at most 25 relationships for legibility; there is no fabricated floor plan. Invalid input uses HTML constraints plus API Pydantic validation. API requests are cancelled when result views change; mining polling is cleaned up on navigation/unmount. Operator token stays in component memory and clears after successful submission.
