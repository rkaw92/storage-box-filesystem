import { DBGateway } from "./infrastructure/DBGateway";
import { StorageBackendRepository } from "./types/StorageBackendRepository";

export class FileCleanup {
    private db: DBGateway;
    private storageBackendRepository: StorageBackendRepository;
    constructor({
        db,
        storageBackendRepository
    }: {
        db: DBGateway,
        storageBackendRepository: StorageBackendRepository
    }) {
        this.db = db;
        this.storageBackendRepository = storageBackendRepository;
    }

    async cleanup() {
        const self = this;
        // TODO: Process more expired files in one pass - currently, we delete up to 20 files
        await self.db.processExpiredFiles(async function(file) {
            const backend = await self.storageBackendRepository.getBackendByID(file.backendID);
            try {
                await backend.deleteFile(file.backendURI);
            } catch (error) {
                console.error(error);
                // Make sure to re-throw - otherwise, the file entry would be deleted
                //  while the data remains on the back-end.
                throw error;
            }
        });
    }
};
