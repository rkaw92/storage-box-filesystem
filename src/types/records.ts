import { AttributeSelector } from "./AttributeSelector";
import { FilesystemPermissions } from "./FilesystemPermissions";

export type FilesystemRecordID = string;
export type EntryRecordID = string;

export interface FilesystemPermissionsRecord extends FilesystemPermissions, AttributeSelector {
    filesystemID: string;
};

export interface EntryRecord {
    filesystemID: string;
    entryID: string;
    parentID: string | null;
    path: string[];
    name: string;
    entryType: "file" | "directory";
    fileID?: string;
    lastModified: Date;
};

export interface FileRecord {
    filesystemID: string;
    fileID: string;
    referenceCount: string;
    backendID: string;
    backendURI: string;
    expires: Date;
    uploadFinished: boolean;
    bytes: string;
    mimetype: string;
};

export function isFileRecord(input: { [key: string]: any }): input is FileRecord {
    return (
        typeof input.filesystemID === 'string' &&
        typeof input.fileID === 'string'
    );
}
