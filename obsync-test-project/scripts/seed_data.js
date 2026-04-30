const fs = require("node:fs");
const path = require("node:path");

function buildSeedPayload() {
  return {
    generatedAt: new Date().toISOString(),
    metrics: [120, 95, 140, 110, 205, 175],
    todos: [
      { id: "T-2", done: false, priority: "high" },
      { id: "T-3", done: false, priority: "medium" },
      { id: "T-4", done: false, priority: "high" },
    ],
  };
}

function writeSeedFile() {
  const payload = buildSeedPayload();
  const target = path.join(__dirname, "..", "data", "seed.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(payload, null, 2));
  return target;
}

if (require.main === module) {
  const output = writeSeedFile();
  console.log(`seed_written=${output}`);
}
