import { AppError } from "../../common/errors/AppError.js";
import { createPackage, getOverview, getPackage, getSetting, getSystemHealth, getUsage, listAudit, listJobs, listPackages, listPlatformUsers, listSubscriptions, updatePackage, updateSetting, updateSubscription, } from "./platform.service.js";
import { idSchema, listSchema, packageBodySchema, packageUpdateSchema, parse, settingsBodySchema, subscriptionUpdateSchema, tenantIdSchema, } from "./platform.validator.js";
const endpoint = (handler) => async (req, res, next) => {
    try {
        const data = await handler(req, res);
        if (!res.headersSent)
            res.status(200).json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
};
const actor = (req) => {
    if (!req.auth)
        throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    return req.auth;
};
export const overviewController = endpoint(() => getOverview());
export const packagesController = endpoint(() => listPackages());
export const packageController = endpoint((req) => getPackage(parse(idSchema, req.params).id));
export const createPackageController = endpoint(async (req, res) => {
    const value = await createPackage(parse(packageBodySchema, req.body), actor(req));
    res.status(201).json({ success: true, data: value });
});
export const updatePackageController = endpoint((req) => updatePackage(parse(idSchema, req.params).id, parse(packageUpdateSchema, req.body), actor(req)));
export const subscriptionsController = endpoint(() => listSubscriptions());
export const updateSubscriptionController = endpoint((req) => updateSubscription(parse(tenantIdSchema, req.params).tenantId, parse(subscriptionUpdateSchema, req.body), actor(req)));
export const platformUsersController = endpoint((req) => listPlatformUsers(parse(listSchema, req.query)));
export const usageController = endpoint(() => getUsage());
export const jobsController = endpoint((req) => listJobs(parse(listSchema, req.query)));
export const healthController = endpoint(() => getSystemHealth());
export const auditController = endpoint((req) => listAudit(parse(listSchema, req.query)));
export const aiConfigurationController = endpoint(() => getSetting("ai_configuration"));
export const updateAiConfigurationController = endpoint((req) => updateSetting("ai_configuration", parse(settingsBodySchema, req.body), actor(req)));
export const settingsController = endpoint(() => getSetting("global_settings"));
export const updateSettingsController = endpoint((req) => updateSetting("global_settings", parse(settingsBodySchema, req.body), actor(req)));
//# sourceMappingURL=platform.controller.js.map