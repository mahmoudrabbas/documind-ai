import mongoose from "mongoose";

const uri = process.env.MONGODB_URI || "mongodb+srv://admin:admin123@documindai.jtcvgzt.mongodb.net/docsai?retryWrites=true&w=majority";
await mongoose.connect(uri);
const db = mongoose.connection;

const sampleChunkEmbedding = await db.collection("chunkembeddings").findOne({});
console.log("ChunkEmbedding fields:", Object.keys(sampleChunkEmbedding || {}));

const sampleDocChunk = await db.collection("documentchunks").findOne({});
console.log("DocumentChunk fields:", Object.keys(sampleDocChunk || {}));

await mongoose.disconnect();
process.exit(0);
