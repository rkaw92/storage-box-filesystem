import { BackendObjectIdentification } from "./BackendObjectIdentification";
import { Readable } from 'stream';
import { FileID, EntryID } from "./IDs";

export interface FileDataDescription {
    bytes: number;
    type: string;
};

export interface FileEntryDescription {
    parentID: EntryID | null;
    name: string;
    replace?: boolean;
};

export interface FileUploadStart extends FileDataDescription, FileEntryDescription {};
export interface FileDataUploadStart extends FileDataDescription, BackendObjectIdentification {};
export function isFileDataUploadStart(input: { [key: string]: any }): input is FileDataUploadStart {
    return (
        typeof input.bytes === 'number' &&
        typeof input.type === 'string' &&
        typeof input.backendID === 'string' &&
        typeof input.backendURI === 'string'
    );
}
export interface FileUpload extends FileEntryDescription {
    fileID: FileID;
};
export interface FileUploadUntrusted {
    stream: Readable;
    token: string;
};
