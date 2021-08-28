import Knex from 'knex';
import { UserIdentification } from '../types/UserIdentification';
import { AppError, NoParentDirectoryError, DuplicateEntryNameError, FileNotFoundError, EntryNotFoundError, EntryNotFoundByNameError, PermissionExistsError, PermissionDoesNotExistError } from '../types/errors';
import { FilesystemPermissionsRecord, FilesystemRecordID, FileRecord, EntryRecord } from '../types/records';
import { AttributeBasedCriterion } from "../types/AttributeBasedCriterion";
import { FilesystemPermissions } from '../types/FilesystemPermissions';
import { FilesystemID, EntryID, FileID, ParentID } from '../types/IDs';
import { File } from '../types/File';
import { FileDataUploadStart, FileUpload } from '../types/Inputs';
import { FileEntry } from '../types/FileEntry';
import { DirectoryEntry } from '../types/DirectoryEntry';
import { Entry } from '../types/Entry';
import { UserAttributes } from '../types/UserAttributes';
import { EntryPermissions } from '../types/EntryPermissions';
import { EntryType } from '@rkaw92/storage-box-interfaces';

const SQL_FOREIGN_KEY_VIOLATION = '23503';
const SQL_UNIQUE_CONSTRAINT_VIOLATION = '23505';
const ONE_MINUTE = 60000;
const ONE_HOUR = ONE_MINUTE * 60;
const MINIMUM_BITS_PER_SECOND = 1000000;
const MINIMUM_BYTES_PER_SECOND = MINIMUM_BITS_PER_SECOND / 8;
const MINIMUM_TIME = 5 * ONE_MINUTE;

const entryColumns = [ 'filesystemID', 'entryID', 'parentID', 'path', 'name', 'entryType', 'fileID', 'lastModified' ];
const entryPermissionsPrimaryKey = [ 'filesystemID', 'entryID', 'issuer', 'attribute', 'value', 'issuerForRevocation', 'attributeForRevocation', 'valueForRevocation' ];
const fileColumns = [ 'filesystemID', 'fileID', 'referenceCount', 'backendID', 'backendURI', 'expires', 'uploadFinished', 'bytes', 'mimetype' ];

function applyAttributeBasedWhere(query: Knex.QueryBuilder<any>, user: UserAttributes) {
    for (const [ attribute, values ] of Object.entries(user.attributes)) {
        query.orWhere(function() {
            this.where({ attribute: attribute }).andWhereRaw('value = ANY(?)', [ values ]);
        });
    }
}

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

    private getPartitionName(parentName: string, filesystemID: FilesystemRecordID) {
        return `${parentName}_${filesystemID}`;
    }

    private async obtainValueFromSequence(connection: Knex, sequenceName: string) {
        const nextvals = await connection.select(connection.raw('nextval(\'??\') AS "value"', [ sequenceName ]));
        return nextvals[0].value;
    }

    private async obtainValuesFromSequence(connection: Knex, sequenceName: string, count: number) {
        const nextvals: Array<{ nextval: string }> = await connection.select(connection.raw('nextval(\'??\') AS "nextval" FROM generate_series(1,?)', [ sequenceName, count ]));
        return nextvals.map(({ nextval }) => nextval);
    }

    private getFilesystemPermissionSubquery(user: UserAttributes, permissions: Partial<FilesystemPermissions>) {
        return this.db('filesystem_permissions').select('filesystemID').where({
            issuer: user.issuer,
            ...permissions
        }).andWhere(function() {
            // I'm not too fond of the mutation+"this" based API. Here's why:
            applyAttributeBasedWhere(this, user);
        });
    }

    async listFilesystems(user: UserAttributes) {
        const filesystems = await this.db('filesystems')
            .select('filesystemID', 'name', 'alias')
            .whereIn('filesystemID', this.getFilesystemPermissionSubquery(user, { canRead: true }))
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

    async createFilesystem(initialPermissionsFor: AttributeBasedCriterion[], name: string, alias: string) {
        const self = this;
        return await this.db.transaction(async function(transaction) {
            const filesystemID = await self.obtainValueFromSequence(transaction, 'filesystems_seq');
            await transaction('filesystems').insert({
                filesystemID: filesystemID,
                name: name,
                alias: alias
            });
            
            await transaction('filesystem_permissions').insert(initialPermissionsFor.map(({ issuer, attribute, value }) => ({
                filesystemID: filesystemID,
                issuer: issuer,
                attribute: attribute,
                value: value,
                canRead: true,
                canWrite: true,
                canShare: true,
                canManage: true
            })));
            const sequenceNames = [
                self.getSequenceNameForFilesystem(filesystemID),
                self.getSequenceNameForFiles(filesystemID)
            ];
            for (let sequenceName of sequenceNames) {
                await transaction.raw('CREATE SEQUENCE ??', sequenceName);
            }
            for (let parentName of [ 'entries', 'entry_permissions', 'files', 'files_derivatives' ]) {
                // NOTE: We need to flatten this to a string because otherwise we'd get a "prepared statement" with a placeholder like $1 and these do not play well with CREATE TABLE.
                // Mildly related: https://github.com/knex/knex/issues/1207
                const partitionCreationSQL = transaction.raw('CREATE TABLE ?? PARTITION OF ?? FOR VALUES IN (?)', [ self.getPartitionName(parentName, filesystemID), parentName, filesystemID ]).toString();
                await transaction.raw(partitionCreationSQL);
            }
            // Add a trigger to our new partition - BEFORE triggers must be added manually since they cannot be created on partition parents.
            // TODO: This restriction is supposedly lifted in PostgreSQL 13.x - check and decide whether we should require Postgres 13.
            await transaction.raw('CREATE TRIGGER entries_path_initial BEFORE INSERT OR UPDATE OF "parentID" ON ?? FOR EACH ROW EXECUTE FUNCTION compute_path_initial()', [ self.getPartitionName('entries', filesystemID) ]);
            return {
                filesystemID,
                name,
                alias
            };
        });
    }

    async getFilesystemPermissions(user: UserAttributes, filesystemID: FilesystemID): Promise<FilesystemPermissions> {
        const permissionRow: Record<keyof FilesystemPermissions,number | null> | null = await this.db('filesystem_permissions')
            .first(
                // Ask for 1 if any record has canRead = true, 0 if none of the records; NULL if we get no records that match.
                this.db.raw('MAX("canRead"::int) AS "canRead"'),
                this.db.raw('MAX("canWrite"::int) AS "canWrite"'),
                this.db.raw('MAX("canShare"::int) AS "canShare"'),
                this.db.raw('MAX("canManage"::int) AS "canManage"')
            ).where({
                issuer: user.issuer,
                filesystemID: filesystemID
            }).andWhere(function() {
                applyAttributeBasedWhere(this, user);
            })
        if (permissionRow) {
            return {
                // We need type conversion because we get 0, 1 or NULL from SQL.
                canRead: Boolean(permissionRow.canRead),
                canWrite: Boolean(permissionRow.canWrite),
                canShare: Boolean(permissionRow.canShare),
                canManage: Boolean(permissionRow.canManage)
            };
        } else {
            throw new AppError(`No permission rows were retrieved from query for filesystemID ${filesystemID} - this should not be possible`);
        }
    }

    async getEntryPermissions(user: UserAttributes, filesystemID: FilesystemID, entryID: EntryID): Promise<EntryPermissions> {
        const entry = await this.getEntry(filesystemID, entryID);
        return this.getEntryPermissionsByPath(user, filesystemID, entry.path);
    }

    async getParentPermissions(user: UserAttributes, filesystemID: FilesystemID, entryID: EntryID): Promise<EntryPermissions> {
        const entry = await this.getEntry(filesystemID, entryID);
        // Cut off the last element, which is the entry's own ID.
        // If we're evaluating an entry in the root of the filesystem, this will leave an empty array,
        //  which is fine (we'll never have an entry permission for this, a filesystem-level permission is necessary then).
        return this.getEntryPermissionsByPath(user, filesystemID, entry.path.slice(0, -1));
    }

    async getEntryPermissionsByPath(user: UserAttributes, filesystemID: FilesystemID, path: EntryID[]): Promise<EntryPermissions> {
        const permissionRow: Record<keyof FilesystemPermissions,number | null> | null = await this.db('entry_permissions')
            .first(
                // Ask for 1 if any record has canRead = true, 0 if none of the records; NULL if we get no records that match.
                this.db.raw('MAX("canRead"::int) AS "canRead"'),
                this.db.raw('MAX("canWrite"::int) AS "canWrite"'),
                this.db.raw('MAX("canShare"::int) AS "canShare"')
            ).where({
                issuer: user.issuer,
                filesystemID: filesystemID
            })
            .andWhereRaw('"entryID" = ANY(?)', [ path ])
            .andWhere(function() {
                applyAttributeBasedWhere(this, user);
            });
            if (permissionRow) {
                return {
                    // We need type conversion because we get 0, 1 or NULL from SQL.
                    canRead: Boolean(permissionRow.canRead),
                    canWrite: Boolean(permissionRow.canWrite),
                    canShare: Boolean(permissionRow.canShare)
                };
            } else {
                throw new AppError(`No permission rows were retrieved from query for entry path ${path.join(',')} in filesystemID ${filesystemID} - this should not be possible`);
            }
    }

    async createDirectory(filesystemID: FilesystemID, parentID: EntryID | null, name: string) {
        const entryID = await this.obtainValueFromSequence(this.db, this.getSequenceNameForFilesystem(filesystemID));
        const entry = {
            filesystemID: filesystemID,
            entryID: entryID,
            parentID: parentID,
            name: name,
            entryType: <EntryType>'directory',
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
                if (error.constraint === `entries_${filesystemID}_filesystemID_parentID_name_key` || error.constraint === `entries_${filesystemID}_filesystemID_expr_name_idx`) {
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

    async createFileRecords(filesystemID: FilesystemID, files: FileDataUploadStart[]): Promise<FileRecord[]> {
        const self = this;
        if (files.length === 0) {
            return [];
        }
        const totalBytes = files.reduce((sum, currentFile) => sum + currentFile.bytes, 0);
        const secondsAllowedToFinishUpload = Math.ceil(totalBytes / MINIMUM_BYTES_PER_SECOND) + MINIMUM_TIME;
        return await this.db.transaction(async function(transaction) {
            const fileIDs = await self.obtainValuesFromSequence(transaction, self.getSequenceNameForFiles(filesystemID), files.length);
            // TODO: Decisions like the expiry time should probably be taken in a higher layer, not the DAL.
            const expiryDate = new Date(Date.now() + secondsAllowedToFinishUpload * 1000);
            const fileRecords: FileRecord[] = files.map((upload, index) => ({
                filesystemID: filesystemID,
                fileID: fileIDs[index],
                referenceCount: '0',
                backendID: upload.backendID,
                backendURI: upload.backendURI,
                expires: expiryDate,
                uploadFinished: false,
                bytes: upload.bytes.toString(10),
                mimetype: upload.type
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

    private fileFromRecord(record: FileRecord): File {
        return {
            filesystemID: record.filesystemID,
            fileID: record.fileID,
            referenceCount: BigInt(record.referenceCount),
            expires: record.expires,
            uploadFinished: record.uploadFinished,
            bytes: BigInt(record.bytes),
            mimetype: record.mimetype,
            backendID: record.backendID,
            backendURI: record.backendURI
        };
    }

    async getEntriesByPaths(filesystemID: FilesystemID, paths: Array<{ parentID: ParentID, name: string }>): Promise<Entry[]> {
        const uniqueParentIDs = new Set(paths.map((path) => path.parentID));
        let query;
        if (uniqueParentIDs.size === 1) {
            // Use a simpler query - likely to be optimized by the DB by looking into just 1 branch of the B-tree:
            query = this.db('entries')
                .select(entryColumns)
                .where({
                    filesystemID: filesystemID,
                    parentID: [...uniqueParentIDs.values()][0]
                }).whereIn('name', paths.map((path) => path.name));
        } else {
            query = this.db('entries')
                .select(entryColumns)
                .where({
                    filesystemID: filesystemID
                }).andWhere(function() {
                    for (let path of paths) {
                        this.orWhere({
                            parentID: path.parentID,
                            name: path.name
                        });
                    }
                });
        }
        const records: EntryRecord[] = await query;
        return records.map((record) => this.entryFromRecord(record));
    }

    async getEntry(filesystemID: FilesystemID, entryID: EntryID) {
        const record: EntryRecord | undefined = await this.db('entries')
            .first(entryColumns)
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
            .first(fileColumns)
            .where({
                filesystemID: filesystemID,
                fileID: fileID
            });
        if (!record) {
            throw new FileNotFoundError(fileID);
        }
        const file: File = this.fileFromRecord(record);
        return file;
    }

    private async _deleteEntry(transaction: Knex.Transaction, filesystemID: FilesystemID, entryID: EntryID) {
        await transaction('entries').where({
            filesystemID: filesystemID,
            entryID: entryID
        }).delete();
    }

    async deleteEntry(filesystemID: FilesystemID, entryID: EntryID) {
        const self = this;
        return await self.db.transaction(async function(transaction) {
            await self._deleteEntry(transaction, filesystemID, entryID);
        });
    }

    private async _deleteFileEntryByName(transaction: Knex.Transaction, filesystemID: FilesystemID, parentID: EntryID | null, name: string) {
        // Find the entry and its corresponding file:
        const entryRecord = await transaction<EntryRecord>('entries').where({
            filesystemID: filesystemID,
            parentID: parentID,
            name: name,
            entryType: 'file'
        }).first();
        if (!entryRecord) {
            throw new EntryNotFoundByNameError(parentID, name);
        }
        await this._deleteEntry(transaction, filesystemID, entryRecord.entryID);
    }

    private async createFileEntry(transaction: Knex.Transaction, filesystemID: FilesystemID, parentID: EntryID | null, name: string, fileID: FileID, replace = false) {
        const entryID = await this.obtainValueFromSequence(this.db, this.getSequenceNameForFilesystem(filesystemID));
        const entryRecord = {
            filesystemID: filesystemID,
            entryID: entryID,
            parentID: parentID,
            name: name,
            entryType: <"file">'file',
            fileID: fileID
        };
        if (replace) {
            try {
                await this._deleteFileEntryByName(transaction, filesystemID, parentID, name);
            } catch (error) {
                // Ignore errors that say the file is already deleted:
                if (!(error instanceof EntryNotFoundByNameError)) {
                    throw error;
                }
            }
        }
        await transaction('entries').insert(entryRecord);
        return entryRecord;
    }

    async finishFileUpload(filesystemID: FilesystemID, upload: FileUpload) {
        const self = this;
        try {
            return await self.db.transaction(async function(transaction) {
                await transaction('files').update({
                    expires: null,
                    uploadFinished: true
                }).where({
                    filesystemID: filesystemID,
                    fileID: upload.fileID
                });
                return self.createFileEntry(transaction, filesystemID, upload.parentID, upload.name, upload.fileID, upload.replace)
            });
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

    async processExpiredFiles(processingFunction: (file: File) => Promise<void>, limit = 20, date = new Date()) {
        const self = this;
        await self.db.transaction(async function(transaction) {
            const fileRecords: Array<FileRecord> = await transaction('files')
                .select(fileColumns)
                .forUpdate()
                .where('referenceCount', '=', '0')
                .andWhere('expires', '<=', date)
                .limit(limit);
            await Promise.all(fileRecords.map(async function(record) {
                const file = self.fileFromRecord(record);
                try {
                    await processingFunction(file);
                    await transaction('files').delete().where({
                        filesystemID: file.filesystemID,
                        fileID: file.fileID
                    });
                } catch (_error) {
                    // TODO: How do we report failure?
                }
            }));
        });
    }

    async moveEntry(filesystemID: FilesystemID, entryID: EntryID, targetParentID: EntryID | null) {
        await this.db('entries').update({
            parentID: targetParentID
        }).where({
            filesystemID: filesystemID,
            entryID: entryID
        });
    }

    async upsertEntryPermissions(filesystemID: FilesystemID, entryID: EntryID, criterion: AttributeBasedCriterion, permissions: EntryPermissions, revocationCriterion: AttributeBasedCriterion, comment: string | null) {
        await this.db('entry_permissions').insert({
            filesystemID: filesystemID,
            entryID: entryID,
            issuer: criterion.issuer,
            attribute: criterion.attribute,
            value: criterion.value,
            canRead: permissions.canRead,
            canWrite: permissions.canWrite,
            canShare: permissions.canShare,
            issuerForRevocation: revocationCriterion.issuer,
            attributeForRevocation: revocationCriterion.attribute,
            valueForRevocation: revocationCriterion.value,
            comment: comment
        }).onConflict(entryPermissionsPrimaryKey).merge();
    }

    async deleteEntryPermissions(filesystemID: FilesystemID, entryID: EntryID, criterion: AttributeBasedCriterion, revocationCriterion: AttributeBasedCriterion) {
        const deletedCount = await this.db('entry_permissions').delete().where({
            filesystemID: filesystemID,
            entryID: entryID,
            issuer: criterion.issuer,
            attribute: criterion.attribute,
            value: criterion.value,
            issuerForRevocation: revocationCriterion.issuer,
            attributeForRevocation: revocationCriterion.attribute,
            valueForRevocation: revocationCriterion.value
        });
        if (deletedCount === 0) {
            throw new PermissionDoesNotExistError();
        }
    }
};
