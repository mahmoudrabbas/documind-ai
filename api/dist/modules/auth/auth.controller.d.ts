import type { NextFunction, Request, Response } from "express";
export declare function registerController(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function verifyEmailController(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function resendVerificationEmailController(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function loginController(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function refreshController(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function logoutController(_req: Request, res: Response): void;
//# sourceMappingURL=auth.controller.d.ts.map