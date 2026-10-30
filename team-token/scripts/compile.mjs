import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function findImports(path) {
  if (path.startsWith("@openzeppelin/")) {
    const resolved = require.resolve(path);
    return { contents: readFileSync(resolved, "utf8") };
  }
  return { error: "File not found" };
}

const source = readFileSync(join(root, "contracts/TeamToken.sol"), "utf8");

const input = {
  language: "Solidity",
  sources: {
    "TeamToken.sol": { content: source },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

if (output.errors?.length) {
  const fatal = output.errors.filter((e) => e.severity === "error");
  for (const e of output.errors) console.error(e.formattedMessage || e.message);
  if (fatal.length) process.exit(1);
}

const artifact = output.contracts["TeamToken.sol"].TeamToken;
const outDir = join(root, "src/lib");
mkdirSync(outDir, { recursive: true });

const payload = {
  contractName: "TeamToken",
  abi: artifact.abi,
  bytecode: `0x${artifact.evm.bytecode.object}`,
};

writeFileSync(join(outDir, "teamTokenArtifact.json"), JSON.stringify(payload, null, 2));
console.log("Wrote src/lib/teamTokenArtifact.json");
console.log("Bytecode length:", payload.bytecode.length);
