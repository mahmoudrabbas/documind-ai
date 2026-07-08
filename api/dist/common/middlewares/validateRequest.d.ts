import type { RequestHandler } from "express";
export interface ValidationSchema {
    body?: (req: {
        body?: unknown;
    }) => Array<{
        field: string;
        issue: string;
    }>;
    query?: (req: {
        query?: unknown;
    }) => Array<{
        field: string;
        issue: string;
    }>;
    params?: (req: {
        params?: unknown;
    }) => Array<{
        field: string;
        issue: string;
    }>;
}
export interface ValidateRequestOptions {
    errorCode?: string;
}
export declare function validateRequest(schema: ValidationSchema, options?: ValidateRequestOptions): RequestHandler;
//# sourceMappingURL=validateRequest.d.ts.map