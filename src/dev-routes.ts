import { FastifyInstance } from "fastify";
import { getTokenGenerator, getTokenVerifier } from "./infrastructure/authTokens";
import { Capability, isCapability } from "./types/Capability";
import { tokenSecret, tokenAlgorithm } from "./settings/userTokenSettings";

interface TokenQuery {
    Querystring: {
        iss: string;
        sub: string;
        cap?: string;
        attr?: string;
    }
}

function validateAttributes(attributes: any) {
    if (typeof attributes !== 'object' || !attributes) {
        throw new TypeError('Attributes needs to be a key-value map');
    }
    Object.keys(attributes).forEach(function(name, index) {
        if (Array.isArray(attributes[name])) {
            attributes[name].forEach(function(value: unknown) {
                if (typeof value !== 'string') {
                    throw new TypeError(`Attribute value not a string: ${name}[${index}]`);
                }
            });
        } else {
            throw new TypeError('Each attribute must be an array of string values');
        }
    });
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
                        cap: { type: 'string' },
                        attr: { type: 'string' }
                    },
                    required: [ 'iss', 'sub' ]
                },
                
            }
        }, async function(request, response) {
            const capabilities: Capability[] = (request.query.cap ? request.query.cap.split(',') : []).filter(isCapability);
            const attributes = request.query.attr ? JSON.parse(request.query.attr) : {};
            validateAttributes(attributes);
            const authTokenPayload = {
                iss: request.query.iss,
                sub: request.query.sub,
                cap: capabilities,
                attr: attributes
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
