import { onRequestHookHandler } from "fastify";
import { getTokenVerifier } from "../infrastructure/tokens";
import { tokenSecret, tokenAlgorithm } from "../settings/tokenSettings";

const verifyToken = getTokenVerifier({ secret: tokenSecret, algorithm: tokenAlgorithm });

const userContextHook: onRequestHookHandler = function(request, response, next) {
    try {
        if (request.cookies.user) {
            const payload = verifyToken(request.cookies.user);
            request.userContext = {
                identification: {
                    issuer: payload.iss,
                    subject: payload.sub
                },
                canCreateFilesystems: (payload.cap || []).includes('create-fs')
            };
        }
    } catch (error) {
        request.log.warn({ err: error }, 'User token validation failed')
    } finally {
        next();
    }
};

export default userContextHook;
