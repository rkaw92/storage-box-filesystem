import { CreateDirectoryParams, DeleteEntryParams, DownloadFileInfo, isDownloadFileResult, isDownloadURL, ListDirectoryParams, MoveEntryParams, RevokePermissionAdministrativelyParams, SetEntryPermissionParams } from "@rkaw92/storage-box-interfaces";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { FilesystemFactory, FilesystemProxy } from "../Filesystem";
import { EntryID, FileID } from "../types/IDs";
import { FileUploadStart, FileUpload, FileUploadUntrusted } from "../types/Inputs";
import { Readable as ReadableStream } from 'stream';
import { Bug } from "../types/errors";

interface AliasParams {
    alias: string;
}

interface DirectoryCreationRequest {
    Params: AliasParams;
    Body: CreateDirectoryParams;
}

interface DeleteParams extends AliasParams, DeleteEntryParams {};
interface DeleteRequest {
    Params: DeleteParams;
}

interface MoveParams extends AliasParams {
    entryID: MoveEntryParams["entryID"];
}
interface MoveRequest {
    Params: MoveParams;
    Body: {
        targetParentID: MoveEntryParams["targetParentID"];
    }
}

interface SetPermissionParams extends AliasParams {
    entryID: SetEntryPermissionParams["entryID"];
}
interface SetPermissionsRequest {
    Params: SetPermissionParams;
    Body: Omit<SetEntryPermissionParams,"entryID">;
}

interface RevokePermissionAdministrativelyRouteParams extends AliasParams {
    entryID: RevokePermissionAdministrativelyParams["entryID"];
}
interface RevokePermissionAdministrativelyRequest {
    Params: RevokePermissionAdministrativelyRouteParams;
    Body: Omit<RevokePermissionAdministrativelyParams,"entryID">;
}

interface ListParams extends AliasParams, ListDirectoryParams {}
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

type ContentDispositionType = "inline" | "attachment";
function sendFileInfoAsHeaders(reply: FastifyReply, info: DownloadFileInfo, disposition: ContentDispositionType = 'inline') {
    const filenamePart = (info.name ? `; filename="${info.name}"` : '');
    reply.header('Content-Disposition', `${disposition}${filenamePart}`);
    if (info.bytes) {
        reply.header('Content-Length', info.bytes);
    }
    if (info.mimetype) {
        reply.header('Content-Type', info.mimetype);
    }
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
            const proxy = new FilesystemProxy(filesystem, request.userContext!);
            return await proxy.createDirectory(request.body);
        });
        app.delete<DeleteRequest>('/fs/:alias/entries/:entryID', async function(request, response) {
            const filesystem = await filesystemFactory.getFilesystemByAlias(request.params.alias);
            const proxy = new FilesystemProxy(filesystem, request.userContext!);
            await proxy.deleteEntry(request.params);
            return response.status(204).send();
        });
        app.post<MoveRequest>('/fs/:alias/entries/:entryID/move', {
            schema: {
                params: {
                    alias: { type: 'string' }
                },
                body: {
                    type: 'object',
                    properties: {
                        targetParentID: { type: [ 'string', 'null' ] }
                    }
                }
            }
        }, async function(request, response) {
            const filesystem = await filesystemFactory.getFilesystemByAlias(request.params.alias);
            const proxy = new FilesystemProxy(filesystem, request.userContext!);
            await proxy.moveEntry({
                entryID: request.params.entryID,
                targetParentID: request.body.targetParentID
            });
            return response.status(200).send();
        });
        app.post<SetPermissionsRequest>('/fs/:alias/entries/:entryID/setPermissions', {
            schema: {
                params: {
                    alias: { type: 'string' },
                    entryID: { type: 'string' }
                },
                body: {
                    type: 'object',
                    properties: {
                        permission: {
                            canRead: { type: 'boolean' },
                            canWrite: { type: 'boolean' },
                            canShare: { type: 'boolean' }
                        },
                        criterion: {
                            issuer: { type: 'string' },
                            attribute: { type: 'string' },
                            value: { type: 'string' }
                        }
                    }
                }
            }
        }, async function(request, response) {
            const filesystem = await filesystemFactory.getFilesystemByAlias(request.params.alias);
            const proxy = new FilesystemProxy(filesystem, request.userContext!);
            await proxy.setEntryPermission({
                entryID: request.params.entryID,
                permission: request.body.permission,
                criterion: request.body.criterion
            });
            return response.status(200).send();
        });
        app.post<RevokePermissionAdministrativelyRequest>('/fs/:alias/entries/:entryID/revokePermissionAdministratively', {
            schema: {
                params: {
                    alias: { type: 'string' },
                    entryID: { type: 'string' }
                },
                body: {
                    type: 'object',
                    properties: {
                        criterion: {
                            issuer: { type: 'string' },
                            attribute: { type: 'string' },
                            value: { type: 'string' }
                        },
                        revocationCriterion: {
                            issuer: { type: 'string' },
                            attribute: { type: 'string' },
                            value: { type: 'string' }
                        }
                    }
                }
            }
        }, async function(request, response) {
            const filesystem = await filesystemFactory.getFilesystemByAlias(request.params.alias);
            const proxy = new FilesystemProxy(filesystem, request.userContext!);
            await proxy.revokePermissionAdministratively({
                entryID: request.params.entryID,
                criterion: request.body.criterion,
                revocationCriterion: request.body.revocationCriterion
            });
            return response.status(200).send();
        });
        app.get<DirectoryListingRequest>('/fs/:alias/list', async function(request) {
            const filesystem = await filesystemFactory.getFilesystemByAlias(request.params.alias);
            const proxy = new FilesystemProxy(filesystem, request.userContext!);
            return await proxy.listDirectory({ directoryID: null });
        });
        app.get<DirectoryListingRequest>('/fs/:alias/list/:directoryID', async function(request) {
            const filesystem = await filesystemFactory.getFilesystemByAlias(request.params.alias);
            const proxy = new FilesystemProxy(filesystem, request.userContext!);
            return await proxy.listDirectory({ directoryID: request.params.directoryID });
        });
        app.get<FileGetRequest>('/fs/:alias/download/:entryID', async function(request, response) {
            const filesystem = await filesystemFactory.getFilesystemByAlias(request.params.alias);
            const proxy = new FilesystemProxy(filesystem, request.userContext!);
            const download = await proxy.downloadFileOrRedirect(request.params);
            if (isDownloadURL(download)) {
                return response.redirect(download.url);
            } else if (isDownloadFileResult<ReadableStream>(download)) {
                sendFileInfoAsHeaders(response, download.info);
                return response.send(download.data);
            } else {
                throw new Bug('Unknown type returned from downloadFileOrRedirect()');
            }
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
            return await filesystem.startFileUpload(request.userContext!, request.body);
        });
        app.register(async function(isolatedApp) {
            isolatedApp.addContentTypeParser('*', async function(request: FastifyRequest, body: any) {
                return body;
            });
            isolatedApp.addContentTypeParser('application/json', async function(request: FastifyRequest, body: any) {
                return body;
            });
            isolatedApp.post<UploadFileRequest>('/fs/:alias/upload/finish', {
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
                    upload: {
                        data: request.body,
                        token: request.query.token
                    }
                });
            });
        });
    };
}
