import { Router } from "express";
import {
  registerController,
  resendVerificationEmailController,
  verifyEmailController,
} from "./auth.controller.js";

const router = Router();

router.post("/register", registerController);
router.post("/verify-email", verifyEmailController);
router.post("/resend-verification-email", resendVerificationEmailController);

export default router;
