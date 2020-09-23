import { Entry } from "./Entry";

export interface DirectoryEntry extends Entry {
    entryType: "directory";
};

export function isDirectoryEntry(entry: Entry): entry is DirectoryEntry {
    return (entry.entryType === 'directory');
};
