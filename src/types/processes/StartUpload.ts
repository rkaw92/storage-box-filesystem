import { FileUploadStart, FileDataUploadStart } from "../Inputs";
import { Entry } from "../Entry";
import { EntryID, FileID } from "../IDs";

export interface ItemPlan {
    origin: FileUploadStart;
    decision: "upload" | "duplicate";
};
export interface ItemWillUpload extends ItemPlan {
    decision: "upload";
    uploadStart: FileDataUploadStart;
};
export interface ItemIsDuplicate extends ItemPlan {
    decision: "duplicate";
    existingEntry: Entry;
};

export interface UploadTokenPayload {
    parentID: EntryID | null;
    name: string;
    fileID: FileID;
    replace: boolean;
};
export interface ItemOutput {
    decision: "upload" | "duplicate";
};
export interface ItemUploadStarted extends ItemOutput {
    decision: "upload";
    token: string;
};
export interface ItemUploadPreventedOnDuplicate {
    decision: "duplicate";
    existingEntry: Entry;
};
