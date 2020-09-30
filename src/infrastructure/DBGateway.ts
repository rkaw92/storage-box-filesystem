import Knex from 'knex';
import { UserIdentification } from '../types/UserIdentification';
import { AppError, NoParentDirectoryError, DuplicateEntryNameError, FileNotFoundError, EntryNotFoundError } from '../types/errors';
import { FilesystemPermissionsRecord, FilesystemRecordID, FileRecord, EntryRecord } from '../types/records';
import { FilesystemPermissions } from '../types/FilesystemPermissions';
import { FilesystemID, EntryID, FileID } from '../types/IDs';
import { File } from '../types/File';
import { FileUploadStart, FileUploadStartWithBackend, FileUpload } from '../types/Inputs';
import { FileEntry } from '../types/FileEntry';
import { DirectoryEntry } from '../types/DirectoryEntry';
import { Entry } from '../types/Entry';

const SQL_FOREIGN_KEY_VIOLATION = '23503';
const SQL_UNIQUE_CONSTRAINT_VIOLATION = '23505';
const ONE_MINUTE = 60000;
const ONE_HOUR = ONE_MINUTE * 60;
const MINIMUM_BITS_PER_SECOND = 1000000;
const MINIMUM_BYTES_PER_SECOND = MINIMUM_BITS_PER_SECOND / 8;
const MINIMUM_TIME = 5 * ONE_MINUTE;

export class DBGateway {
    private db: Knex;
    constructor(db: Knex) {
        this.db = db;
    }

    private getSequenceNameForFilesystem(filesystemID: FilesystemRecordID) {
        return `fs_seq_${filesystemID}`;
    }

    private getSequenceNameForFiles(filesystemID: FilesystemRecordID) {
        return `files_seq_${filesystemID}`;
    }

    private async obtainValueFromSequence(connection: Knex, sequenceName: string) {
        const nextvals = await connection.select(connection.raw('nextval(\'??\') AS "value"', [ sequenceName ]));
        return nextvals[0].value;
    }

    private async obtainValuesFromSequence(connection: Knex, sequenceName: string, count: number) {
        const nextvals: Array<{ nextval: string }> = await connection.select(connection.raw('nextval(\'??\') AS "nextval" FROM generate_series(1,?)', [ sequenceName, count ]));
        return nextvals.map(({ nextval }) => nextval);
    }

    async listFilesystems(user: UserIdentification) {
        const filesystems = await this.db('filesystem_permissions')
            .select('filesystem_permissions.filesystemID', 'name', 'alias')
            .leftJoin('filesystems', 'filesystem_permissions.filesystemID', 'filesystems.filesystemID')
            .where({
                issuer: user.issuer,
                subject: user.subject,
                canRead: true
            });
        return filesystems;
    }

    async findFilesystem(query: { [key: string]: string }) {
        const matchingFilesystems = await this.db('filesystems').select('filesystemID', 'name', 'alias').where(query);
        if (matchingFilesystems.length === 0) {
            return null;
        } else if (matchingFilesystems.length === 1) {
            return matchingFilesystems[0];
        } else {
            throw new AppError('Multiple filesystems match the query - this should not happen');
        }
    }

    async createFilesystem(initialManager: UserIdentification, name: string, alias: string) {
        const self = this;
        return await this.db.transaction(async function(transaction) {
            const filesystemID = await self.obtainValueFromSequence(transaction, 'filesystems_seq');
            await transaction('filesystems').insert({
                filesystemID: filesystemID,
                name: name,
                alias: alias
            });
            await transaction('filesystem_permissions').insert({
                filesystemID: filesystemID,
                issuer: initialManager.issuer,
                subject: initialManager.subject,
                canRead: true,
                canWrite: true,
                canManage: true
            });
            const sequenceNames = [
                self.getSequenceNameForFilesystem(filesystemID),
                self.getSequenceNameForFiles(filesystemID)
            ];
            for (let sequenceName of sequenceNames) {
                await transaction.raw('CREATE SEQUENCE ??', sequenceName);
            }
            
            return {
                filesystemID,
                name,
                alias
            };
        });
    }

    async getFilesystemPermissions(user: UserIdentification, filesystemID: FilesystemID): Promise<FilesystemPermissions> {
        const permissionRows: FilesystemPermissionsRecord[] = await this.db('filesystem_permissions')
            .select('canRead', 'canWrite', 'canManage')
            .where({
                issuer: user.issuer,
                subject: user.subject,
                filesystemID: filesystemID
            });
        if (permissionRows.length === 0) {
            return {
                canRead: false,
                canWrite: false,
                canManage: false
            };
        } else if (permissionRows.length === 1) {
            return permissionRows[0];
        } else {
            throw new AppError('Multiple permission entries for one filesystemID - this should not be possible');
        }
    }

    async createDirectory(filesystemID: FilesystemID, parentID: EntryID | null, name: string) {
        const entryID = await this.obtainValueFromSequence(this.db, this.getSequenceNameForFilesystem(filesystemID));
        const entry = {
            filesystemID: filesystemID,
            entryID: entryID,
            parentID: parentID,
            name: name,
            entryType: 'directory',
            lastModified: new Date()
        };
        try {
            await this.db('entries').insert(entry);
            return entry;
        } catch (error) {
            if (error.code === SQL_FOREIGN_KEY_VIOLATION) {
                throw new NoParentDirectoryError(parentID!);
            }
            if (error.code === SQL_UNIQUE_CONSTRAINT_VIOLATION) {
                if (error.constraint === 'entries_unique_name') {
                    throw new DuplicateEntryNameError(parentID, name);
                }
            }
            throw error;
        }
    }

    async listDirectory(filesystemID: FilesystemID, directoryID: EntryID | null) {
        return await this.db('entries')
            .select('entryID', 'entryType', 'name', 'fileID', 'lastModified')
            .where({
                filesystemID: filesystemID,
                parentID: directoryID
            });
    }

    async createFileRecords(filesystemID: FilesystemID, files: FileUploadStartWithBackend[]) {
        const self = this;
        if (files.length === 0) {
            return [];
        }
        const totalBytes = files.reduce((sum, currentFile) => sum + currentFile.bytes, 0);
        const secondsAllowedToFinishUpload = Math.ceil(totalBytes / MINIMUM_BYTES_PER_SECOND) + MINIMUM_TIME;
        return await this.db.transaction(async function(transaction) {
            const fileIDs = await self.obtainValuesFromSequence(transaction, self.getSequenceNameForFiles(filesystemID), files.length);
            const expiryDate = new Date(Date.now() + secondsAllowedToFinishUpload * 1000);
            const fileRecords = files.map((upload, index) => ({
                filesystemID: filesystemID,
                fileID: fileIDs[index],
                referenceCount: 0,
                backendID: upload.backendID,
                backendURI: upload.backendURI,
                expires: expiryDate
            }));
            await transaction('files').insert(fileRecords);
            return fileRecords;
        });
    }

    private entryFromRecord(record: EntryRecord): Entry {
        if (record.entryType === 'file') {
            if (record.fileID === null) {
                throw new TypeError('An entry exists with a type of "file" but no fileID - this should be impossible');
            }
            return record;
        } else if (record.entryType === 'directory') {
            return record;
        } else {
            throw new TypeError('Unknown entry type: ' + record.entryType);
        }
    }

    async getEntry(filesystemID: FilesystemID, entryID: EntryID) {
        const record: EntryRecord | undefined = await this.db('entries')
            .first('filesystemID', 'entryID', 'parentID', 'name', 'entryType', 'fileID', 'lastModified')
            .where({
                filesystemID: filesystemID,
                entryID: entryID
            });
        if (!record) {
            throw new EntryNotFoundError(entryID);
        }
        const entry: Entry = this.entryFromRecord(record);
        return entry;
    }

    async getFile(filesystemID: FilesystemID, fileID: FileID) {
        const record: FileRecord | undefined = await this.db('files')
            .first('filesystemID', 'fileID', 'referenceCount', 'backendID', 'backendURI', 'expires', 'bytes')
            .where({
                filesystemID: filesystemID,
                fileID: fileID
            });
        if (!record) {
            throw new FileNotFoundError(fileID);
        }
        const file: File = {
            filesystemID: record.filesystemID,
            fileID: record.fileID,
            referenceCount: BigInt(record.referenceCount),
            expires: record.expires,
            bytes: BigInt(record.bytes),
            backendID: record.backendID,
            backendURI: record.backendURI
        };
        return file;
    }

    async finishFileUpload(filesystemID: FilesystemID, upload: FileUpload) {
        const self = this;
        const entryID = await this.obtainValueFromSequence(this.db, this.getSequenceNameForFilesystem(filesystemID));
        const entryRecord = {
            filesystemID: filesystemID,
            entryID: entryID,
            parentID: upload.parentID,
            name: upload.name,
            entryType: 'file',
            fileID: upload.fileID
        };
        try {
            await this.db.transaction(async function(transaction) {
                await transaction('files').update({
                    expires: null
                }).where({
                    filesystemID: filesystemID,
                    fileID: upload.fileID
                });
                await transaction('entries').insert(entryRecord);
            });
            return entryRecord;
        } catch (error) {
            if (error.code === SQL_FOREIGN_KEY_VIOLATION) {
                throw new NoParentDirectoryError(upload.parentID!);
            }
            if (error.code === SQL_UNIQUE_CONSTRAINT_VIOLATION) {
                if (error.constraint === 'entries_unique_name') {
                    throw new DuplicateEntryNameError(upload.parentID, upload.name);
                }
            }
            throw error;
        }
    }
};
