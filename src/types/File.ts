import { FileID, FilesystemID } from "./IDs";
import { BackendObjectIdentification } from "./BackendObjectIdentification";

export interface File extends BackendObjectIdentification {
    filesystemID: FilesystemID;
    fileID: FileID;
    referenceCount: BigInt;
    expires: Date | null;
    uploadFinished: boolean;
    bytes: BigInt;
};
