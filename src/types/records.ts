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
    bytes: string;
};
