---
title: Jackett
description: Use TRAWL as a FlareSolverr drop-in with Jackett.
---

# Jackett

Jackett reads its FlareSolverr URL from `ServerConfig.json`. TRAWL is a drop-in replacement.

## Setup via UI

1. Open the Jackett web UI → **Dashboard**
2. Click the **≡** menu → **Settings**
3. Find the **FlareSolverr API URL** field
4. Enter:
   ```
   http://localhost:8191
   ```
5. Click **Apply server settings**

## Setup via config file

Edit `~/.config/Jackett/ServerConfig.json` (or wherever your Jackett data directory is):

```json
{
  "FlareSolverrUrl": "http://localhost:8191",
  ...
}
```

Restart Jackett after editing the file.

## Verify

Navigate to a protected indexer in Jackett and click **Test**. A first request that encounters a
recognized wall triggers the browser challenge flow. Subsequent tests can reuse the cached session
while it remains valid.

## Docker

```yaml
services:
  jackett:
    image: lscr.io/linuxserver/jackett:latest
    environment:
      - FLARESOLVERR_URL=http://trawl:8191
```

## Notes

Jackett does not verify the `version` field in the FlareSolverr response the same way Prowlarr does. Either way, TRAWL returns `"2.0.0"` which is correct.
