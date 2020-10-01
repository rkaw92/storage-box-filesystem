import { EntryType } from "./EntryType";

export interface Entry {
    filesystemID: string;
    entryID: string;
    parentID: string | null;
    name: string;
    entryType: EntryType;
    lastModified: Date;
};
