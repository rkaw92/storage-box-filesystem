import { FastifyInstance, FastifyRequest } from "fastify";
import { FilesystemFactory } from "../Filesystem";
import { EntryID, FileID } from "../types/IDs";
import { FileUploadStart, FileUpload, FileUploadUntrusted } from "../types/Inputs";

interface AliasParams {
    alias: string;
}

interface ListParams extends AliasParams {
    directoryID: EntryID | null;
}

interface DirectoryCreationRequest {
    Params: AliasParams;
    Body: {
        parentID: EntryID | null;
        name: string;
    };
}

interface DeleteParams extends AliasParams {
    entryID: EntryID;
}
interface DeleteRequest {
    Params: DeleteParams;
}

interface DirectoryListingRequest {
    Params: ListParams;
}

interface UploadStartRequest {
    Params: AliasParams;
    Body: {
        files: Array<FileUploadStart>
    };
}

interface UploadParams extends AliasParams {}

interface UploadFileRequest {
    Params: UploadParams;
    Querystring: {
        token: string;
    };
    Body: FileUploadUntrusted["stream"];
}

interface FileGetRequestParams extends AliasParams {
    entryID: EntryID;
}

interface FileGetRequest {
    Params: FileGetRequestParams;
}

export default function getRouteInstaller({
    filesystemFactory
}: {
    filesystemFactory: FilesystemFactory
}) {
    return async function installRoutes(app: FastifyInstance) {
        app.addHook('preHandler', async function(request, response) {
            if (!request.userContext) {
                response.status(403);
                throw new Error('Only authenticated users can access filesystem listings');
            }
        });
        app.post<DirectoryCreationRequest>('/fs/:alias/directory', {
            schema: {
                params: {
                    alias: { type: 'string' }
                },
                body: {
                    type: 'object',
                    properties: {
                        parentID: { type: [ 'string', 'null' ] },
                        name: { type: 'string' }
                    },
                    required: [ 'parentID', 'name' ]
                }
            }
        }, async function(request) {
            const filesystem = await filesystemFactory.getFilesystemByAlias(request.params.alias);
            return await filesystem.createDirectory(request.userContext!, request.body.parentID, request.body.name)
        });
        app.delete<DeleteRequest>('/fs/:alias/entries/:entryID', async function(request, response) {
            const filesystem = await filesystemFactory.getFilesystemByAlias(request.params.alias);
            await filesystem.deleteEntry(request.userContext!, request.params.entryID);
            return response.status(204).send();
        });
        app.get<DirectoryListingRequest>('/fs/:alias/list', async function(request) {
            const filesystem = await filesystemFactory.getFilesystemByAlias(request.params.alias);
            return await filesystem.listDirectory(request.userContext!, null);
        });
        app.get<DirectoryListingRequest>('/fs/:alias/list/:directoryID', async function(request) {
            const filesystem = await filesystemFactory.getFilesystemByAlias(request.params.alias);
            return await filesystem.listDirectory(request.userContext!, request.params.directoryID);
        });
        app.get<FileGetRequest>('/fs/:alias/download/:entryID', async function(request, response) {
            const filesystem = await filesystemFactory.getFilesystemByAlias(request.params.alias);
            const downloadURL = await filesystem.getFileDownloadURL(request.userContext!, request.params.entryID);
            return response.redirect(downloadURL);
        });
        app.post<UploadStartRequest>('/fs/:alias/upload', {
            schema: {
                params: {
                    alias: { type: 'string' }
                },
                body: {
                    type: 'object',
                    properties: {
                        files: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    bytes: { type: 'number' },
                                    type: { type: 'string' },
                                    parentID: { type: 'string' },
                                    name: { type: 'string' }
                                }
                            }
                        }
                    }
                }
            }
        }, async function(request) {
            const filesystem = await filesystemFactory.getFilesystemByAlias(request.params.alias);
            return await filesystem.startFileUpload(request.userContext!, request.body.files);
        });
        app.register(async function(isolatedApp) {
            isolatedApp.addContentTypeParser('*', async function(request: FastifyRequest, body: any) {
                return body;
            });
            isolatedApp.addContentTypeParser('application/json', async function(request: FastifyRequest, body: any) {
                return body;
            });
            app.post<UploadFileRequest>('/fs/:alias/upload/finish', {
                schema: {
                    params: {
                        alias: { type: 'string' }
                    },
                    querystring: {
                        type: 'object',
                        properties: {
                            token: { type: 'string' }
                        },
                        required: [ 'token' ]
                    }
                }
            }, async function(request) {
                const filesystem = await filesystemFactory.getFilesystemByAlias(request.params.alias);
                return await filesystem.uploadFile(request.userContext!, {
                    stream: request.body,
                    token: request.query.token
                });
            });
        });
    };
}
