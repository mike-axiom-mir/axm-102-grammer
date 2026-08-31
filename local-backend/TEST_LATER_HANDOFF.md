# Handoff for later working-chat/local testing

A future tester does not need the design conversation.

1. Check out this PR branch.
2. Run `node local-backend/selftest-portable.js`.
3. Run `echo '{"op":"health"}' | node local-backend/cli.js`.
4. Run the CLI or server with `--adapter-pack ./local-backend/adapters/strict-portable-pack.js`.
5. Submit valid and malformed JSON through `analyze`; valid input should produce syntax/structure evidence while malformed input must produce parse-error evidence rather than PASS.
6. Try Unicode input such as `€` or emoji and confirm reported ranges are UTF-8 byte ranges.
7. For newly added language adapters, confirm the capability passport only rises when deterministic offline parser/structure/semantic/renderer/verifier adapters are genuinely bound and their bounded tests execute successfully.

Do not treat adapter names, installed executables, or test source existing in the repo as runtime proof.
