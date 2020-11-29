import { Client } from 'minio';
import { ContentDispositionType, StorageBackend, StorageBackendDownloadURLProvider } from '../../types/StorageBackend';
import * as uuid from 'uuid';
import { Readable } from 'stream';

export interface MinioConnectionParams {
    endPoint: string;
    port?: number;
    useSSL?: boolean;
    accessKey: string;
    secretKey: string;
};

export class MinioBackend implements StorageBackend, StorageBackendDownloadURLProvider {
    private client: Client;
    private bucketName: string;
    constructor({
        connection,
        bucketName
    }: {
        connection: MinioConnectionParams
        bucketName: string
    }) {
        this.client = new Client(connection);
        this.bucketName = bucketName;
    }

    obtainObjectURI() {
        return uuid.v4();
    }

    async uploadStream(URI: string, stream: Readable) {
        await this.client.putObject(this.bucketName, URI, stream);
    }

    async downloadStream(URI: string): Promise<Readable> {
        return this.client.getObject(this.bucketName, URI);
    }

    isDownloadURLSupportEnabled() {
        return true;
    }

    async getDownloadURL(URI: string, targetName: string, dispositionType: ContentDispositionType = 'inline', mimetype = 'application/octet-stream') {
        // TODO: Un-hardcode this expiration time
        return await this.client.presignedGetObject(this.bucketName, URI, 120, {
            'response-content-disposition': `${dispositionType}; filename=${targetName}`,
            'response-content-type': mimetype
        });
    }

    async deleteFile(URI: string) {
        return await this.client.removeObject(this.bucketName, URI);
    }
};
