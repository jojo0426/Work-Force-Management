const assert = require("node:assert/strict");

const cloudMode = process.env.WFM_CLOUD_DEPLOYMENT === "true";
const configuredOrigin = process.env.WFM_API_ORIGIN;

function getApiOrigin() {
  if (!cloudMode) {
    return "http://127.0.0.1:4000";
  }

  if (!configuredOrigin) {
    throw new Error(
      "WFM_API_ORIGIN is required in cloud deployment mode"
    );
  }

  let url;

  try {
    url = new URL(configuredOrigin);
  } catch {
    throw new Error("WFM_API_ORIGIN must be a valid HTTPS origin");
  }

  assert.equal(url.protocol, "https:");
  assert.equal(url.username, "");
  assert.equal(url.password, "");
  assert.equal(url.pathname, "/");
  assert.equal(url.search, "");
  assert.equal(url.hash, "");

  if (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1" ||
    url.hostname === "[::1]"
  ) {
    throw new Error("Loopback API origins are prohibited in cloud mode");
  }

  return url.origin;
}

const apiOrigin = getApiOrigin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
