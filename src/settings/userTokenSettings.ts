export const tokenSecret = process.env.USER_TOKEN_SECRET!;
if (!tokenSecret) {
    throw new Error('Please pass the USER_TOKEN_SECRET environment variable');
}
export const tokenAlgorithm = 'HS256';
