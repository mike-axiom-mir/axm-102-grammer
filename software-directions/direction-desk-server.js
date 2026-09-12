'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const directions = require('./direction-stack.js');
const gaps = require('./direction-gap-detector.js');
const registry = require('./direction-registry.js');

const LOOPBACK_HOST = '127.0.0.1';
const DEFAULT_PORT = 8176;
const MAX_BODY_BYTES = 64 * 1024;
const HTML_PATH = path.join(__dirname, 'direction-desk.html');

function authorityFloor() {
  return {
    automaticSelection: false,
    workspaceRead: false,
    workspaceMutation: false,
    toolExecution: false,
    network: false,
    install: false,
    promotion: false,
    canon: false
  };
}

function descriptor() {
  return {
    schema: 'axm.code.software-direction-desk.v1',
    version: '1.0.0',
    status: 'TEST',
    result: 'DESK_READY_NO_AUTHORITY',
    profileCount: registry.all().length,
    profiles: registry.all().map(profile => ({
      id: profile.id,
      displayName: profile.displayName,
      family: profile.family,
      description: profile.description
    })),
    axes: registry.axes().axes,
    truth: {
      suggestionIsSelection: false,
      callerEvidenceIsVerification: false,
      displayIsAuthority: false,
      missingEvidenceMeansImpossible: false
    },
    authority: authorityFloor()
  };
}

function suggestion(goal) {
  if (typeof goal !== 'string' || !goal.trim()) {
    return directions.suggest({goals: []});
  }
  return directions.suggest({goals: [goal.trim()]}, {topN: 8});
}

function inspection(input = {}) {
  const stackInput = {
    directionIds: Array.isArray(input.directionIds) ? input.directionIds : []
  };
  for (const axis of directions.INPUT_AXES) {
    stackInput[axis] = Array.isArray(input[axis]) ? input[axis] : [];
  }
  const stack = directions.compose(stackInput);
  let gapReport = null;
  if (stack.result === 'DIRECTION_STACK_READY_NO_AUTHORITY') {
    gapReport = gaps.evaluate({
      stack,
      languageId: typeof input.languageId === 'string' && input.languageId.trim() ? input.languageId.trim() : null,
      observed: {
        capabilities: Array.isArray(input.observedCapabilities) ? input.observedCapabilities : [],
        verifiers: Array.isArray(input.observedVerifiers) ? input.observedVerifiers : []
      }
    });
  }
  return {
    schema: 'axm.code.software-direction-desk-inspection.v1',
    status: 'TEST',
    result: stack.result === 'DIRECTION_STACK_READY_NO_AUTHORITY' ? 'INSPECTION_READY_NO_AUTHORITY' : 'INSPECTION_HELD',
    stack,
    gapReport,
    truth: {
      selectedDirectionsAreCallerChosen: true,
      observedEvidenceIsCallerSupplied: true,
      inspectionMutatesWorkspace: false,
      inspectionSelectsDirection: false
    },
    authority: authorityFloor()
  };
}

function jsonResponse(res, statusCode, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': bytes.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(bytes);
}

function htmlResponse(res) {
  const bytes = fs.readFileSync(HTML_PATH);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': bytes.length,
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(bytes);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('REQUEST_TOO_LARGE'), {statusCode: 413}));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(Object.assign(new Error('INVALID_JSON'), {statusCode: 400}));
      }
    });
    req.on('error', reject);
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${LOOPBACK_HOST}`);
      if (req.method === 'GET' && url.pathname === '/') return htmlResponse(res);
      if (req.method === 'GET' && url.pathname === '/api/desk') return jsonResponse(res, 200, descriptor());
      if (req.method === 'POST' && url.pathname === '/api/suggest') {
        const body = await readJson(req);
        return jsonResponse(res, 200, suggestion(body.goal));
      }
      if (req.method === 'POST' && url.pathname === '/api/inspect') {
        const body = await readJson(req);
        return jsonResponse(res, 200, inspection(body));
      }
      return jsonResponse(res, 404, {result: 'NOT_FOUND'});
    } catch (error) {
      if (res.headersSent) return;
      return jsonResponse(res, error.statusCode || 500, {
        result: 'HELD',
        errorCode: error.message || 'DIRECTION_DESK_ERROR'
      });
    }
  });
}

function start({port = Number(process.env.AXM_DIRECTION_DESK_PORT) || DEFAULT_PORT} = {}) {
  const server = createServer();
  server.listen(port, LOOPBACK_HOST, () => {
    const address = server.address();
    process.stdout.write(`AXM Software Direction Desk: http://${LOOPBACK_HOST}:${address.port}\n`);
  });
  return server;
}

if (require.main === module) start();

module.exports = {LOOPBACK_HOST, DEFAULT_PORT, MAX_BODY_BYTES, authorityFloor, descriptor, suggestion, inspection, createServer, start};
