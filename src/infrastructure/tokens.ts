import * as jwt from 'jsonwebtoken';
import { Capability } from '../types/Capability';

export interface TokenPayload {
    iss: string;
    sub: string;
    // User capabilities - global permissions that operate on a higher level than individual filesystems:
    cap: Capability[];
};

export interface TokenGenerator {
    (payload: TokenPayload): string;
};

export interface TokenVerifier {
    (token: string): TokenPayload;
};

function isTokenPayload(verificationResult: string | object): verificationResult is TokenPayload {
    if (typeof verificationResult === 'string') {
        return false;
    }
    const resultAsMap = verificationResult as { [key: string]: string };
    return (typeof resultAsMap.iss === 'string' && typeof resultAsMap.sub === 'string');
}

export function getTokenGenerator({ secret, algorithm = 'HS256' }: { secret: string, algorithm?: jwt.Algorithm }): TokenGenerator {
    return function generateSignedToken(payload: TokenPayload): string {
        return jwt.sign(payload, secret, { algorithm: algorithm });
    };
};

export function getTokenVerifier({ secret, algorithm = 'HS256' }: { secret: string, algorithm?: jwt.Algorithm }): TokenVerifier {
    return function verifySignedToken(token: string): TokenPayload {
        const verificationResult = jwt.verify(token, secret, { algorithms: [ algorithm ] });
        if (isTokenPayload(verificationResult)) {
            return verificationResult;
        } else {
            throw new TypeError('Malformed token payload');
        }
    };
};
