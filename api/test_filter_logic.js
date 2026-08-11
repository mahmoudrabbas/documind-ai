import mongoose from "mongoose";

const uri = process.env.MONGODB_URI || "mongodb+srv://admin:admin123@documindai.jtcvgzt.mongodb.net/docsai?retryWrites=true&w=majority";
await mongoose.connect(uri);
const db = mongoose.connection;

// Test active document check
const docIds = [
  new mongoose.Types.ObjectId("6a74c9ddb0b434e68e3b0334"), // mycv (DELETED)
  new mongoose.Types.ObjectId("6a766d87321639bf4b62ef92"), // abdo (DELETED)
  new mongoose.Types.ObjectId("6a772a04906a5e6044383977"), // cvv (ACTIVE)
];

const activeDocs = await db.collection("documents").find({
  _id: { $in: docIds },
  deletedAt: null,
}, { projection: { _id: 1, "metadata.title": 1, fileName: 1 } }).toArray();

console.log("Active docs found:", activeDocs.map(d => ({ id: d._id.toString(), title: d.metadata?.title || d.fileName })));

await mongoose.disconnect();
process.exit(0);
