import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('full deployment verification detects a missing middle chunk outside the representative countries', async () => {
  let missing = true;
  let transientFailures = 1;
  const checked = [];
  const server = createServer((request, response) => {
    checked.push(request.url);
    if (request.url === '/data/app/zm/middle.json' && missing) {
      response.writeHead(404).end();
      return;
    }
    if (request.url === '/data/app/zm/middle.json' && transientFailures > 0) {
      transientFailures -= 1;
      response.writeHead(503).end();
      return;
    }
    const routes = {
      '/': 'NAMAE',
      '/data/manifest.json': JSON.stringify({
        schemaVersion: 4, dataVersion: 'test',
        countries: [{ code: 'ZM', enabled: true, supportsSurname: true }],
        appRankings: [{ country: 'ZM', type: 'surname',
          chunks: ['first', 'middle', 'last'].map(name => ({ path: `/data/app/zm/${name}.json` })),
          inputLookup: { directory: '/data/app-lookup/zm', buckets: ['00', '01'] },
        }],
      }),
      '/data/name-details/manifest.json': JSON.stringify({
        shards: { first: '/data/name-details/first.json', second: '/data/name-details/second.json' },
      }),
    };
    response.writeHead(200).end(routes[request.url] ?? '{}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  async function check(args) {
    const child = spawn(process.execPath, ['scripts/check-deployment.mjs', url, ...args], {
      env: { ...process.env, SITE_URL: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    const [code] = await once(child, 'close');
    return { code, output };
  }
  try {
    assert.equal((await check([])).code, 0);
    const failure = await check(['--all']);
    assert.notEqual(failure.code, 0);
    assert.match(failure.output, /HEAD \/data\/app\/zm\/middle\.json: 404/);
    missing = false;
    checked.length = 0;
    const success = await check(['--all']);
    assert.equal(success.code, 0, success.output);
    for (const file of ['/data/app/zm/middle.json', '/data/app-lookup/zm/01.json', '/data/name-details/second.json'])
      assert.ok(checked.includes(file), file);
    assert.equal(checked.filter(file => file === '/data/app/zm/middle.json').length, 2);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
