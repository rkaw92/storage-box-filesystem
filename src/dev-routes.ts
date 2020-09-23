import { FastifyInstance } from "fastify";
import { getTokenGenerator, getTokenVerifier } from "./infrastructure/tokens";
import { Capability, isCapability } from "./types/Capability";

const tokenSecret = 'Upshot2imply3Top';
const tokenAlgorithm = 'HS256';

interface TokenQuery {
    Querystring: {
        iss: string;
        sub: string;
        cap?: string;
    }
}



export default function getRouteInstaller() {
    return async function installRoutes(app: FastifyInstance) {
        const generateToken = getTokenGenerator({ secret: tokenSecret, algorithm: tokenAlgorithm });
        app.get<TokenQuery>('/forge-token', {
            schema: {
                querystring: {
                    type: 'object',
                    properties: {
                        iss: { type: 'string' },
                        sub: { type: 'string' },
                        cap: { type: 'string' }
                    },
                    required: [ 'iss', 'sub' ]
                },
                
            }
        }, async function(request, response) {
            const capabilities: Capability[] = (request.query.cap ? request.query.cap.split(',') : []).filter(isCapability);
            const authTokenPayload = {
                iss: request.query.iss,
                sub: request.query.sub,
                cap: capabilities
            };
            const authToken = generateToken(authTokenPayload);
            response.setCookie('user', authToken, {
                httpOnly: true,
                path: '/'
            });
            response.status(200);
            return { ok: true };
        });
    
        app.get('/verify-token', async function(request, response) {
            if (request.userContext) {
                return request.userContext;
            } else {
                response.status(403);
                return { authenticated: false };
            }
        });
    };
};
