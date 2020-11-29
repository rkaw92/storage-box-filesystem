import { CreateFilesystemParams } from "@rkaw92/storage-box-interfaces";
import { FastifyInstance } from "fastify";
import { Filesystems, FilesystemsProxy } from "../Filesystems";

interface FilesystemCreationRequest {
    Body: CreateFilesystemParams;
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
            const proxy = new FilesystemsProxy(filesystems, request.userContext!);
            return await proxy.listFilesystems();
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
            const proxy = new FilesystemsProxy(filesystems, request.userContext!);
            const filesystemData = await proxy.createFilesystem(request.body);
            response.status(201);
            return filesystemData;
        });
    };
};
