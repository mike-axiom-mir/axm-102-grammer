# Local Backend Safety Boundary

The local backend is intentionally useful without silently becoming an authority surface.

Default constraints:

- binds HTTP to `127.0.0.1`, not the LAN;
- CORS is off unless `--cors` is supplied;
- accepts source bytes in the request rather than opening arbitrary paths;
- does not write source files;
- does not install packages;
- does not download parser/tool artifacts;
- does not call AI services;
- does not require internet access;
- adapter packs are loaded only from an explicitly selected local path.

Exposing the HTTP server on `0.0.0.0` or enabling CORS is an explicit deployment choice and should be treated as widening the trust boundary.
