// =========================================================================
// ☁️ 模块名称: storage.js
// 🎯 模块功能: 零知识云端通信引擎 (R2 + KV 双轨盲化版)
// 🛡️ 架构层级: Network / Data Layer
// =========================================================================

import { getSession } from './auth.js';
import { CryptoCore } from './crypto.js'; // 完美复用你现有的密码引擎

// -------------------------------------------------------------------------
// 🧬 内部工具：轻量级 YAML Frontmatter 引擎
// -------------------------------------------------------------------------
function buildFrontmatter(metaInfo) {
    return `---
title: ${metaInfo.title || "无标题"}
tags: [${metaInfo.tags ? metaInfo.tags.join(', ') : ''}]
updatedAt: ${metaInfo.updatedAt || ""}
---
`;
}

function parseFrontmatter(rawText) {
    const match = rawText.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (match) {
        return { content: match.trimStart() };
    }
    return { content: rawText };
}

// -------------------------------------------------------------------------
// 🔌 内部工具：带鉴权的极客 Fetch 封装
// -------------------------------------------------------------------------
async function apiFetch(endpoint, options = {}) {
    const { jwt } = getSession(); 
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
        ...options.headers
    };

    const response = await fetch(`/api${endpoint}`, { ...options, headers });
    
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP 异常: ${response.status}`);
    }
    return response.json();
}

// -------------------------------------------------------------------------
// 📡 核心业务流：拉取云端大厅，并在内存中批量解密 KV 索引
// -------------------------------------------------------------------------
export async function fetchCloudList() {
    const { masterCredential } = getSession(); // 获取常驻内存的主密钥
    const data = await apiFetch('/list');
    
    const decryptedFiles = [];
    
    // KV 传来的 data.files 是一个密文数组，必须用主密钥将其还原为 JSON
    if (data.files && data.files.length > 0) {
        for (const encryptedMeta of data.files) {
            try {
                const plainJsonStr = await CryptoCore.decrypt(encryptedMeta, masterCredential);
                decryptedFiles.push(JSON.parse(plainJsonStr));
            } catch (e) {
                console.error("解密索引失败，跳过该项 (可能是密匙不匹配或数据损坏)");
            }
        }
    }

    return { 
        files: decryptedFiles, 
        tags: data.tags || [] // 标签树暂时假设不加密（后续如果需要盲化标签树也可加密）
    };
}

// -------------------------------------------------------------------------
// 📥 核心业务流：从 R2 下载真身，解密并剥离 YAML
// -------------------------------------------------------------------------
export async function downloadAndDecrypt(fileId, wrappedKey, customCred) {
    const { masterCredential } = getSession();
    // 智能选择钥匙：如果用户传入了独立密码铸造的钥匙，就用独立的，否则用主钥匙
    const activeCredential = customCred || masterCredential;

    // 1. 从 R2 抓取密文本体 (此时它是一坨毫无意义的 Base64)
    const data = await apiFetch(`/note/${fileId}`);
    const ciphertextR2 = data.r2Payload;
    
    if (!ciphertextR2) return "";

    // 2. 将密文喂给底层核心引擎进行解密
    const rawText = await CryptoCore.decrypt(ciphertextR2, activeCredential);

    // 3. 剥离 YAML 头，把纯净的 Markdown 喂给编辑器
    const parsed = parseFrontmatter(rawText);
    return parsed.content;
}

// -------------------------------------------------------------------------
// 📤 核心业务流：双轨盲化加密，发往云端
// -------------------------------------------------------------------------
export async function encryptAndUpload(fileId, content, metaInfo, customCred) {
    const { masterCredential } = getSession();
    const activeCredential = customCred || masterCredential;

    // 1. 铸造 R2 真身密文 (YAML + 正文 捆绑加密)
    const fullDocument = buildFrontmatter(metaInfo) + content;
    const ciphertextR2 = await CryptoCore.encrypt(fullDocument, activeCredential);

    // 2. 铸造 KV 影子密文 (强制使用主密钥，附加一个独立密码标志位供前端判断)
    const kvMetaStr = JSON.stringify({
        id: fileId,
        title: metaInfo.title,
        tags: metaInfo.tags,
        updatedAt: metaInfo.updatedAt,
        hasCustomKey: !!customCred // 极客细节：标记是否用了独立密码
    });
    const ciphertextKV = await CryptoCore.encrypt(kvMetaStr, masterCredential);

    // 3. 向后端发起推流请求
    await apiFetch(`/note/${fileId}`, {
        method: 'PUT',
        body: JSON.stringify({
            metadata: ciphertextKV, // 发给 KV 的是密文
            r2Payload: ciphertextR2 // 发给 R2 的也是密文
        })
    });

    return true;
}

// -------------------------------------------------------------------------
// 🧨 核心业务流：物理销毁 (从 R2 和 KV 同时抹除)
// -------------------------------------------------------------------------
export async function deleteNote(fileId) {
    await apiFetch(`/note/${fileId}`, { method: 'DELETE' });
    return true;
}

// -------------------------------------------------------------------------
// 🏷️ 核心业务流：更新 KV 标签树
// -------------------------------------------------------------------------
export async function updateCloudTags(newTags) {
    await apiFetch('/tags', {
        method: 'PUT',
        body: JSON.stringify({ tags: newTags })
    });
    return true;
}

// -------------------------------------------------------------------------
// 🆔 工具：生成全局唯一的无中线 32 位 ID
// -------------------------------------------------------------------------
export function generateSystemFileId() {
    // 完美契合你的要求：32位字符，不含中线
    return crypto.randomUUID().replace(/-/g, '');
}
