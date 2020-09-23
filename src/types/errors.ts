import { EntryID, FileID } from "./IDs";

export class AppError extends Error {
    statusCode: number;
    data?: { [key: string]: any };
    constructor(message: string, statusCode: number = 500) {
        super(message);
        this.statusCode = statusCode;
        this.name = new.target.name;
    }
};

export class NoCapabilityError extends AppError {
    constructor(capability: string) {
        super(`Insufficient permissions: to perform this action, you need: [${capability}]`, 403);
        this.data = { capability };
    }
};

export class FilesystemNotFoundByAliasError extends AppError {
    constructor(alias: string) {
        super(`Filesystem not found by alias: ${alias}`, 404);
        this.data = { alias };
    }
};

export class NoFilesystemPermissionError extends AppError {
    constructor(permissionName: string) {
        super(`Insufficient permissions: to perform this action on the filesystem, you need permission ${permissionName}`);
        this.data = { permissionName };
    }
};

export class NoParentDirectoryError extends AppError {
    constructor(parentID: EntryID) {
        super(`The specified parent directory does not exist: ${parentID}`, 404);
    }
};

export class DuplicateEntryNameError extends AppError {
    constructor(parentID: EntryID | null, name: string) {
        super(`An entry named "${name}" already exists in parent ID ${parentID}`);
        this.data = { parentID, name };
    }
};

export class EntryNotFoundError extends AppError {
    constructor(entryID: EntryID) {
        super(`Entry not found: ${entryID}`, 404);
        this.data = { entryID };
    }
};

export class FileNotFoundError extends AppError {
    constructor(fileID: FileID) {
        super(`File not found: ${fileID}`, 404);
        this.data = { fileID };
    }
};

export class CannotDownloadDirectoryError extends AppError {
    constructor(entryID: EntryID) {
        super(`Entry ${entryID} is a directory and cannot be downloaded using this method`, 400);
        this.data = { entryID };
    }
};
