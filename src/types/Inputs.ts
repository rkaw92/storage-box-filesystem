import { BackendObjectIdentification } from "./BackendObjectIdentification";
import { Readable } from 'stream';
import { FileID, EntryID } from "./IDs";

export interface FileUploadStart {
    bytes: number;
    type: string;
};

export interface FileUploadStartWithBackend extends FileUploadStart, BackendObjectIdentification {};

export interface FileUpload {
    fileID: FileID;
    stream: Readable;
    parentID: EntryID;
    name: string;
};
