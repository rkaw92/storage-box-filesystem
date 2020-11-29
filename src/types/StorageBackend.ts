import { BackendObjectIdentification } from "./BackendObjectIdentification";
import { Readable } from 'stream';
type objectID = BackendObjectIdentification["backendURI"];
export type ContentDispositionType = "inline" | "attachment";
export type ContentType = string;

export interface StorageBackend {
    obtainObjectURI(): Promise<objectID> | objectID;
    uploadStream(URI: objectID, stream: Readable): Promise<void>;
    downloadStream(URI: objectID): Promise<Readable>;
    deleteFile(URI: objectID): Promise<void>;
};

export function supportsDownloadURLs(backend: any): backend is StorageBackendDownloadURLProvider {
    return (backend && typeof backend.getDownloadURL === 'function');
};

export interface StorageBackendDownloadURLProvider {
    getDownloadURL(URI: objectID, targetName: string, disposition?: ContentDispositionType, mimetype?: ContentType): Promise<string>;
};
