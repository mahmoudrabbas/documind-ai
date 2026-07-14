import { listActivePackages } from "./public.service.js";
export async function activePackagesController(_req, res, next) {
    try {
        const packages = await listActivePackages();
        res.status(200).json({ success: true, data: packages });
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=public.controller.js.map