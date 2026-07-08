export type ErrorDetails = unknown;
export declare class AppError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly details: ErrorDetails;
    readonly isOperational: boolean;
    constructor(statusCode: number, code: string, message: string, details?: ErrorDetails, isOperational?: boolean);
}
//# sourceMappingURL=AppError.d.ts.map