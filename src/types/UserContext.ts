import { UserIdentification } from "./UserIdentification";
import { UserAttributes } from "./UserAttributes";

export interface UserContext {
    identification: UserIdentification;
    attributes: UserAttributes;
    canCreateFilesystems: boolean;
};
