import { Redis } from "ioredis";
export declare function getRedisClient(): Redis;
export declare function connectRedis(): Promise<void>;
export declare function disconnectRedis(): Promise<void>;
export declare function isRedisConnected(): boolean;
//# sourceMappingURL=redis.d.ts.map