import { DBGateway } from "./infrastructure/DBGateway";
import { UserContext } from "./types/UserContext";
import { NoCapabilityError } from "./types/errors";
import { getDefaultCriterionForUser } from "./utils/getDefaultCriterionForUser";
import { CreateFilesystemParams, FilesystemsOperations } from '@rkaw92/storage-box-interfaces';


export class FilesystemsProxy implements FilesystemsOperations {
    private instance: Filesystems;
    private context: UserContext;

    constructor(instance: Filesystems, context: UserContext) {
        this.instance = instance;
        this.context = context;
    }

    listFilesystems() {
        return this.instance.listFilesystems(this.context);
    }

    createFilesystem(params: CreateFilesystemParams) {
        return this.instance.createFilesystem(this.context, params);
    }
}

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

    createFilesystem(user: UserContext, params: CreateFilesystemParams) {
        if (user.canCreateFilesystems) {
            // Initially, the user who creates the filesystem automatically becomes its manager.
            const grantInitialPermissionsTo = [ getDefaultCriterionForUser(user.identification) ];
            return this.db.createFilesystem(grantInitialPermissionsTo, params.name, params.alias);
        } else {
            throw new NoCapabilityError('create-fs');
        }
    }
};
