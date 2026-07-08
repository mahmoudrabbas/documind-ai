type JwtPayload = Record<string, unknown> & {
    exp?: number;
    iat?: number;
};
export declare function durationToMilliseconds(value: string): number;
export declare function signJwt(payload: JwtPayload, secret: string, expiresIn: string): string;
export declare function verifyJwt<T extends JwtPayload>(token: string, secret: string): T;
export {};
//# sourceMappingURL=jwtTokens.d.ts.map