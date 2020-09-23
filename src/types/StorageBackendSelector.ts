import { FilesystemID } from "./IDs";
import { FileUploadStart } from "./Inputs";

export interface StorageBackendSelector {
    selectBackendForUpload(filesystemID: FilesystemID, files: FileUploadStart[]): Promise<string>;
};
