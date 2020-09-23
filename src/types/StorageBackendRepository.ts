import { StorageBackend } from "./StorageBackend";

export interface StorageBackendRepository {
    getBackendByID(backendID: string): Promise<StorageBackend>;
};
