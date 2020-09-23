import { DBGateway } from "./infrastructure/DBGateway";
import { UserContext } from "./types/UserContext";
import { FilesystemNotFoundByAliasError, NoFilesystemPermissionError, CannotDownloadDirectoryError } from "./types/errors";
import { FilesystemID, EntryID, FileID } from "./types/IDs";
import { FileUploadStart, FileUpload } from "./types/Inputs";
import { StorageBackendSelector } from "./types/StorageBackendSelector";
import { StorageBackendRepository } from "./types/StorageBackendRepository";
import { isFileEntry } from "./types/FileEntry";

export class FilesystemFactory {
    private db: DBGateway
    private storageBackendSelector: StorageBackendSelector;
    private storageBackendRepository: StorageBackendRepository;
    constructor({
        db,
        storageBackendSelector,
        storageBackendRepository
    }: {
        db: DBGateway,
        storageBackendSelector: StorageBackendSelector,
        storageBackendRepository: StorageBackendRepository
    }) {
        this.db = db;
        this.storageBackendSelector = storageBackendSelector;
        this.storageBackendRepository = storageBackendRepository;
    }

    async getFilesystemByAlias(alias: string) {
        const filesystemEntry = await this.db.findFilesystem({ alias: alias });
        if (!filesystemEntry) {
            throw new FilesystemNotFoundByAliasError(alias);
        }
        return new Filesystem(this.db, this.storageBackendSelector, this.storageBackendRepository, filesystemEntry);
    }
};

export class Filesystem {
    private filesystemID: FilesystemID;
    private db: DBGateway;
    private storageBackendSelector: StorageBackendSelector;
    private storageBackendRepository: StorageBackendRepository;
    constructor(
        db: DBGateway,
        storageBackendSelector: StorageBackendSelector,
        storageBackendRepository: StorageBackendRepository,
        { filesystemID }: { filesystemID: FilesystemID }
    ) {
        this.filesystemID = filesystemID;
        this.db = db;
        this.storageBackendSelector = storageBackendSelector;
        this.storageBackendRepository = storageBackendRepository;
    }

    private async hasPermission(user: UserContext, permissionType: "canRead" | "canWrite" | "canManage") {
        const permissions = await this.db.getFilesystemPermissions(user.identification, this.filesystemID);
        return permissions[permissionType];
    }

    async createDirectory(user: UserContext, parentID: EntryID | null, name: string) {
        if (!(await this.hasPermission(user, 'canWrite'))) {
            throw new NoFilesystemPermissionError('canWrite');
        }
        try {
            return await this.db.createDirectory(this.filesystemID, parentID, name);
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async listDirectory(user: UserContext, directoryID: EntryID | null) {
        if (!(await this.hasPermission(user, 'canRead'))) {
            throw new NoFilesystemPermissionError('canRead');
        }
        return await this.db.listDirectory(this.filesystemID, directoryID);
    }

    async startFileUpload(user: UserContext, files: FileUploadStart[]) {
        if (!(await this.hasPermission(user, 'canWrite'))) {
            throw new NoFilesystemPermissionError('canWrite');
        }
        const backendID = await this.storageBackendSelector.selectBackendForUpload(this.filesystemID, files);
        const backend = await this.storageBackendRepository.getBackendByID(backendID);
        const filesWithBackends = await Promise.all(files.map(async (file) => ({
            bytes: file.bytes,
            type: file.type,
            backendID: backendID,
            backendURI: await backend.obtainObjectURI()
        })));
        return await this.db.createFileRecords(this.filesystemID, filesWithBackends);
    }

    async uploadFile(user: UserContext, upload: FileUpload) {
        if (!(await this.hasPermission(user, 'canWrite'))) {
            throw new NoFilesystemPermissionError('canWrite');
        }
        const { backendID, backendURI } = await this.db.getFile(this.filesystemID, upload.fileID);
        const backend = await this.storageBackendRepository.getBackendByID(backendID);
        await backend.uploadStream(backendURI, upload.stream);
        return await this.db.finishFileUpload(this.filesystemID, upload);
    }

    async getFileDownloadURL(user: UserContext, entryID: EntryID) {
        if (!(await this.hasPermission(user, 'canRead'))) {
            throw new NoFilesystemPermissionError('canRead');
        }
        const entry = await this.db.getEntry(this.filesystemID, entryID);
        if (!isFileEntry(entry)) {
            throw new CannotDownloadDirectoryError(entryID);
        }
        const { backendID, backendURI } = await this.db.getFile(this.filesystemID, entry.fileID);
        const backend = await this.storageBackendRepository.getBackendByID(backendID);
        const downloadURL = await backend.getDownloadURL(backendURI, entry.name);
        return downloadURL;
    }
};
