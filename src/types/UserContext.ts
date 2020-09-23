import { UserIdentification } from "./UserIdentification";

export interface UserContext {
    identification: UserIdentification;
    canCreateFilesystems: boolean;
};
