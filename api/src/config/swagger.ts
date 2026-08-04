import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import swaggerJsdoc from "swagger-jsdoc";

const apiRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const sourceRoutes = path.join(apiRoot, "src", "modules", "**", "*.routes.ts");
const compiledRoutes = path.join(apiRoot, "dist", "modules", "**", "*.routes.js");

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "DocuMind AI API",
      version: "1.0.0",
      description:
        "Multi-tenant AI knowledge assistant API with RAG, agents, and document intelligence",
    },
    servers: [{ url: "/api/v1" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [
    ...(existsSync(path.join(apiRoot, "src")) ? [sourceRoutes] : []),
    ...(existsSync(path.join(apiRoot, "dist")) ? [compiledRoutes] : []),
  ],
});
