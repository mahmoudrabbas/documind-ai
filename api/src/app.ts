import express from "express";
import { AppError } from "./common/errors/AppError.js";
import { BAD_REQUEST } from "./common/errors/errorCodes.js";
import { errorHandlerMiddleware } from "./common/middlewares/errorHandler.middleware.js";
import { notFoundMiddleware } from "./common/middlewares/notFound.middleware.js";
import { validateRequest } from "./common/middlewares/validateRequest.js";

const app = express();

app.use(express.json());

app.get("/", (_, res) => {
  res.json({ message: "API is running :)" });
});

if (process.env.NODE_ENV !== "production") {
  app.get("/boom", () => {
    throw new AppError(400, BAD_REQUEST, "Bad request", {
      field: "email",
      issue: "invalid format",
    });
  });

  app.post(
    "/signup",
    validateRequest(
      {
        body: (req) => {
          const errors: Array<{ field: string; issue: string }> = [];

          const body = req.body as Record<string, unknown>;
          if (typeof body?.email !== "string" || !body.email.includes("@")) {
            errors.push({ field: "email", issue: "invalid format" });
          }

          return errors;
        },
      },
      { errorCode: "AUTH_SIGNUP_VALIDATION_ERROR" }
    ),
    (_req, res) => {
      res.status(201).json({ ok: true });
    }
  );
}

app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

export default app;
