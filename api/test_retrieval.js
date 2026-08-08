import mongoose from "mongoose";

const uri = process.env.MONGODB_URI || "mongodb+srv://admin:admin123@documindai.jtcvgzt.mongodb.net/docsai?retryWrites=true&w=majority";
await mongoose.connect(uri);
const db = mongoose.connection;

// Check deleted documents
const deletedDocs = await db.collection("documents").find(
  { deletedAt: { $ne: null } },
  { projection: { _id: 1, "metadata.title": 1, fileName: 1 } }
).toArray();

console.log("=== DELETED DOCUMENTS IN DB ===");
for (const doc of deletedDocs) {
  console.log(`- ID: ${doc._id}, Title: ${doc.metadata?.title || doc.fileName}`);
}

// Check active documents
const activeDocs = await db.collection("documents").find(
  { deletedAt: null },
  { projection: { _id: 1, "metadata.title": 1, fileName: 1 } }
).toArray();

console.log("\n=== ACTIVE DOCUMENTS IN DB ===");
for (const doc of activeDocs) {
  console.log(`- ID: ${doc._id}, Title: ${doc.metadata?.title || doc.fileName}`);
}

await mongoose.disconnect();
process.exit(0);
