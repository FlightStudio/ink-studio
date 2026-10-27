# Ink Studio v2

The editor for physical letters and postcards.

Open `guide.html` in a browser. It is the setup guide, including Postgres on your own machine, and it is updated as each plan step lands.

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

Node 22. pnpm 10.33.4. The database port is 5434, beside other local projects.

## Run an iPad session

The dev server listens on every interface, port 3000.

1. Set `DEV_LAN_HOST` to this computer's LAN address in the root `.env` and in `apps/web/.env.local`.
2. In `apps/web/.env.local`, set `NEXT_PUBLIC_PLATFORM_URL` to `http://<DEV_LAN_HOST>:3000` so the origin check passes.
3. From step 13, also set `STORAGE_EMULATOR_HOST` to `http://<DEV_LAN_HOST>:4443` so asset redirects reach the iPad.
4. Run `pnpm dev` and open `http://<DEV_LAN_HOST>:3000` on the iPad, on the same network.

## Run the web journeys

`pnpm test:e2e` drives the running dev server from a Playwright container, which reaches this computer as `localhost`. It is not part of `pnpm test`.

1. In `apps/web/.env.local`, set `NEXT_PUBLIC_PLATFORM_URL` to `http://localhost:3000` so saves from that browser pass the origin check.
2. Run `pnpm dev`, then `pnpm test:e2e`.
3. For a dev server on another port, start it with `NEXT_PUBLIC_PLATFORM_URL=http://localhost:<port>` and run `WEB_BASE_URL=http://localhost:<port> pnpm test:e2e`. `pnpm screens` reads `WEB_BASE_URL` too, and `SCREENS_DEV_USER` to take the screens as another seeded email.
