import assert from "node:assert/strict";

function isTronAddress(value) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value.trim());
}

function isEvmAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

assert.equal(isEvmAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"), true);
assert.equal(isEvmAddress("TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"), false);
assert.equal(isTronAddress("TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"), true);
assert.equal(isTronAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"), false);
console.log("address checks ok");
