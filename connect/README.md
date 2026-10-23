# Lattice Connect relay

> _Note: End-users should follow the instructions in the main folder's `README`. It also lists the environment variables._

### Layout

- `src/direct.ts`: the entrypoint. It loads `.env` and `.direct.env` and starts the workers.
- `src/services/useSigning.ts`: `POST /:deviceId` relays a request to the device.
- `src/clients/createSigner.ts`: the MQTT client that talks to the broker on the Lattice1.
- `src/core/`: the Express app, the HTTP server and the worker processes.
- `container/`: the Dockerfile and the build and start scripts.
- `test/smoke/`: the smoke test.

### Commands

```sh
$ npm ci                    # install dependencies from the lockfile
$ npm run start:direct      # run from source and restart on changes (tsx)
$ npm run build             # compile to dist/ (TypeScript 7)
$ npm run prod              # compile, then run dist/direct.js
$ npm audit --omit=dev      # check runtime dependencies for known vulnerabilities
```

### Smoke test

`test/smoke/smoke.sh <image>` runs an image against a local mosquitto broker and a fake Lattice1 agent. It checks the relay round trip, bad requests, broker restarts, refused credentials, and fast replies. Run `npm ci` first: the fake agent uses the `mqtt` package from `node_modules`. Set `SMOKE_SLOW=1` to also check the 120 s device timeout.

```sh
$ npm ci
$ ./container/dockerBuild.sh
$ ./test/smoke/smoke.sh lattice-connect-v2:latest
```

To scan an image for vulnerabilities:

```sh
$ docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
    aquasec/trivy:0.58.1 image --scanners vuln lattice-connect-v2:latest
```
