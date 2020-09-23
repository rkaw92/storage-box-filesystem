export interface Entry {
    filesystemID: string;
    entryID: string;
    parentID: string | null;
    name: string;
    entryType: "file" | "directory";
    lastModified: Date;
};
