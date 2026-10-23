# Environment Parameters

> _Note: End-users should follow the instructions provided in the main folder's `README`._

### For Internal Use

 - ADMIN_CLIENT_HOST
 - ADMIN_CLIENT_PASS
 - ADMIN_CLIENT_USER
 - APP_SERVICE_PORT
 - APP_WORKER_COUNT
 - MQTT_HTTP_PORT
 - MQTT_SKIP_USER_CHECK

### Smoke test

`test/smoke/smoke.sh <image>` runs an image against a local mosquitto broker and a fake Lattice1 agent. It checks the relay round trip, bad requests, broker restarts, refused credentials, and fast replies. Run `npm install` first: the fake agent uses the `mqtt` package from `node_modules`. Set `SMOKE_SLOW=1` to also check the 120 s device timeout.

```sh
$ npm install
$ ./container/dockerBuild.sh
$ ./test/smoke/smoke.sh lattice-connect-v2:latest
```

The image runs `dist/direct.js`, the signing relay only. It does not serve `/provision`.
