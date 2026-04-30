# Changelog

## 1.0.0 (2026-04-30)


### Features

* do not try to use github advanced security ([ee41de9](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/ee41de93e05f5465517e1922817fde7b22538c1d))
* implement compliance scraper ([5f91ca7](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/5f91ca7ce1cb174bfe3195e991f20efc93d77862))
* implement unit and e2e tests using mock OIDC server ([7a970c5](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/7a970c5e7f95d72b5d2c104d7e4d5a2b13b205e1))
* implement zizmor ([5167fca](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/5167fcaeffc78df451ec79f9ef5ec5114241c94f))
* include basic services.json file ([7f6eaa7](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/7f6eaa7751450d900d0394975fa53c65aefac323))
* introduce CSP nonces and small changes to remove SQL vis ([297359c](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/297359cfef4c7ed2a1fff88fe28b5a42276ddb31))
* rename image to get round chrome hsts crap ([b28b2de](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/b28b2de9d6674bd3d6795d6b628ef8437a89bb71))
* revert change to db ssl ([79eeb54](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/79eeb54b091ed72d4322c5b1679f014261c02b5f))
* **security:** add CSP nonce for inline scripts ([5b40da8](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/5b40da884402e930c3ae1eb1aaeface7b587ea11))
* **security:** add CSP nonce for inline styles ([472e336](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/472e336e987e6cf55658e2bafa1ddd2724cd3b57))
* undo some of the more aggressive changes ([dc671bf](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/dc671bf878a3810d12deaa3ac649db2f8b149b37))
* use gitleaks license ([6db34c7](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/6db34c7166649110a28f6efbda1047afe8a2d4a2))
* wrangle e2e tests into shape ([22dc691](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/22dc691322efcd2a928a93fec5554d7393a5226e))
* wrangle playwright tests into shape ([507bd07](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/507bd07bdf46bef92474d218bbf4b3fb5fed3919))
* wrangle playwright tests into shape ([3376106](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/3376106ae023a7b7f097d5b970b12a4c001b748c))
* wrangle playwright tests into shape ([12df14b](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/12df14b904fe41d8b01c464f872b4f988781e1b5))


### Bug Fixes

* **auth:** add save callback after session regenerate ([d804c27](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/d804c270a9ac92932fcaeda91b2988b6a71ee22e))
* **auth:** change logout from GET to POST to prevent CSRF ([31aedb7](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/31aedb7b61f5b209d1664a3c247f24b7f228db55))
* **auth:** prevent open redirect via returnTo parameter ([5a1884b](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/5a1884bf0ce14fe32bf4addf43ec11fdf4ccdb6e))
* **auth:** regenerate session on login to prevent session fixation ([c2c98bd](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/c2c98bd22c95aff9bc69b15c85846ffa61b3b3ae))
* **auth:** store OIDC sub claim as stable user identifier ([1d070fd](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/1d070fdfde7f98f919e0ac92cd75bba1cb4c76d0))
* **config:** throw on missing or weak SESSION_SECRET in production ([f772d00](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/f772d00f25811492f5b8fd4000ebafe13e7dab8e))
* **db:** enable TLS certificate verification for database connections ([031fcdf](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/031fcdf6755f1f08bfd22d7bfc5fa98b70416d2b))
* **insights:** harden SQL validator with AST-based parsing ([d640464](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/d6404642df9c28f9630a5058e13244d4adb51f06))
* **insights:** replace raw error messages with generic user-facing text ([8e14bf7](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/8e14bf7b021d06f2a061e0ed0c5eba32141f1f25))
* **insights:** sanitise LLM HTML output to prevent self-XSS ([d9ee3b3](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/d9ee3b34a3e1e418dc8320ef41c01cba6873de35))
* **scraper:** use innerText to prevent indirect prompt injection ([4c2da84](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/4c2da844040dc3f6295f65f3a1131a70f9abbc3a))
* **server:** add CSRF protection via csrf-sync ([1a0c0c9](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/1a0c0c92c171fb4d552ea00b94a0e1943b6c9582))
* **server:** add rate limiting to Bedrock-spending endpoints ([d92079b](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/d92079b9cb4a2bd2973f35e175e6f85fcbe68915))
* **server:** add security headers via helmet ([d569322](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/d56932274fb42980fc84c9c1e3c7ac9d83839330))
* **services:** validate manual URL overrides to prevent SSRF ([26f36fb](https://github.com/co-cddo/octo-observability-compliance-scraper/commit/26f36fb049a8ef0d82bcbe0856c46aa61b5ffa5e))
