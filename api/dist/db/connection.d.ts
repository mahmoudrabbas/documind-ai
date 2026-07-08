export declare function calculateRetryDelay(attempt: number, baseDelayMs?: number, backoffFactor?: number, maxDelayMs?: number): number;
export declare function getMongoConnectionState(): string;
export declare function isMongoConnected(): boolean;
export declare function connectDB(): Promise<void>;
export declare function disconnectDB(): Promise<void>;
//# sourceMappingURL=connection.d.ts.map