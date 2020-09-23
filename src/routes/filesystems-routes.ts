import { FastifyInstance } from "fastify";
import { Filesystems } from "../Filesystems";

interface FilesystemCreationRequest {
    Body: {
        name: string;
        alias: string;
    };
}

export default function getRouteInstaller({
    filesystems
}: {
    filesystems: Filesystems
}) {
    return async function installRoutes(app: FastifyInstance) {
        app.addHook('preHandler', async function(request, response) {
            if (!request.userContext) {
                response.status(403);
                throw new Error('Only authenticated users can access filesystem listings');
            }
        });
        app.get('/filesystems', async function(request, response) {
            return await filesystems.listFilesystems(request.userContext!);
        });
        app.post<FilesystemCreationRequest>('/filesystems', {
            schema: {
                body: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        alias: { type: 'string' }
                    },
                    required: [ 'name', 'alias' ]
                }
            }
        }, async function(request, response) {
            const filesystemData = await filesystems.createFilesystem(request.userContext!, request.body.name, request.body.alias);
            response.status(201);
            return filesystemData;
        });
    };
};
