// =========================================================================
// ☁️ 模块名称: functions/api/[[route]].js
// 🎯 模块功能: Cloudflare Pages Serverless 极简路由中枢
// 🛡️ 架构层级: Backend API Layer
// =========================================================================

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/', ''); // 提取纯净路径
    const method = request.method;

    // ---------------------------------------------------------------------
    // 🛡️ Layer 1: 边缘网络鉴权防线 (JWT / Token 拦截)
    // ---------------------------------------------------------------------
    const authHeader = request.headers.get('Authorization');
    // 注意：这里暂时写死了 'temp_token_for_now' 以匹配你目前 main.js 里的占位符
    // 等你 SSO 系统建好，把这里换成真正的 JWT 校验逻辑，或者匹配 env.API_SECRET
    if (authHeader !== 'Bearer temp_token_for_now' && authHeader !== `Bearer ${env.API_SECRET}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized: 边缘网络拒绝访问' }), { 
            status: 401, headers: { 'Content-Type': 'application/json' } 
        });
    }

    try {
        // -----------------------------------------------------------------
        // 🗂️ 路由 A: [GET /api/list] 拉取大厅索引 (查 KV)
        // -----------------------------------------------------------------
        if (path === 'list' && method === 'GET') {
            // 1. 拉取所有以 'meta_' 开头的笔记元数据
            const listData = await env.KV_STORE.list({ prefix: 'meta_' });
            const files = [];
            for (const key of listData.keys) {
                const value = await env.KV_STORE.get(key.name);
                if (value) files.push(value); // 此时 push 进去的是密文
            }
            
            // 2. 拉取标签树 (标签树我们暂定存明文 JSON，也可改为密文)
            const tags = await env.KV_STORE.get('global_tags', 'json') || [];
            
            return new Response(JSON.stringify({ files, tags }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // -----------------------------------------------------------------
        // 🏷️ 路由 B: [PUT /api/tags] 更新标签树 (写 KV)
        // -----------------------------------------------------------------
        if (path === 'tags' && method === 'PUT') {
            const body = await request.json();
            await env.KV_STORE.put('global_tags', JSON.stringify(body.tags));
            return new Response(JSON.stringify({ success: true }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }

        // -----------------------------------------------------------------
        // 📝 路由 C: 笔记实体流转 (动态路由解析 /api/note/:id)
        // -----------------------------------------------------------------
        if (path.startsWith('note/')) {
            const fileId = path.split('/');
            
            // ⬇️ [GET] 下载真身 (读 R2)
            if (method === 'GET') {
                const object = await env.R2_STORE.get(`note_${fileId}`);
                if (!object) {
                    return new Response(JSON.stringify({ error: '实体在暗网中丢失' }), { status: 404 });
                }
                const ciphertextR2 = await object.text();
                return new Response(JSON.stringify({ r2Payload: ciphertextR2 }), {
                    status: 200, headers: { 'Content-Type': 'application/json' }
                });
            }
            
            // ⬆️ [PUT] 双轨推流保存 (写 R2 + 写 KV)
            if (method === 'PUT') {
                const body = await request.json();
                // 1. 把加密的影子数据存入 KV (前缀 meta_)
                await env.KV_STORE.put(`meta_${fileId}`, body.metadata);
                // 2. 把加密的真身存入 R2 桶 (前缀 note_)
                await env.R2_STORE.put(`note_${fileId}`, body.r2Payload);
                
                return new Response(JSON.stringify({ success: true }), {
                    status: 200, headers: { 'Content-Type': 'application/json' }
                });
            }
            
            // 🧨 [DELETE] 物理抹除 (删 R2 + 删 KV)
            if (method === 'DELETE') {
                await env.KV_STORE.delete(`meta_${fileId}`);
                await env.R2_STORE.delete(`note_${fileId}`);
                return new Response(JSON.stringify({ success: true }), {
                    status: 200, headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // 如果都不匹配，返回 404
        return new Response(JSON.stringify({ error: '路由未命中' }), { 
            status: 404, headers: { 'Content-Type': 'application/json' } 
        });

    } catch (err) {
        // 全局错误捕获器
        return new Response(JSON.stringify({ error: err.message }), { 
            status: 500, headers: { 'Content-Type': 'application/json' } 
        });
    }
}
