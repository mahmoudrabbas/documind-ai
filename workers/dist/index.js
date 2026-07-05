/**
 * DocuMind AI — Workers entrypoint
 *
 * Background workers for document processing, embedding generation, and
 * queue consumption. This package is a workspace member of the docsai
 * monorepo (see root package.json `workspaces`).
 *
 * NOTE: This is a scaffold placeholder for T1.1.1 (Initialize monorepo
 * structure). Concrete worker implementations will be added in subsequent
 * tasks (e.g. document processing, retrieval indexing).
 */
const WORKER_NAME = "docsai-workers";
function main() {
    console.log(`[${WORKER_NAME}] starting...`);
    console.log(`[${WORKER_NAME}] no jobs registered yet — exiting cleanly.`);
}
main();
export {};
