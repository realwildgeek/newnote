// =========================================================================
// ☁️ 模块名称: functions/api/[[route]].js
// 🎯 模块功能: Cloudflare Pages Serverless (上帝之眼双键版)
// =========================================================================

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/', '');
    const method = request.method;

    // 🛡️ Layer 1: JWT 防线
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== 'Bearer temp_token_for_now') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    try {
        // 🗂️ [GET /api/list] 瞬间拉取全量双键索引
        if (path === 'list' && method === 'GET') {
            const filesCipher = await env.KV_STORE.get('global_files') || "";
            // 🚨 修复点：不再用 'json' 模式解析，直接把密文字符串拿出来
            const tagsCipher = await env.KV_STORE.get('global_tags') || ""; 
            return new Response(JSON.stringify({ filesCipher, tagsCipher }), { status: 200 });
        }

        // 🗂️ [PUT /api/list] 全量覆盖文件索引黑盒
        if (path === 'list' && method === 'PUT') {
            const body = await request.json();
            await env.KV_STORE.put('global_files', body.filesCipher);
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }

        // 🏷️ [PUT /api/tags] 全量覆盖标签树
        if (path === 'tags' && method === 'PUT') {
            const body = await request.json();
            // 🚨 修复点：直接把前端传来的密文存进去
            await env.KV_STORE.put('global_tags', body.tagsCipher);
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }

        // 📝 路由: R2 实体专线 (只管文件本体，不管 KV 目录)
        if (path.startsWith('note/')) {
            const fileId = path.split('/').pop(); // 🚨 修复点 1：必须加上 才能正确提取字符串 ID
            if (method === 'GET') {
                const object = await env.R2_STORE.get(fileId); // 连 note_ 前缀都省了，直接用 32 位哈希
                if (!object) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
                return new Response(JSON.stringify({ r2Payload: await object.text() }), { status: 200 });
            }
            if (method === 'PUT') {
                const body = await request.json();
                await env.R2_STORE.put(fileId, body.r2Payload);
                return new Response(JSON.stringify({ success: true }), { status: 200 });
            }
            if (method === 'DELETE') {
                await env.R2_STORE.delete(fileId);
                return new Response(JSON.stringify({ success: true }), { status: 200 });
            }
        }
        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
