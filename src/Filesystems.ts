import { DBGateway } from "./infrastructure/DBGateway";
import { UserContext } from "./types/UserContext";
import { NoCapabilityError } from "./types/errors";

export class Filesystems {
    private db: DBGateway;
    constructor({
        db
    }: {
        db: DBGateway
    }) {
        this.db = db;
    }

    listFilesystems(user: UserContext) {
        return this.db.listFilesystems(user.identification);
    }

    createFilesystem(user: UserContext, name: string, alias: string) {
        if (user.canCreateFilesystems) {
            return this.db.createFilesystem(user.identification, name, alias);
        } else {
            throw new NoCapabilityError('create-fs');
        }
    }
};
