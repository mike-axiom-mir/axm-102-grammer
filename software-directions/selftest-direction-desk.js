'use strict';

const assert = require('assert');
const http = require('http');
const desk = require('./direction-desk-server.js');

function request({port, method='GET', path='/', body=null}) {
  return new Promise((resolve, reject) => {
    const bytes = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({host: desk.LOOPBACK_HOST, port, method, path, headers: bytes ? {'content-type':'application/json','content-length':bytes.length} : {}}, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({statusCode: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8')}));
    });
    req.on('error', reject);
    if (bytes) req.write(bytes);
    req.end();
  });
}

(async () => {
  let checks = 0;
  const meta = desk.descriptor();
  assert.equal(meta.result, 'DESK_READY_NO_AUTHORITY'); checks++;
  assert.equal(meta.profileCount, 29); checks++;
  assert.equal(meta.authority.automaticSelection, false); checks++;
  assert.equal(meta.authority.workspaceMutation, false); checks++;

  const suggest = desk.suggestion('Build a multiplayer RTS game with world simulation and deterministic replay.');
  assert.equal(suggest.automaticSelection, false); checks++;
  assert.ok(suggest.candidates.length > 0); checks++;
  assert.ok(suggest.candidates.every(candidate => candidate.candidateIsSelection === false)); checks++;

  const first = desk.inspection({directionIds:['collaboration-multiplayer','game']});
  const second = desk.inspection({directionIds:['game','collaboration-multiplayer']});
  assert.equal(first.result, 'INSPECTION_READY_NO_AUTHORITY'); checks++;
  assert.equal(first.stack.stackSha256, second.stack.stackSha256); checks++;
  assert.deepEqual(first.stack.directionIds, second.stack.directionIds); checks++;
  assert.ok(first.gapReport.missingCapabilities.length > 0); checks++;
  assert.equal(first.truth.inspectionSelectsDirection, false); checks++;

  const oneCapability = first.stack.expectations.capabilities[0]?.id;
  const oneVerifier = first.stack.expectations.verifiers[0]?.id;
  const withEvidence = desk.inspection({directionIds:['game','collaboration-multiplayer'], observedCapabilities:oneCapability?[oneCapability]:[], observedVerifiers:oneVerifier?[oneVerifier]:[]});
  assert.ok(withEvidence.gapReport.coverage.evidencedCapabilityCount >= (oneCapability ? 1 : 0)); checks++;
  assert.ok(withEvidence.gapReport.coverage.evidencedVerifierCount >= (oneVerifier ? 1 : 0)); checks++;
  assert.equal(withEvidence.gapReport.truth.callerEvidenceOnly, true); checks++;

  const server = desk.createServer();
  await new Promise(resolve => server.listen(0, desk.LOOPBACK_HOST, resolve));
  const port = server.address().port;
  try {
    const page = await request({port});
    assert.equal(page.statusCode, 200); checks++;
    assert.match(page.text, /DISPLAY ≠ AUTHORITY/); checks++;
    assert.match(page.headers['content-security-policy'], /connect-src 'self'/); checks++;

    const liveSuggest = await request({port, method:'POST', path:'/api/suggest', body:{goal:'browser multiplayer game'}});
    assert.equal(liveSuggest.statusCode, 200); checks++;
    assert.equal(JSON.parse(liveSuggest.text).automaticSelection, false); checks++;

    const liveInspect = await request({port, method:'POST', path:'/api/inspect', body:{directionIds:['game']}});
    assert.equal(liveInspect.statusCode, 200); checks++;
    assert.equal(JSON.parse(liveInspect.text).result, 'INSPECTION_READY_NO_AUTHORITY'); checks++;
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  process.stdout.write(`Software Direction Desk selftest: ${checks}/${checks} PASS\n`);
})().catch(error => { console.error(error); process.exitCode = 1; });
