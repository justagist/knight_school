# Changelog

All notable changes to KnightSchool will be documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); auto-managed by [`standard-version`](https://github.com/conventional-changelog/standard-version) - `npm run release` regenerates from the Conventional Commits log and writes the new version + tag.

## 1.0.0 (2026-05-24)

First public release. MVP feature-complete across the ten build steps plus the polish + security pass. Live at [knight-school.pages.dev](https://knight-school.pages.dev/).

### Features

* **engine:** Stockfish lite in a Web Worker with UCI state machine ([91475e3](https://github.com/justagist/knight_school/commit/91475e393db04b98d537c063e687b4e2a3761612))
* **analyze:** full-game analysis, eval graph, sounds, classifier ([8d1bcac](https://github.com/justagist/knight_school/commit/8d1bcac52e155e491d51cf876edc6da3d3d15721))
* **analyze:** guess-mode, exploration, captures + UX polish ([d73056b](https://github.com/justagist/knight_school/commit/d73056b57435e30aa12a5152a6d958edd9ef0e42))
* **analyze:** recent-games history with per-row + clear-all controls ([ff96222](https://github.com/justagist/knight_school/commit/ff96222f7f55df82732d2190f3bc285ed559a797))
* **settings:** LLM key management, storage indicator, backup, clear-all ([5ec3483](https://github.com/justagist/knight_school/commit/5ec3483c69ec12bf66ab6e30a9a3b6d10fa264c9))
* **settings:** session-only API keys + storage disclosure ([e8f766b](https://github.com/justagist/knight_school/commit/e8f766b412c7d705f02b86a3387f861cc0ea0fea))
* **chat:** Elle - global chat, per-move commentary, web-search opt-in ([ae781e6](https://github.com/justagist/knight_school/commit/ae781e632d0cad006d42384384a8277e93ef1b3c))
* Groq + OpenRouter providers, lesson viewer eval bar + author notes, board polish ([e8c578b](https://github.com/justagist/knight_school/commit/e8c578ba7edbc7ac8222a0900bd3e70e32045a35))
* **openings:** hybrid ECO bundle + optional Lichess token + exploration-aware chat ([0d04a40](https://github.com/justagist/knight_school/commit/0d04a40187e1618fe28a5bbfd8c4f0802f87b465))
* **openings:** Lichess Study import, curated catalog, lesson viewer ([fe10e4b](https://github.com/justagist/knight_school/commit/fe10e4beaca3e6aaced0a0e080ab975dc3224e45))
* **openings:** drill mode + scheduler + guess variant + chat invalidation ([b71fa6d](https://github.com/justagist/knight_school/commit/b71fa6dfbd1ea6f25754833504f056256bf88962))
* **drill:** mixed + spot drill modes with variation-aware position pool ([168d15b](https://github.com/justagist/knight_school/commit/168d15b5c2039051558750148042023f27380275))
* **drill:** spot feedback + queueable sessions ([8145559](https://github.com/justagist/knight_school/commit/81455599bc5bf78b6f445ae84deafb91e5a2683a))
* **drill:** elle context, per-move feedback, queue polish ([7fb1229](https://github.com/justagist/knight_school/commit/7fb122930d818c1aea3d2bdd8e58510b16ff63c3))
* **plan:** goal tracker + weekly checklist (Step 9) ([0d25d3a](https://github.com/justagist/knight_school/commit/0d25d3afbe529ad169025f666a71e347b16eaa4d))
* **plan:** goal banner, focusable columns, week navigation ([67cb020](https://github.com/justagist/knight_school/commit/67cb020ae472b28e726f527826ce312e68ab3fb5))
* **ui:** mobile polish pass - bottom tab bar, Slate & Amber tokens, chat overhaul, settings accordion ([bde63a2](https://github.com/justagist/knight_school/commit/bde63a29b3cdafcf6d18633701706240f14ad95d))
* **ui:** landing page, desktop analyze overhaul, study rename ([b5dd919](https://github.com/justagist/knight_school/commit/b5dd919f0858dea67562b8852413f562440acd34))
* **pwa:** offline banner + tighter update prompt copy ([bc7da67](https://github.com/justagist/knight_school/commit/bc7da670edf58afc74c53fe735831202577f3829))
* scaffold app shell and add PGN analyze view ([aaee11a](https://github.com/justagist/knight_school/commit/aaee11acd7b3c52a25c9b22225454e095b8cac43))

### Bug Fixes

* **pgn:** preserve promotion in PGN -> UCI conversion ([860ba81](https://github.com/justagist/knight_school/commit/860ba81b2c97f1c3cd2256c69b6f489ea7199fcb))
* **chat:** clear sending flag on thread switch ([79c8e00](https://github.com/justagist/knight_school/commit/79c8e00dcc0a18c6e99de46db26d4438b7b8dd72))
* **chat:** whitelist http/https for citation URLs ([fc08d39](https://github.com/justagist/knight_school/commit/fc08d3969ff0a5da304b0cdb9f2a7a7c9b385317))
* **chat:** refresh setOpen closure when drill state changes ([fc3a70d](https://github.com/justagist/knight_school/commit/fc3a70d7cc36fcbbf5cc74cfea2a8e05fed0c326))
* **db:** atomic drill stats updates ([7f8c855](https://github.com/justagist/knight_school/commit/7f8c855dbc676f97b7f0508d1cb841376914a392))
* **study:** atomic re-import of study + position pool ([ffd39ff](https://github.com/justagist/knight_school/commit/ffd39fff2a7f280abc22980721825c438f709c2c))
* **release:** clearAllData, atomic cascades, themed EvalGraph, lazy routes ([aebbae3](https://github.com/justagist/knight_school/commit/aebbae36768464f7c57d95ed641dc6e690a57932))
* **release:** P2 batch - navigation, noopener, retryable, watchdog, events ([5c88c7e](https://github.com/justagist/knight_school/commit/5c88c7ed9aeaaef65333f841f88c9a35a4f71059))
* **lessons:** reorder mobile layout so buttons stay in thumb reach ([571e259](https://github.com/justagist/knight_school/commit/571e259c436b0d11ca66d6669c8b3a6fe1046cbb))
* render diagram-only chapters; stop coord overlap on mobile ([8ba367f](https://github.com/justagist/knight_school/commit/8ba367f99481da1ca1997363b27fd41adaf45e99))
* **plan:** readable layout when many items roll forward ([4f99f92](https://github.com/justagist/knight_school/commit/4f99f92de9dd36af3adb068fa024261ac41f0d49))
* **plan:** collapse rolled-forward past-day items to placeholder ([09adc4e](https://github.com/justagist/knight_school/commit/09adc4e5b8c5d27530c4775c178e04df58151478))
* **plan:** make week-nav buttons visible ([6e5b898](https://github.com/justagist/knight_school/commit/6e5b898bd203beebb0eee4ee9bb15a1ae5b074fb))
* **ui:** responsive sweep - tap targets + truncation + stack on mobile ([e738ef8](https://github.com/justagist/knight_school/commit/e738ef80f9acf260b60c973a3ccf74212204236f))
