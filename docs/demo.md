> Historical design/demo notes. For the current nine-page application and verified commands, use [the improvement report](improvement-report.md) and [README](../README.md).

# Local demo

1. Start the backend and frontend using the [README](../README.md); both use root `.env`. Open http://localhost:5173.
2. Create/verify an account or sign in with an authorized verified account. There is no shared app password. Use Forgot password when needed.
3. Overview: select UCI Online Retail Dataset and inspect actual dates, 20,728 baskets and 3,829 products. New accounts see no private legacy history.
4. Mining: name a baseline analysis; support .02, confidence .50, lift 1.0, maximum size 3. Submit once and wait for Completed. Every eligible basket is used. Global concurrency and six submissions/account/hour apply.
5. Search/load an owned completed analysis through previous-run selection. Expected baseline: 358 itemsets, 52 rules, 38 recommendations.
6. Association Rules: search product names, filter metrics, sort columns and paginate. Hover a table and scroll; on narrow screens, use horizontal scrolling/keyboard access.
7. Product Layout: inspect a relationship, its support/directional confidence/lift, zoom/pan and reset. This is conceptual adjacency, not a physical floor plan.
8. Reports: review dataset/configuration and explanations, search recommendations and export the complete authorized CSV.
9. Collapse the sidebar, inspect account/profile, test mobile navigation, then sign out. Private selections clear and direct application entry returns to sign-in.

Use dedicated test accounts for repeatable demonstrations and do not change limits to avoid HTTP 429. Owner-managed email redirects and hosting checks remain in the [deployment runbook](deployment.md). Safe screenshots and evidence are in the [improvement report](improvement-report.md).
