const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const config = path.resolve("next.config.js");

const cases = [
  ["Local default", {}, true, "http://127.0.0.1:4000"],
  ["Missing cloud origin", {
    WFM_CLOUD_DEPLOYMENT: "true"
  }, false],
  ["HTTP origin", {
    WFM_CLOUD_DEPLOYMENT: "true",
    WFM_API_ORIGIN: "http://example.com"
  }, false],
  ["Localhost origin", {
    WFM_CLOUD_DEPLOYMENT: "true",
    WFM_API_ORIGIN: "https://localhost"
  }, false],
  ["Credentials in origin", {
    WFM_CLOUD_DEPLOYMENT: "true",
    WFM_API_ORIGIN: "https://user:pass@example.com"
  }, false],
  ["Origin with path", {
    WFM_CLOUD_DEPLOYMENT: "true",
    WFM_API_ORIGIN: "https://example.com/api"
  }, false],
  ["Valid HTTPS origin", {
    WFM_CLOUD_DEPLOYMENT: "true",
    WFM_API_ORIGIN: "https://api.example.com"
  }, true, "https://api.example.com"]
];

let passed = 0;

for (const [name, variables, expectedSuccess, origin] of cases) {
  const env = { ...process.env };

  delete env.WFM_CLOUD_DEPLOYMENT;
  delete env.WFM_API_ORIGIN;

  Object.assign(env, variables);

  const script = `
    const config = require(${JSON.stringify(config)});
    config.rewrites().then(r => {
      console.log(r[0].destination);
    }).catch(e => {
      console.error(e.message);
      process.exit(1);
    });
  `;

  const result = spawnSync(process.execPath, ["-e", script], {
    env,
    encoding: "utf8"
  });

  const success = result.status === 0;

  assert.equal(
    success,
    expectedSuccess,
    `${name}: unexpected result\n${result.stderr}`
  );

  if (origin) {
    assert.ok(
      result.stdout.includes(`${origin}/api/v1/:path*`),
      `${name}: incorrect API rewrite`
    );
  }

  console.log(`PASS: ${name}`);
  passed++;
}

console.log(`CF-03A security validation: ${passed}/${cases.length} PASS`);
