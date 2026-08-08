import mongoose from "mongoose";

const uri = process.env.MONGODB_URI || "mongodb+srv://admin:admin123@documindai.jtcvgzt.mongodb.net/docsai?retryWrites=true&w=majority";
await mongoose.connect(uri);
const db = mongoose.connection;

// 1. Find deleted documents
const deletedDocs = await db.collection("documents").find(
  { deletedAt: { $ne: null } },
  { projection: { _id: 1 } }
).toArray();
console.log("Deleted doc count:", deletedDocs.length);

// 2. Check stale chunks from deleted docs
const deletedIds = deletedDocs.map(d => d._id);
const staleChunkCount = await db.collection("documentchunks").countDocuments(
  { documentId: { $in: deletedIds } }
);
console.log("Stale chunks from deleted docs:", staleChunkCount);

// 3. Check active CV
const activeCVChunks = await db.collection("documentchunks").countDocuments(
  { documentId: new mongoose.Types.ObjectId("6a772a04906a5e6044383977") }
);
console.log("Active CV (6a772a04906a5e6044383977) chunks:", activeCVChunks);

// 4. Check last chat messages sources
const msgs = await db.collection("chatmessages").find(
  { role: "assistant" }
).sort({ createdAt: -1 }).limit(3).toArray();

for (const m of msgs) {
  console.log("\n--- Message at", m.createdAt, "---");
  if (m.sources && m.sources.length > 0) {
    for (const s of m.sources) {
      const docId = s.documentId || s.document;
      console.log("  src docId:", docId?.toString(), "title:", s.documentTitle || s.title);
      if (docId) {
        const doc = await db.collection("documents").findOne(
          { _id: new mongoose.Types.ObjectId(docId.toString()) },
          { projection: { deletedAt: 1, "metadata.title": 1 } }
        );
        console.log("    -> deleted:", doc?.deletedAt ? "YES" : "no", "title:", doc?.metadata?.title);
      }
    }
  } else {
    console.log("  (no sources)");
  }
}

await mongoose.disconnect();
process.exit(0);
