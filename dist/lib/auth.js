import { createUserScopedClient } from './supabase.js';
export function extractBearerToken(request) {
    const header = request.headers.authorization;
    if (!header)
        return null;
    const [type, token] = header.split(' ');
    if (type?.toLowerCase() !== 'bearer' || !token)
        return null;
    return token;
}
export async function requireUserFromRequest(request) {
    const token = extractBearerToken(request);
    if (!token) {
        throw new Error('missing_token');
    }
    const supabase = createUserScopedClient(token);
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
        throw new Error('invalid_token');
    }
    return {
        token,
        user: data.user,
        supabase,
    };
}
