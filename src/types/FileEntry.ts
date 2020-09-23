import { Entry } from "./Entry";

export interface FileEntry extends Entry {
    entryType: "file";
    fileID: string;
};

export function isFileEntry(entry: Entry): entry is FileEntry {
    return (entry.entryType === 'file' && typeof (entry as any).fileID === 'string');
};