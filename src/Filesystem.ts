import { DBGateway } from "./infrastructure/DBGateway";
import { UserContext } from "./types/UserContext";
import { FilesystemNotFoundByAliasError, NoFilesystemPermissionError, CannotDownloadDirectoryError, FileAlreadyUploadedError, Bug, CannotReplaceDirectoryWithFileError } from "./types/errors";
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

type FilesystemPermissionType = keyof FilesystemPermissions;
type EntryPermissionType = keyof EntryPermissions;

function entryToKey(entry: { parentID: ParentID, name: string }) {
    return `${entry.parentID}/${entry.name}`;
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

    async createDirectory(user: UserContext, parentID: EntryID | null, name: string) {
        await this.checkEntryPermission(user, 'canWrite', parentID);
        try {
            return await this.db.createDirectory(this.filesystemID, parentID, name);
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async listDirectory(user: UserContext, directoryID: EntryID | null) {
        await this.checkEntryPermission(user, 'canRead', directoryID);
        return await this.db.listDirectory(this.filesystemID, directoryID);
    }

    async startFileUpload(user: UserContext, files: FileUploadStart[]): Promise<ItemOutput[]> {
        const parentIDs = new Set(files.map((upload) => upload.parentID));
        for (let parentID of parentIDs.values()) {
            await this.checkEntryPermission(user, 'canWrite', parentID);
        }
        // First, find out if the files already exist in their target directories.
        // This will determine whether or not we can safely start an upload to that location.
        const existingEntries = await this.db.getEntriesByPaths(this.filesystemID, files);
        const existingEntryMap = new Map(existingEntries.map(function(entry) {
            return [ entryToKey(entry), entry ];
        }));
        const backendID = await this.storageBackendSelector.selectBackendForUpload(this.filesystemID, files);
        const backend = await this.storageBackendRepository.getBackendByID(backendID);
        const plan: ItemPlan[] = await Promise.all(files.map(async function(file): Promise<ItemWillUpload | ItemIsDuplicate> {
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

    async uploadFile(user: UserContext, uploadUntrusted: FileUploadUntrusted) {
        const upload = this.uploadTokenHandler.verify(uploadUntrusted.token);
        await this.checkEntryPermission(user, 'canWrite', upload.parentID);

        const { backendID, backendURI, uploadFinished } = await this.db.getFile(this.filesystemID, upload.fileID);
        if (uploadFinished) {
            throw new FileAlreadyUploadedError(upload.fileID);
        }
        const backend = await this.storageBackendRepository.getBackendByID(backendID);
        await backend.uploadStream(backendURI, uploadUntrusted.stream);
        return await this.db.finishFileUpload(this.filesystemID, upload);
    }

    async getFileDownloadURL(user: UserContext, entryID: EntryID) {
        const entry = await this.db.getEntry(this.filesystemID, entryID);
        await this.checkEntryPermissionByPath(user, 'canRead', entry.path);
        if (!isFileEntry(entry)) {
            throw new CannotDownloadDirectoryError(entryID);
        }
        const { backendID, backendURI } = await this.db.getFile(this.filesystemID, entry.fileID);
        const backend = await this.storageBackendRepository.getBackendByID(backendID);
        const downloadURL = await backend.getDownloadURL(backendURI, entry.name);
        return downloadURL;
    }

    async deleteEntry(user: UserContext, entryID: EntryID) {
        await this.checkEntryParentPermission(user, 'canWrite', entryID);
        await this.db.deleteEntry(this.filesystemID, entryID);
    }
};
