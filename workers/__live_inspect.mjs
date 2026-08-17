import IORedis from "ioredis";

const connection = new IORedis("redis://127.0.0.1:6379", { maxRetriesPerRequest: null });

const keys = await connection.keys("bull:documind-jobs:*");
const listStates = ["wait", "active"];
const zsetStates = ["completed", "failed", "delayed"];

for (const state of listStates) {
  const key = `bull:documind-jobs:${state}`;
  const type = await connection.type(key);
  const members = type === "list" ? await connection.lrange(key, 0, -1) : type === "set" ? await connection.smembers(key) : [];
  if (members.length) {
    console.log(`--- ${state} (${members.length}) ---`);
    for (const id of members) console.log(" ", id);
  }
}
for (const state of zsetStates) {
  const key = `bull:documind-jobs:${state}`;
  const type = await connection.type(key);
  const members = type === "zset" ? await connection.zrange(key, 0, -1) : [];
  if (members.length) {
    console.log(`--- ${state} (${members.length}) ---`);
    for (const id of members) console.log(" ", id);
  }
}

const docId = "6a766cbd47a29d0d77d3eb80";
console.log("\n--- jobs referencing docId in data ---");
let found = 0;
for (const key of keys) {
  const type = await connection.type(key);
  if (type !== "hash") continue;
  const id = key.replace("bull:documind-jobs:", "");
  if (/^[0-9a-f]{24}|^document\.|^ext-/.test(id) && key.includes(":") === false) continue;
  const data = await connection.hget(key, "data");
  if (data && data.includes(docId)) {
    found++;
    const name = await connection.hget(key, "name");
    const ts = await connection.hget(key, "timestamp");
    console.log(JSON.stringify({ jobId: id, name, ts, data: data.slice(0, 400) }));
  }
}
console.log("found:", found);

await connection.quit();
