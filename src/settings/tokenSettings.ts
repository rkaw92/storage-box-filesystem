export const tokenSecret = process.env.JWT_SECRET!;
if (!tokenSecret) {
    throw new Error('Please pass the JWT_SECRET environment variable');
}
export const tokenAlgorithm = 'HS256';
