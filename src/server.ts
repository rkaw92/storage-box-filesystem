import fastify from 'fastify';
import cookieMiddleware from 'fastify-cookie';
import corsMiddleware from 'fastify-cors';
import devRoutes from './dev-routes';
import filesystemsRoutes from './routes/filesystems-routes';
import filesystemRoutes from './routes/filesystem-routes';
import userContextHook from './hooks/userContextHook';
import { getDBGateway } from './infrastructure/db';
import { UserContext } from './types/UserContext';
import { Filesystems } from './Filesystems';
import { FilesystemFactory } from './Filesystem';
import { MinioBackend } from './infrastructure/backends/MinioBackend';
import { SingleStorageBackendManager } from './infrastructure/SingleStorageBackendManager';
import { UploadTokenHandler } from './infrastructure/uploadTokens';
import { FileCleanup } from './FileCleanup';

declare module "fastify" {
    interface FastifyRequest {
        userContext?: UserContext;
    }
}

const db = getDBGateway();
const backend = new MinioBackend({
    connection: {
        endPoint: process.env.MINIO_ENDPOINT || 'localhost',
        port: Number(process.env.MINIO_PORT) || 9000,
        useSSL: false,
        accessKey: process.env.MINIO_ACCESS_KEY!,
        secretKey: process.env.MINIO_SECRET_KEY!
    },
    bucketName: process.env.MINIO_BUCKET_NAME!
});
const backendManager = new SingleStorageBackendManager(backend);
const filesystems = new Filesystems({ db });
const filesystemFactory = new FilesystemFactory({
    db,
    storageBackendSelector: backendManager,
    storageBackendRepository: backendManager,
    uploadTokenHandler: new UploadTokenHandler({
        secret: process.env.UPLOAD_TOKEN_SECRET!
    })
});
const app = fastify({
    logger: true
});
app.register(cookieMiddleware, {});
app.register(corsMiddleware, {
    origin: process.env.HTTP_ALLOW_ORIGINS ? process.env.HTTP_ALLOW_ORIGINS.split(',') : false
});
app.decorateRequest('userContext', undefined);
app.addHook('onRequest', userContextHook);
app.register(devRoutes(), {
    prefix: '/dev'
});
app.register(filesystemsRoutes({ filesystems }))
app.register(filesystemRoutes({ filesystemFactory }));
app.listen(Number(process.env.HTTP_PORT || 3001));

// TODO: Move the cleanup component to a separate runnable.
const cleanupComponent = new FileCleanup({
    db,
    storageBackendRepository: backendManager
});
// TODO: Customize the interval via config
setInterval(function() {
    cleanupComponent.cleanup();
}, 15000);