# Changelog

## [0.3.0](https://github.com/guillaumegd/legirag/compare/legirag-v0.2.0...legirag-v0.3.0) (2026-08-20)


### Features

* add client-side local history of questions, answers, and traces ([6a2a1ed](https://github.com/guillaumegd/legirag/commit/6a2a1ed54f97745e8a78375210be021c3e5586f8))
* mirror build-plan features and fixes as GitHub issues (item 22) ([fbd213c](https://github.com/guillaumegd/legirag/commit/fbd213cf8a2e4b325eed74e483af320ebbe98d0d))
* separate paid and free-route quotas ([66126be](https://github.com/guillaumegd/legirag/commit/66126bec0a337464bd80a73d63e5693c0935353a))
* surface real error behind generic verification-failure abstention ([ea4048b](https://github.com/guillaumegd/legirag/commit/ea4048b45a35e84fac7676d0dad0444147e1057f))
* upgrade to Node 24 ([b3900e1](https://github.com/guillaumegd/legirag/commit/b3900e18b823175240c9f09cf4e299ee303078e1))


### Bug Fixes

* add mocked backend dev mode for packages/web ([4590863](https://github.com/guillaumegd/legirag/commit/45908633ca8e2308b4822e8a7677d1b9e2e067e8))
* align web UI/UX with Claude Design diagnostic ([280b0ab](https://github.com/guillaumegd/legirag/commit/280b0ab99f314faac60ecffabd737d05638fdb08)), closes [#70](https://github.com/guillaumegd/legirag/issues/70)
* give /historique its own /historique/:id route ([8f77c87](https://github.com/guillaumegd/legirag/commit/8f77c8769da550d9da6f10cf16ad05c70ea811ef))
* give the header a real identity and fix the confidence badge color bug ([6ad873d](https://github.com/guillaumegd/legirag/commit/6ad873d1ff7b52a957b67d9e50fdbd80da514736))
* restore valid Bedrock credentials in prod ([5ba838c](https://github.com/guillaumegd/legirag/commit/5ba838c2d92ffe08c28447c1a17098d266a6efe1))
* show the same confidence banner in the history view as live ([1d15497](https://github.com/guillaumegd/legirag/commit/1d1549710757f7d25019cd7bec444ce1a2b6123e)), closes [#73](https://github.com/guillaumegd/legirag/issues/73)
* stop trace panel flash and add its missing stats card grid ([923df03](https://github.com/guillaumegd/legirag/commit/923df034d5cc92104d0bb6ef7049de1f16089757)), closes [#72](https://github.com/guillaumegd/legirag/issues/72)
* stop trace panel from anchoring to the wrong containing block ([6a2643e](https://github.com/guillaumegd/legirag/commit/6a2643ecf12ea4cb602f75c15cc60078dd192666)), closes [#71](https://github.com/guillaumegd/legirag/issues/71)

## [0.2.0](https://github.com/guillaumegd/legirag/compare/legirag-v0.1.0...legirag-v0.2.0) (2026-08-19)


### Features

* access-control policies (RLS) (4c) ([80baa5d](https://github.com/guillaumegd/legirag/commit/80baa5d6bd0d409d4ccce81b720ea08efd9b2a30))
* add prototype mockups for question/answer, time-travel, and trace screens ([ea3dba4](https://github.com/guillaumegd/legirag/commit/ea3dba4859be61094177ea1347dbe57757f4b137))
* agent quality evaluation (item 9, 9a-9c) ([3137ac8](https://github.com/guillaumegd/legirag/commit/3137ac863bb2a7cb87afe55803fa0b2c6d01b9ae))
* chunks table, embeddings, and indexes (4b) ([127e56c](https://github.com/guillaumegd/legirag/commit/127e56cdd90b2252f7ba4587b5129231d14c8662))
* **ci:** add commitlint enforcement via husky and a PR check (21b) ([0c82c1d](https://github.com/guillaumegd/legirag/commit/0c82c1d4814a7ac191fa25468f90052a3cf06e39))
* **ci:** add release-please workflow and config (21a) ([5a27e8a](https://github.com/guillaumegd/legirag/commit/5a27e8a9af820c86d14324faa5b0f9d37b173ba0))
* close out repo foundations and shared contracts (feature 1) ([6fac846](https://github.com/guillaumegd/legirag/commit/6fac8469b6e4d3b77ea9fc1a3f605373a8904702))
* COLD corpus acquisition and filtering (feature 2a) ([17bdacc](https://github.com/guillaumegd/legirag/commit/17bdacc54e20173b2323c2070da7f3c0b1cb29f3))
* containerization and end-to-end validation (11d) ([48789f8](https://github.com/guillaumegd/legirag/commit/48789f83505836ece447015e40fec5b0b1e4e0ce))
* contextual chunking (4a) ([3afb750](https://github.com/guillaumegd/legirag/commit/3afb7507688d39fea97c561182ee150a341bae26))
* contextual chunking measured in isolation (6b) ([0b10bf6](https://github.com/guillaumegd/legirag/commit/0b10bf602ffcfa213de13df579b48eebf826b703))
* cost caps, rate limiting, structured errors (11c) ([a0860a7](https://github.com/guillaumegd/legirag/commit/a0860a72aa50fd598c0abf512dfd41ed394aa39e))
* enhance project overview with detailed problem statement, user profiles, and core features ([3cfd731](https://github.com/guillaumegd/legirag/commit/3cfd7311d1e65c9128f3d40d695159348f65458f))
* evaluation question set and harness (5) ([6952462](https://github.com/guillaumegd/legirag/commit/69524629066b0fa775031bfa3a379fd1d59606b3))
* evaluation suite as a blocking CI regression check (12b) ([8bd9e4b](https://github.com/guillaumegd/legirag/commit/8bd9e4b67b6adab25c2fecb7e3269cd6620f0578))
* event-driven reindexing on text updates (12c) ([5df2e2b](https://github.com/guillaumegd/legirag/commit/5df2e2babf20cbb735a94b0b62a43e92c11ef9f8))
* expand project and build plans with detailed problem statement, user profiles, and core features ([0d908d9](https://github.com/guillaumegd/legirag/commit/0d908d929e0655112f15c54b3b65c59e189eba1b))
* front end and reliability case study (item 13, 13b-13d) ([6caa6e9](https://github.com/guillaumegd/legirag/commit/6caa6e9130db89aa0c23b84602ef6322c7d2aa8a))
* hierarchical path parser (feature 2b) ([bc18af4](https://github.com/guillaumegd/legirag/commit/bc18af4fa1d6394b7c08c28fd9124e95ceb0796f))
* hybrid Retriever implementation (4d) ([746c641](https://github.com/guillaumegd/legirag/commit/746c6418a36a8fae69745f0e5e053199db7333d6))
* hybrid search measured in isolation (6c) ([c8a5494](https://github.com/guillaumegd/legirag/commit/c8a5494c7a4ffc3562fd77b7460e63007359dac8))
* MCP server skeleton and chercher_droit tool (7a) ([2c5b8cf](https://github.com/guillaumegd/legirag/commit/2c5b8cf0bee90777343ed0ec22605d9aded6e39f))
* naive baseline retrieval measurement (6a) ([babac7b](https://github.com/guillaumegd/legirag/commit/babac7b36296a0da129ebae57dcfb5f3d9fe1ced))
* NestJS foundations and streamed question endpoint (11a) ([f9a996f](https://github.com/guillaumegd/legirag/commit/f9a996f815da4f29144b522ded423bfeeaf07a88))
* per-tool and per-model-call tracing (12a) ([f9bd2e5](https://github.com/guillaumegd/legirag/commit/f9bd2e5adef05070a0cf7aa273b0d66c2da43288))
* provision AWS Lambda stack for API and MCP server (12d) ([7b53488](https://github.com/guillaumegd/legirag/commit/7b53488bf0e5ffa0ad125e96a8d014ece76d5c85))
* question/answer screen (13a) ([23585f4](https://github.com/guillaumegd/legirag/commit/23585f43210d13985278e4792b965d7837f376dd))
* reasoning agent (item 8, 8a-8d) ([d4d4cc5](https://github.com/guillaumegd/legirag/commit/d4d4cc5943c1e4eca94b07aa795929f7168d04c0))
* renvoi extractor (3a) ([1ba13c5](https://github.com/guillaumegd/legirag/commit/1ba13c505a9c9c120872775c69993488e470c256))
* renvois table and load (3b) ([1103d70](https://github.com/guillaumegd/legirag/commit/1103d706334139b7c73b6c4da346d8d84417a084))
* router_question, calculer, demander_a_l_humain MCP tools (7c) ([7897a37](https://github.com/guillaumegd/legirag/commit/7897a373ca9f3b7a1173491220ab496d8f2f1a86))
* stub tools and MCP Inspector third-party verification (7d) ([aee0fa8](https://github.com/guillaumegd/legirag/commit/aee0fa8ff5fb5af22ec0488322b8567e9c84a0f5))
* subdivision extractor (2c) ([d7a14aa](https://github.com/guillaumegd/legirag/commit/d7a14aab1df5420d42b9cf214390e8d4d3a627c3))
* suivre_renvoi cross-reference-following tool (7b) ([aed0313](https://github.com/guillaumegd/legirag/commit/aed03131503ad305ccfb8f8a87c286a7e06a4cd2))
* Supabase schema and load (2d) ([fa6e69d](https://github.com/guillaumegd/legirag/commit/fa6e69d32f70388432c5030531687162513f2436))
* trace and article read endpoints (11b) ([87f59f1](https://github.com/guillaumegd/legirag/commit/87f59f10919f21c724e2002b8bbf71217a21b457))
* **web:** restyle front end from design handoff (item 15) ([5994e5a](https://github.com/guillaumegd/legirag/commit/5994e5ae3f1325f7401a1a2c4fa7b7a75da506c5))


### Bug Fixes

* build workspace packages before running eval regression check ([3b7d5ea](https://github.com/guillaumegd/legirag/commit/3b7d5eaff500b190bc26b2e77f166cdc176d710c))
* correct DSFR usage to DSFR-inspired for license compliance ([1052b66](https://github.com/guillaumegd/legirag/commit/1052b6640c001e7c1b8b73734e218e50a094847a))
* correct inaccurate .env.example comment and clean up em dashes ([16dada9](https://github.com/guillaumegd/legirag/commit/16dada94529df9e80ebd426fc4a02bf4d0f5229d))
* pass MODEL_EMBEDDING to eval regression check job ([b22ce23](https://github.com/guillaumegd/legirag/commit/b22ce23aa66f3e1b02c45cc7975e32bbd548a202))
* point private-doc references to their real docs/private path ([2f68eec](https://github.com/guillaumegd/legirag/commit/2f68eec472bcc65d67cdeb6766d2b1f6d8ccb3a8))
* repair audit findings from feature 6 (F-01, F-02) ([7e2c5ee](https://github.com/guillaumegd/legirag/commit/7e2c5ee3b6326c1e98ff5287de119215324fae61))
* secure API and MCP with shared token and persistent rate limiting ([af36851](https://github.com/guillaumegd/legirag/commit/af3685176c164849c1de5deb0436fcbe25e5f51c))
* simplify Terraform state, automate Lambda deploys, prove it live ([c5ad909](https://github.com/guillaumegd/legirag/commit/c5ad90950b612f8b18d3d72d9f7db7e21058e176))
* use tsc -b for typecheck to resolve workspace package types ([cdf7b5e](https://github.com/guillaumegd/legirag/commit/cdf7b5e51ed3ffd47024eef00b0df6612bd9d074))
* **web:** build @legirag/shared before next build on Vercel ([7c286b3](https://github.com/guillaumegd/legirag/commit/7c286b34149d84ea015643cd300ea68c5539c555))
