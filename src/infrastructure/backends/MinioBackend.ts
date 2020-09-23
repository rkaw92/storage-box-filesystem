import { Client } from 'minio';
import { StorageBackend } from '../../types/StorageBackend';
import * as uuid from 'uuid';
import { Readable } from 'stream';

export interface MinioConnectionParams {
    endPoint: string;
    port?: number;
    useSSL?: boolean;
    accessKey: string;
    secretKey: string;
};

export class MinioBackend implements StorageBackend {
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

    async getDownloadURL(URI: string, targetName: string) {
        // TODO: Un-hardcode this expiration time
        return await this.client.presignedGetObject(this.bucketName, URI, 120, {
            'response-content-disposition': `attachment; filename=${targetName}`
        });
    }
};
