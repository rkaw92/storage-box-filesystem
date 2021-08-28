import { EntryID, FileID, ParentID } from "./IDs";

export class AppError extends Error {
    statusCode: number;
    data?: { [key: string]: any };
    constructor(message: string, statusCode: number = 500) {
        super(message);
        this.statusCode = statusCode;
        this.name = new.target.name;
        Error.captureStackTrace(this, new.target);
    }
};

export class Bug extends AppError {
    constructor(message: string) {
        super(`BUG: ${message}`, 500);
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
        super(`Insufficient permissions: to perform this action on the filesystem, you need permission ${permissionName}`, 403);
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

export class EntryNotFoundByNameError extends AppError {
    constructor(parentID: ParentID, name: string) {
        super(`Entry "${name}" not found in directory "${parentID}"`, 404);
        this.data = { parentID, name };
    }
};

export class FileNotFoundError extends AppError {
    constructor(fileID: FileID) {
        super(`File not found: ${fileID}`, 404);
        this.data = { fileID };
    }
};

export class FileAlreadyUploadedError extends AppError {
    constructor(fileID: FileID) {
        super(`File already uploaded - cannot overwrite: ${fileID}`, 409);
        this.data = { fileID };
    }
};

export class CannotDownloadDirectoryError extends AppError {
    constructor(entryID: EntryID) {
        super(`Entry ${entryID} is a directory and cannot be downloaded using this method`, 400);
        this.data = { entryID };
    }
};

export class CannotReplaceDirectoryWithFileError extends AppError {
    constructor(existingEntryID: EntryID) {
        super(`Entry ${existingEntryID} is a directory and cannot be replaced by a file`, 409);
        this.data = { existingEntryID };
    }
};

export class TargetIsNotDirectoryError extends AppError {
    constructor(targetEntryID: EntryID) {
        super(`Target entry ${targetEntryID} is not a directory`, 409);
        this.data = { targetEntryID };
    }
};

export class DirectoryCycleError extends AppError {
    constructor(entryID: EntryID, targetEntryID: EntryID) {
        super(`Cannot move entry ${entryID} into ${targetEntryID} - the target directory is a descendant of the moved entry`, 409);
        this.data = { targetEntryID };
    }
};

export class PermissionExistsError extends AppError {
    constructor() {
        super('A permission for this entry with the same criterion and same revocation criterion already exists');
    }
};

export class PermissionDoesNotExistError extends AppError {
    constructor() {
        super('A permission for this entry with the given criterion and revocation criterion does not exist');
    }
};
