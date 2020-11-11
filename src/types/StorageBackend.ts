import { BackendObjectIdentification } from "./BackendObjectIdentification";
import { Readable } from 'stream';
type objectID = BackendObjectIdentification["backendURI"];

export interface StorageBackend {
    obtainObjectURI(): Promise<objectID> | objectID;
    uploadStream(URI: objectID, stream: Readable): Promise<void>;
    getDownloadURL(URI: objectID, targetName: string): Promise<string>;
    deleteFile(URI: objectID): Promise<void>;
};
