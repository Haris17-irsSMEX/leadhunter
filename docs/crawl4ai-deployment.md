# Crawl4AI fallback deployment

Crawl4AI is an optional, separately hosted browser-rendering fallback. LeadHunter always tries its bounded direct public-web fetcher first. The fallback is disabled unless every `CRAWL4AI_*` setting is present and `CRAWL4AI_ENABLED=true`.

## Reviewed image and resources

- Pin `unclecode/crawl4ai:0.9.2`; do not deploy `latest`. This tag was verified against the signed official `v0.9.2` GitHub release and the upstream `docker-rebuild-v0.9.2` workflow on 2026-08-01.
- Version `0.9.2` is newer than the `0.8.7`-`0.8.9` Docker security releases and includes their RCE, SSRF, authentication, file-write, credential-exfiltration, and proxy-SSRF fixes. It also includes the secure-by-default Docker API changes introduced in `0.9.0`.
- Allocate at least 4 GB RAM and 1 GB shared memory initially.
- Run the container on a Docker-capable service outside Vercel Functions.
- Use private networking where available and require a strong bearer token.
- Do not expose the playground, unrestricted crawl endpoint, MCP endpoints, metrics, or control endpoints publicly.

Pull the verified fixed tag rather than the mutable `latest` tag:

```bash
docker pull unclecode/crawl4ai:0.9.2
docker run -d --name crawl4ai --shm-size=1g -p 127.0.0.1:11235:11235 unclecode/crawl4ai:0.9.2
```

The local-only port binding above is an example, not a complete production deployment. Before deployment, pull and scan the exact image digest in the target registry, record that digest, and use it instead of a mutable tag where the hosting platform supports digests. Review upstream release and security notes before every upgrade.

## Service contract

LeadHunter calls only:

- `GET /health`
- `POST /crawl`

The adapter supplies server-controlled browser and crawler settings. A browser client cannot supply JavaScript, hooks, cookies, proxies, screenshots, PDFs, arbitrary crawler configuration, or credentials. Each lead is limited to one browser session, five same-origin pages, a 45-second timeout, and a 1.5 MB response.

The service must return the documented Crawl4AI result shape containing final URL, Markdown/text, links, metadata, and success state. Validate this contract with one disposable public site in staging after every image upgrade. LeadHunter discards rendered text after normalized public fields and evidence are extracted; raw HTML, Markdown, screenshots, cookies, and provider payloads are not persisted.

## Network and authentication

1. Generate a long random service token in the hosting platform's secret manager.
2. Configure the Crawl4AI server to require authentication and restrict trusted hosts.
3. Put the service behind private networking or an authenticated gateway with TLS.
4. Set `CRAWL4AI_BASE_URL` and `CRAWL4AI_API_TOKEN` only in Vercel encrypted server environments.
5. Rotate the token by accepting a new token on the service, updating Vercel, validating `/api/health`, and then revoking the old token.
6. Never put the token in `NEXT_PUBLIC_*`, client code, logs, screenshots, or repository files.

LeadHunter revalidates every target through its existing DNS/SSRF boundary before sending it to the crawler, permits only HTTP(S), checks robots rules, and restricts results to the business website's host. LinkedIn, Google Maps pages, authenticated pages, private/internal IPs, form submission, downloads, screenshots, and PDFs are outside this integration.

## Health and staged enablement

1. Deploy the pinned service with authentication enabled.
2. Verify `/health` through the private/authenticated path.
3. Add the four `CRAWL4AI_*` variables to the Vercel Preview environment first.
4. Deploy Preview and confirm `/api/health` reports Crawl4AI as configured and healthy without revealing its URL.
5. Test direct-fetch success and confirm the crawler is not called.
6. Test one eligible JavaScript-heavy public business site and confirm fallback status and bounded workload counters.
7. Confirm raw rendered content does not appear in Supabase, logs, exports, or API responses.
8. Enable Production only after staging validation.

If the service becomes unhealthy, set `CRAWL4AI_ENABLED=false` and redeploy. Direct website research remains available and completed data is preserved.

## License and attribution

Crawl4AI is distributed under Apache License 2.0 with an upstream attribution requirement. LeadHunter includes the requested attribution in its README. Retain the upstream license and NOTICE/attribution materials with any redistributed image or derivative.

Official references:

- [Crawl4AI v0.9.2 signed release](https://github.com/unclecode/crawl4ai/releases/tag/v0.9.2)
- [Crawl4AI Docker release workflow](https://github.com/unclecode/crawl4ai/actions/workflows/docker-release.yml)
- [Crawl4AI self-hosting guide](https://docs.crawl4ai.com/core/self-hosting/)
- [Crawl4AI source and security guidance](https://github.com/unclecode/crawl4ai)
- [Crawl4AI license](https://github.com/unclecode/crawl4ai/blob/main/LICENSE)
