const { MongoClient } = require("mongodb");

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const databaseInfo = await client.db().admin().listDatabases();
  const results = [];

  for (const entry of databaseInfo.databases) {
    const db = client.db(entry.name);
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const collectionNames = new Set(collections.map((collection) => collection.name));
    const result = { database: entry.name };
    for (const collectionName of ["users", "tenants", "documents", "auditlogs"]) {
      if (collectionNames.has(collectionName)) {
        result[collectionName] = await db.collection(collectionName).countDocuments();
      }
    }
    if (Object.keys(result).length > 1) results.push(result);
  }

  const live = client.db("docsai");
  const users = await live.collection("users")
    .find({}, { projection: { email: 1, role: 1, status: 1, tenantId: 1, createdAt: 1, updatedAt: 1, deletedAt: 1 } })
    .sort({ createdAt: 1 })
    .toArray();
  const recentUserAudits = await live.collection("auditlogs")
    .find(
      { $or: [
        { action: /USER|EMPLOYEE|MEMBER/i },
        { resourceType: /USER|EMPLOYEE|MEMBER/i },
      ] },
      { projection: { action: 1, resourceType: 1, resourceId: 1, actorId: 1, tenantId: 1, createdAt: 1, metadata: 1 } },
    )
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();

  console.log(JSON.stringify({ databases: results, liveUsers: users, recentUserAudits }, null, 2));
  await client.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
