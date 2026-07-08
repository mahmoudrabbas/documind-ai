import argon2 from "argon2";
const ARGON2_OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
};
export function hashPassword(password) {
    return argon2.hash(password, ARGON2_OPTIONS);
}
export async function verifyPassword(hash, password) {
    try {
        return await argon2.verify(hash, password);
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=passwordHashing.js.map