import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { inviteUserController, listUsersController, updateUserController, deleteUserController, setPasswordFromInviteController, getInviteDetailsController, } from "./users.controller.js";
const router = Router();
router.get("/", authenticate, tenantScoping, requirePermission(Permission.USERS_READ), listUsersController);
router.patch("/:id", authenticate, tenantScoping, authorize("COMPANY_ADMIN"), updateUserController);
router.post("/", authenticate, tenantScoping, authorize("COMPANY_ADMIN"), inviteUserController);
router.delete("/:id", authenticate, tenantScoping, authorize("COMPANY_ADMIN"), deleteUserController);
router.post("/set-password-from-invite", setPasswordFromInviteController);
router.post("/validate-invite", getInviteDetailsController);
export default router;
//# sourceMappingURL=users.routes.js.map