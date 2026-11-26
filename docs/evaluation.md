# Evaluation
Full UCI dataset, no subsampling. Evidence snapshot: `evaluation-results.json` (first 25 recommendations; database/CSV contain all 38). Thresholds: support 0.02, confidence 0.50, lift 1.0, maximum itemset size 3. Basket denominator 20,728, product codes 3,829; 358 itemsets, 52 qualifying rules, 38 unique undirected adjacency pairs. The first real run took 18.8316 s of mining; process peak RSS 1537.98 MiB (Linux ru_maxrss/1024). Two later runtime-role runs reproduced the counts in 42.9933 s and 50.8164 s, with peak RSS up to 1538.92 MiB. The snapshot records the latest run. Concurrent verification and encoding revisions mean these are not controlled timing comparisons or Render capacity guarantees. Timestamps and run ID are retained in the snapshot.

## Metric correctness
An independent 100-basket fixture has A in 30, B in 40, and A+B in 20: support .20, confidence A→B 2/3, B→A .50, lift 5/3. pytest checks actual mlxtend outputs with numerical tolerances, support boundary .20 versus .21, one-way qualification and deterministic pairs. These synthetic fixtures validate correctness and are not mixed with project outcomes.

## Qualitative review of actual pairs
| Pair | Support | Confidence A→B / B→A | Lift | Engineering assessment |
|---|---|---|---|---|
|Green Regency teacup / Pink Regency teacup|.0305384|.623645 / .826371|16.875875|Coherent variants; reasonable shared display candidate|
|Gardeners kneeling pad Cup of Tea / Keep Calm|.0263412|.720317 / .598028|16.353475|Same product family; shared seasonal gardening display plausible|
|Pink Regency teacup / Roses Regency teacup|.0288981|.781984 / .561914|15.205414|Complementary collection variants; category planner should assess shelf space|

Every adjacency originates from qualifying singleton association rules. Missing reverse confidence is null (that direction did not qualify). Ranking: descending lift, descending support, descending maximum qualifying directional confidence, then product codes. No intermediate rounding. Support/lift are symmetric for a pair; confidence remains directional. Higher-order rules remain in the rule table; frequent itemsets are exposed through the paginated itemsets endpoint.

These are engineering plausibility observations, not feedback from an actual store planner. The source is an online retailer with wholesale customers, so transfer to a physical floor plan is uncertain. Lift favors rare associations; support and confidence must be considered together. Prices, margins, aisle dimensions, safety, inventory, customer routes and causal uplift are not modeled. Administrative product codes remain in preprocessing; operator review must exclude non-placeable items. No train/test accuracy, causal sales claim or physical layout optimum is reported.

## Verification limits
The HTTP workflow verifies actual import, authenticated submission, queued/running/completed persistence, and rules/adjacencies/report/itemsets/CSV retrieval from Supabase. Separate integration tests create and remove only a unique synthetic test schema, asserting metrics and database constraints. DOM tests cover UI states and graph interactions. Browser workflow verification status and final exact test commands are in `final-report.md`. Public HTTPS deployment and target-host benchmarks remain unverified until the owner provisions hosting.
