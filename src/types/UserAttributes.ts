export interface UserAttributes {
    issuer: string;
    attributes: { [key: string]: string[] };
};
