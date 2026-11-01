"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { parseClientHello, capture } = require("../src/core/transport-fingerprint");

test("parseClientHello reads ciphers and extension order from raw bytes", async () => {
  const fp = await capture();
  assert.ok(fp.ciphers.length > 0, "expected at least one cipher");
  assert.ok(fp.extensions.length > 0, "expected at least one extension");
  for (const c of fp.ciphers) assert.match(c, /^[0-9a-f]{4}$/);
  for (const e of fp.extensions) assert.match(e, /^[0-9a-f]{4}$/);
  assert.equal(fp.legacyVersion, "0x303", "TLS 1.2 legacy version in ClientHello");
});

test("parseClientHello rejects non-TLS and truncated input", () => {
  assert.throws(() => parseClientHello(Buffer.from("GET / HTTP/1.1\r\n\r\n")), /not a TLS handshake/);
  assert.throws(() => parseClientHello(Buffer.from([0x16, 0x03, 0x01, 0x00, 0x05])), /not a TLS handshake/);
  const truncated = Buffer.alloc(44);
  truncated[0] = 0x16;
  truncated[5] = 0x01;
  truncated[43] = 32;
  assert.throws(() => parseClientHello(truncated), /truncated ClientHello/);
});

test("the supported runtime's fingerprint matches the recorded baseline", async () => {
  const fs = require("fs");
  const path = require("path");
  const candidateBases = [
    path.join(__dirname, "..", "src", "core", "transport-baseline.json"),
    path.join(__dirname, "..", "transport-baseline.json"),
  ];
  const baselinePath = candidateBases.find((p) => fs.existsSync(p));
  assert.ok(baselinePath, "transport-baseline.json must exist in src/core/");
  const base = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const fp = await capture();
  if (process.versions.bun) {
    assert.deepEqual(fp.ciphers, base.ciphers, "Bun's cipher list drifted from the baseline");
    assert.deepEqual(fp.extensions, base.extensions, "Bun's extension order drifted from the baseline");
  } else {
    assert.notDeepEqual(
      fp.ciphers,
      base.ciphers,
      "Node is expected to differ from the Bun baseline; if this passes, re-measure the gate"
    );
  }
});
