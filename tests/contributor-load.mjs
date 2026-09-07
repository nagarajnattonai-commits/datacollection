import assert from 'node:assert/strict';

const base = process.env.APP_URL || 'http://localhost:3000';
const users = Math.min(
  1500,
  Math.max(1, Number(process.env.VIRTUAL_USERS || 500)),
);
const parallel = Math.min(
  200,
  Math.max(1, Number(process.env.PARALLEL || 100)),
);
const maximumP95 = Math.max(100, Number(process.env.MAX_P95_MS || 5000));

if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname))
  assert.equal(
    process.env.ALLOW_LOAD_TEST,
    'true',
    'Set ALLOW_LOAD_TEST=true only for an approved staging environment.',
  );

const samples = [];
let failures = 0;

async function exerciseContributor(index) {
  const third = Math.floor(index / 250);
  const fourth = (index % 250) + 1;
  const headers = {
    'cf-connecting-ip': `198.18.${third}.${fourth}`,
    'x-demo-role': 'contributor',
  };
  const started = performance.now();
  const [schema, recordings] = await Promise.all([
    fetch(`${base}/projects/main/schema`, { headers }),
    fetch(`${base}/contributors/me/recordings`, { headers }),
  ]);
  samples.push(performance.now() - started);
  if (!schema.ok || !recordings.ok) failures += 1;
  await Promise.all([schema.arrayBuffer(), recordings.arrayBuffer()]);
}

for (let start = 0; start < users; start += parallel)
  await Promise.all(
    Array.from({ length: Math.min(parallel, users - start) }, (_, offset) =>
      exerciseContributor(start + offset),
    ),
  );

samples.sort((left, right) => left - right);
const percentile = (fraction) =>
  samples[Math.min(samples.length - 1, Math.floor(samples.length * fraction))];
const p50 = Math.round(percentile(0.5));
const p95 = Math.round(percentile(0.95));
const maximum = Math.round(samples.at(-1));

assert.equal(
  failures,
  0,
  `${failures} virtual contributors received an error.`,
);
assert.ok(
  p95 <= maximumP95,
  `Contributor API p95 ${p95}ms exceeded ${maximumP95}ms.`,
);

console.log(
  `${users} concurrent contributor sessions passed: p50=${p50}ms, p95=${p95}ms, max=${maximum}ms. This read-path check does not replace a production R2 upload load test.`,
);
