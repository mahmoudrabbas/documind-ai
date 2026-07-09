import { Router } from "express";
import {
  loginController,
  logoutController,
  meController,
  refreshController,
  registerController,
  resendVerificationEmailController,
  verifyEmailController,
} from "./auth.controller.js";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";

const router = Router();

router.post("/register", registerController);
router.post("/login", loginController);
router.post("/refresh", refreshController);
router.post("/logout", logoutController);
router.post("/verify-email", verifyEmailController);
router.post("/resend-verification-email", resendVerificationEmailController);
router.get("/me", authenticate, meController);

export default router;
