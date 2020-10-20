import { DBGateway } from "./infrastructure/DBGateway";
import { UserContext } from "./types/UserContext";
import { NoCapabilityError } from "./types/errors";
import { AttributeSelector } from "./types/AttributeSelector";
import { getDefaultAttributeSelectorForUser } from "./utils/getDefaultAttributeSelectorForUser";

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
        return this.db.listFilesystems(user.attributes);
    }

    createFilesystem(user: UserContext, name: string, alias: string) {
        if (user.canCreateFilesystems) {
            // Initially, the user who creates the filesystem automatically becomes its manager.
            const grantInitialPermissionsTo = [ getDefaultAttributeSelectorForUser(user.identification) ];
            return this.db.createFilesystem(grantInitialPermissionsTo, name, alias);
        } else {
            throw new NoCapabilityError('create-fs');
        }
    }
};
