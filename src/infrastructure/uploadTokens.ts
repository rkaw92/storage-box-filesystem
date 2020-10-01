import * as jwt from 'jsonwebtoken';
import { UploadTokenPayload } from '../types/processes/StartUpload';

function isTokenPayload(verificationResult: string | object): verificationResult is { upload: UploadTokenPayload } {
    if (typeof verificationResult === 'string') {
        return false;
    }
    const resultAsMap = verificationResult as { [key: string]: any };
    const upload = resultAsMap.upload;
    if (!upload || typeof upload !== 'object') {
        return false;
    }
    return (
        (typeof upload.parentID === 'string' || upload.parentID === null) &&
        (typeof upload.name === 'string') &&
        (typeof upload.fileID === 'string')
    );
}

export class UploadTokenHandler {
    private secret: string;
    private algorithm: jwt.Algorithm;
    constructor({ secret, algorithm = 'HS256' }: { secret: string, algorithm?: jwt.Algorithm }) {
        this.secret = secret;
        this.algorithm = algorithm;
    }

    sign(upload: UploadTokenPayload) {
        return jwt.sign({ upload }, this.secret, { algorithm: this.algorithm });
    }

    verify(token: string): UploadTokenPayload {
        const payload = jwt.verify(token, this.secret, { algorithms: [ this.algorithm ] });
        if (isTokenPayload(payload)) {
            return payload.upload;
        } else {
            throw new TypeError('Malformed token payload');
        }
    }
};
