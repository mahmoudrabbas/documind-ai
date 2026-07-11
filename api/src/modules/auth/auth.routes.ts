import { Router } from "express";
import {
  loginController,
  superAdminLoginController,
  logoutController,
  meController,
  refreshController,
  registerController,
  resendVerificationEmailController,
  verifyEmailController,
  forgotPasswordController,
  resetPasswordController,
} from "./auth.controller.js";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { authRateLimiter } from "../../common/middlewares/rateLimit.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";

const router = Router();

router.use(authRateLimiter());

router.post("/register", registerController);
router.post("/login", loginController);
router.post("/super-admin/login", superAdminLoginController);
router.post("/refresh", refreshController);
router.post("/logout", logoutController);
router.post("/verify-email", verifyEmailController);
router.post("/resend-verification-email", resendVerificationEmailController);
router.post("/forgot-password", forgotPasswordController);
router.post("/reset-password", resetPasswordController);
router.get("/me", authenticate, tenantScoping, meController);

export default router;
