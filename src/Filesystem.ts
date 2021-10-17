import { DBGateway } from "./infrastructure/DBGateway";
import { UserContext } from "./types/UserContext";
import { FilesystemNotFoundByAliasError, NoFilesystemPermissionError, CannotDownloadDirectoryError, FileAlreadyUploadedError, Bug, CannotReplaceDirectoryWithFileError, TargetIsNotDirectoryError, DirectoryCycleError } from "./types/errors";
import { FilesystemID, EntryID, FileID, ParentID } from "./types/IDs";
import { FileUploadStart, FileUpload, isFileDataUploadStart, FileUploadUntrusted } from "./types/Inputs";
import { StorageBackendSelector } from "./types/StorageBackendSelector";
import { StorageBackendRepository } from "./types/StorageBackendRepository";
import { isFileEntry } from "./types/FileEntry";
import { UploadTokenHandler } from "./infrastructure/uploadTokens";
import { FileRecord, isFileRecord } from "./types/records";
import { ItemPlan, ItemWillUpload, ItemIsDuplicate, ItemOutput, ItemUploadStarted, ItemUploadPreventedOnDuplicate, UploadTokenPayload } from "./types/processes/StartUpload";
import { FilesystemPermissions } from "./types/FilesystemPermissions";
import { EntryPermissions } from "./types/EntryPermissions";
import { isDirectoryEntry } from "./types/DirectoryEntry";
import { CreateDirectoryParams, DeleteEntryParams, DownloadFileOrRedirectResult, DownloadFileParams, DownloadFileResult, DownloadURL, FilesystemDataDownloadDirector, FilesystemDataUpload, FilesystemPermissionManagement, FilesystemStructureOperations, ListDirectoryParams, MoveEntryParams, SetEntryPermissionParams, StartFileUploadParams, UploadFileParams } from '@rkaw92/storage-box-interfaces';
import { Readable as ReadableStream } from 'stream';
import { supportsDownloadURLs } from "./types/StorageBackend";
import { getDefaultCriterionForUser } from "./utils/getDefaultCriterionForUser";

type FilesystemPermissionType = keyof FilesystemPermissions;
type EntryPermissionType = keyof EntryPermissions;

function entryToKey(entry: { parentID: ParentID, name: string }) {
    return `${entry.parentID}/${entry.name}`;
}

const entryPermissionTypes: EntryPermissionType[] = [ 'canRead', 'canWrite', 'canShare' ];
function isEmptyPermission(permission: EntryPermissions) {
    return entryPermissionTypes.every((permissionType) => permission[permissionType] === false);
}

export class FilesystemFactory {
    private db: DBGateway
    private storageBackendSelector: StorageBackendSelector;
    private storageBackendRepository: StorageBackendRepository;
    private uploadTokenHandler: UploadTokenHandler;
    constructor({
        db,
        storageBackendSelector,
        storageBackendRepository,
        uploadTokenHandler
    }: {
        db: DBGateway,
        storageBackendSelector: StorageBackendSelector,
        storageBackendRepository: StorageBackendRepository,
        uploadTokenHandler: UploadTokenHandler
    }) {
        this.db = db;
        this.storageBackendSelector = storageBackendSelector;
        this.storageBackendRepository = storageBackendRepository;
        this.uploadTokenHandler = uploadTokenHandler;
    }

    async getFilesystemByAlias(alias: string) {
        const filesystemEntry = await this.db.findFilesystem({ alias: alias });
        if (!filesystemEntry) {
            throw new FilesystemNotFoundByAliasError(alias);
        }
        return new Filesystem(this.db, this.storageBackendSelector, this.storageBackendRepository, this.uploadTokenHandler, filesystemEntry);
    }
};

export class FilesystemProxy implements FilesystemStructureOperations, FilesystemDataUpload<ReadableStream>, FilesystemDataDownloadDirector<ReadableStream>, FilesystemPermissionManagement {
    private instance: Filesystem;
    private context: UserContext;
    constructor(instance: Filesystem, context: UserContext) {
        this.instance = instance;
        this.context = context;
    }

    createDirectory(params: CreateDirectoryParams) {
        return this.instance.createDirectory(this.context, params);
    }

    listDirectory(params: ListDirectoryParams) {
        return this.instance.listDirectory(this.context, params);
    }

    deleteEntry(params: DeleteEntryParams) {
        return this.instance.deleteEntry(this.context, params);
    }

    moveEntry(params: MoveEntryParams) {
        return this.instance.moveEntry(this.context, params);
    }
    
    startFileUpload(params: StartFileUploadParams) {
        return this.instance.startFileUpload(this.context, params);
    }

    uploadFile(params: UploadFileParams<ReadableStream>) {
        return this.instance.uploadFile(this.context, params);
    }

    async downloadFileOrRedirect(params: DownloadFileParams): Promise<DownloadFileOrRedirectResult<ReadableStream>> {
        return await this.instance.downloadFileOrRedirect(this.context, params);
    }

    setEntryPermission(params: SetEntryPermissionParams) {
        return this.instance.setEntryPermission(this.context, params);
    }
};

export class Filesystem {
    private filesystemID: FilesystemID;
    private db: DBGateway;
    private storageBackendSelector: StorageBackendSelector;
    private storageBackendRepository: StorageBackendRepository;
    private uploadTokenHandler: UploadTokenHandler;
    constructor(
        db: DBGateway,
        storageBackendSelector: StorageBackendSelector,
        storageBackendRepository: StorageBackendRepository,
        uploadTokenHandler: UploadTokenHandler,
        { filesystemID }: { filesystemID: FilesystemID }
    ) {
        this.filesystemID = filesystemID;
        this.db = db;
        this.storageBackendSelector = storageBackendSelector;
        this.storageBackendRepository = storageBackendRepository;
        this.uploadTokenHandler = uploadTokenHandler;
    }

    private async hasFilesystemPermission(user: UserContext, permissionType: FilesystemPermissionType) {
        const permissions = await this.db.getFilesystemPermissions(user.attributes, this.filesystemID);
        return permissions[permissionType];
    }

    private async hasEntryPermission(user: UserContext, permissionType: EntryPermissionType, entryID: EntryID) {
        const permissions = await this.db.getEntryPermissions(user.attributes, this.filesystemID, entryID);
        return permissions[permissionType];
    }

    private async hasEntryParentPermission(user: UserContext, permissionType: EntryPermissionType, entryID: EntryID) {
        const permissions = await this.db.getParentPermissions(user.attributes, this.filesystemID, entryID);
        return permissions[permissionType];
    }

    private async hasEntryPermissionByPath(user: UserContext, permissionType: EntryPermissionType, path: EntryID[]) {
        const permissions = await this.db.getEntryPermissionsByPath(user.attributes, this.filesystemID, path);
        return permissions[permissionType];
    }

    private async checkEntryPermission(user: UserContext, permissionType: EntryPermissionType, entryID: EntryID | null) {
        const filesystemPermissionPromise = this.hasFilesystemPermission(user, permissionType);
        const entryPermissionPromise = entryID ? this.hasEntryPermission(user, permissionType, entryID) : Promise.resolve(false);
        const permissions = await Promise.all([ filesystemPermissionPromise, entryPermissionPromise ]);
        if (!permissions.some((hasAccess) => hasAccess === true)) {
            throw new NoFilesystemPermissionError(permissionType);
        }
    }

    private async checkEntryParentPermission(user: UserContext, permissionType: EntryPermissionType, entryID: EntryID) {
        const filesystemPermissionPromise = this.hasFilesystemPermission(user, permissionType);
        const entryPermissionPromise = this.hasEntryParentPermission(user, permissionType, entryID);
        const permissions = await Promise.all([ filesystemPermissionPromise, entryPermissionPromise ]);
        if (!permissions.some((hasAccess) => hasAccess === true)) {
            throw new NoFilesystemPermissionError(permissionType);
        }
    }

    private async checkEntryPermissionByPath(user: UserContext, permissionType: EntryPermissionType, path: EntryID[]) {
        const filesystemPermissionPromise = this.hasFilesystemPermission(user, permissionType);
        const entryPermissionPromise = this.hasEntryPermissionByPath(user, permissionType, path);
        const permissions = await Promise.all([ filesystemPermissionPromise, entryPermissionPromise ]);
        if (!permissions.some((hasAccess) => hasAccess === true)) {
            throw new NoFilesystemPermissionError(permissionType);
        }
    }

    async createDirectory(user: UserContext, params: CreateDirectoryParams) {
        await this.checkEntryPermission(user, 'canWrite', params.parentID);
        try {
            return await this.db.createDirectory(this.filesystemID, params.parentID, params.name);
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async listDirectory(user: UserContext, params: ListDirectoryParams) {
        await this.checkEntryPermission(user, 'canRead', params.directoryID);
        return await this.db.listDirectory(this.filesystemID, params.directoryID);
    }

    async startFileUpload(user: UserContext, params: StartFileUploadParams): Promise<ItemOutput[]> {
        const parentIDs = new Set(params.files.map((upload) => upload.parentID));
        for (let parentID of parentIDs.values()) {
            await this.checkEntryPermission(user, 'canWrite', parentID);
        }
        // First, find out if the files already exist in their target directories.
        // This will determine whether or not we can safely start an upload to that location.
        const existingEntries = await this.db.getEntriesByPaths(this.filesystemID, params.files);
        const existingEntryMap = new Map(existingEntries.map(function(entry) {
            return [ entryToKey(entry), entry ];
        }));
        const backendID = await this.storageBackendSelector.selectBackendForUpload(this.filesystemID, params.files);
        const backend = await this.storageBackendRepository.getBackendByID(backendID);
        const plan: ItemPlan[] = await Promise.all(params.files.map(async function(file): Promise<ItemWillUpload | ItemIsDuplicate> {
            // Guard clause: disallow replacing directories with files under any conditions:
            const existingEntry = existingEntryMap.get(entryToKey(file));
            if (existingEntry && existingEntry.entryType === 'directory') {
                throw new CannotReplaceDirectoryWithFileError(existingEntry.entryID);
            }
            if (existingEntry && !file.replace) {
                return {
                    decision: 'duplicate',
                    origin: file,
                    existingEntry: existingEntry
                };
            }
            return {
                decision: 'upload',
                origin: file,
                uploadStart: {
                    bytes: file.bytes,
                    type: file.type,
                    backendID: backendID,
                    backendURI: await backend.obtainObjectURI()
                }
            };
        }));
        const actualRecordsToCreate = plan.filter((plan): plan is ItemWillUpload => plan.decision === 'upload').map((plan) => plan.uploadStart);
        const createdRecords = await this.db.createFileRecords(this.filesystemID, actualRecordsToCreate);
        const outputs: ItemOutput[] = [];
        for (let planItem of plan) {
            if (planItem.decision === 'upload') {
                const createdRecord = createdRecords.shift()!;
                const tokenPayload: UploadTokenPayload = {
                    parentID: planItem.origin.parentID,
                    name: planItem.origin.name,
                    fileID: createdRecord.fileID,
                    replace: Boolean(planItem.origin.replace)
                };
                outputs.push(<ItemUploadStarted>{
                    decision: 'upload',
                    token: this.uploadTokenHandler.sign(tokenPayload)
                });
            } else if (planItem.decision === 'duplicate') {
                outputs.push(<ItemUploadPreventedOnDuplicate>{
                    decision: 'duplicate',
                    existingEntry: (<ItemIsDuplicate>planItem).existingEntry
                });
            } else {
                throw new Bug('Unknown decision type for file upload: ' + planItem.decision);
            }
        }
        // Sanity check: make sure we've produced as many outputs as inputs.
        if (outputs.length !== plan.length) {
            throw new Bug('Number of outputs is not equal to number of inputs - we have missed some uploads');
        }
        return outputs;
    }

    async uploadFile(user: UserContext, params: UploadFileParams<ReadableStream>) {
        const upload = this.uploadTokenHandler.verify(params.upload.token);
        await this.checkEntryPermission(user, 'canWrite', upload.parentID);

        const { backendID, backendURI, uploadFinished } = await this.db.getFile(this.filesystemID, upload.fileID);
        if (uploadFinished) {
            throw new FileAlreadyUploadedError(upload.fileID);
        }
        const backend = await this.storageBackendRepository.getBackendByID(backendID);
        await backend.uploadStream(backendURI, params.upload.data);
        return await this.db.finishFileUpload(this.filesystemID, upload);
    }

    async downloadFileOrRedirect(user: UserContext, params: DownloadFileParams): Promise<DownloadFileOrRedirectResult<ReadableStream>> {
        const entry = await this.db.getEntry(this.filesystemID, params.entryID);
        await this.checkEntryPermissionByPath(user, 'canRead', entry.path);
        if (!isFileEntry(entry)) {
            throw new CannotDownloadDirectoryError(params.entryID);
        }
        const { backendID, backendURI, mimetype, bytes } = await this.db.getFile(this.filesystemID, entry.fileID);
        const backend = await this.storageBackendRepository.getBackendByID(backendID);
        if (supportsDownloadURLs(backend) && backend.isDownloadURLSupportEnabled()) {
            return {
                url: await backend.getDownloadURL(backendURI, entry.name, 'inline', mimetype)
            };
        } else {
            return {
                info: {
                    name: entry.name,
                    mimetype: mimetype,
                    bytes: Number(bytes)
                },
                data: await backend.downloadStream(backendURI)
            };
        }
    }

    async deleteEntry(user: UserContext, params: DeleteEntryParams) {
        await this.checkEntryParentPermission(user, 'canWrite', params.entryID);
        await this.db.deleteEntry(this.filesystemID, params.entryID);
    }

    async moveEntry(user: UserContext, params: MoveEntryParams) {
        await this.checkEntryParentPermission(user, 'canWrite', params.entryID);
        await this.checkEntryPermission(user, 'canWrite', params.targetParentID);
        if (params.targetParentID) {
            // If the target entry is specified, make sure it's an actual directory and not a file:
            const target = await this.db.getEntry(this.filesystemID, params.targetParentID);
            if (!isDirectoryEntry(target)) {
                throw new TargetIsNotDirectoryError(params.targetParentID);
            }
            // Also make sure it's not our descendant:
            if (target.path.includes(params.entryID)) {
                throw new DirectoryCycleError(params.entryID, params.targetParentID);
            }
        }
        await this.db.moveEntry(this.filesystemID, params.entryID, params.targetParentID);
    }

    async setEntryPermission(user: UserContext, params: SetEntryPermissionParams) {
        // Always check sharing permissions:
        await this.checkEntryPermission(user, 'canShare', params.entryID);
        // Additionally, the user must already possess the permission they wish to share:
        const permissionTheUserWishesToShare = entryPermissionTypes.filter((permissionType) => params.permission[permissionType]);
        for (const permissionType of permissionTheUserWishesToShare) {
            await this.checkEntryPermission(user, permissionType, params.entryID);
        }
        const revocationCriterion = getDefaultCriterionForUser(user.identification);
        if (isEmptyPermission(params.permission)) {
            await this.db.deleteEntryPermissions(
                this.filesystemID,
                params.entryID,
                params.criterion,
                revocationCriterion
            );
        } else {
            await this.db.upsertEntryPermissions(
                this.filesystemID,
                params.entryID,
                params.criterion,
                params.permission,
                revocationCriterion,
                params.comment || null
            );
        }
    }

    // TODO: revokeEntryPermissionAdministratively - requires the "canManage" permission on the entire fs
};
