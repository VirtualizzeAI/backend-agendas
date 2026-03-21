export async function healthRoutes(app) {
    app.get('/health', async () => {
        return {
            ok: true,
            service: 'minha-agenda-backend',
            timestamp: new Date().toISOString(),
        };
    });
}
