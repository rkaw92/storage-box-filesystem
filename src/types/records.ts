export type FilesystemRecordID = string;
export type EntryRecordID = string;

export interface FilesystemPermissionsRecord {
    filesystemID: string;
    issuer: string;
    subject: string;
    canRead: boolean;
    canWrite: boolean;
    canManage: boolean;
};

export interface EntryRecord {
    filesystemID: string;
    entryID: string;
    parentID: string | null;
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
};

export function isFileRecord(input: { [key: string]: any }): input is FileRecord {
    return (
        typeof input.filesystemID === 'string' &&
        typeof input.fileID === 'string'
    );
}