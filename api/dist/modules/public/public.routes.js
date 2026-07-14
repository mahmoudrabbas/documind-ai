import { Router } from "express";
import { activePackagesController } from "./public.controller.js";
const router = Router();
router.get("/packages", activePackagesController);
export default router;
//# sourceMappingURL=public.routes.js.map