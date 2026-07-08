import { Router } from "express";
import { loginController, logoutController, refreshController, registerController, resendVerificationEmailController, verifyEmailController, } from "./auth.controller.js";
const router = Router();
router.post("/register", registerController);
router.post("/login", loginController);
router.post("/refresh", refreshController);
router.post("/logout", logoutController);
router.post("/verify-email", verifyEmailController);
router.post("/resend-verification-email", resendVerificationEmailController);
export default router;
//# sourceMappingURL=auth.routes.js.map