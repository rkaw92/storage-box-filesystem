import { FileUploadStart } from "../types/Inputs";
import { FilesystemID } from "../types/IDs";
import { StorageBackend } from "../types/StorageBackend";
import { StorageBackendSelector } from "../types/StorageBackendSelector";
import { StorageBackendRepository } from "../types/StorageBackendRepository";

export class SingleStorageBackendManager implements StorageBackendSelector, StorageBackendRepository {
    private backend: StorageBackend;
    private myBackendID: string;
    constructor(backend: StorageBackend, myBackendID: string = '1') {
        this.backend = backend;
        this.myBackendID = myBackendID;
    }
    async selectBackendForUpload(filesystemID: FilesystemID, files: FileUploadStart[]) {
        return '1';
    }

    async getBackendByID(backendID: string) {
        if (backendID === this.myBackendID) {
            return this.backend;
        } else {
            throw new Error('This storage backend manager only manages one back-end, but a different backendID was requested');
        }
    }
};
