// =========================================================================
// ☁️ 模块名称: storage.js
// 🎯 模块功能: 零知识云端通信引擎 (R2 + KV 上帝之眼双键版)
// 🛡️ 架构层级: Network / Data Layer
// =========================================================================

import { getSession } from './auth.js';
import { CryptoCore } from './crypto.js'; 

// -------------------------------------------------------------------------
// 🧬 内部工具：轻量级 YAML Frontmatter 引擎
// -------------------------------------------------------------------------
function buildFrontmatter(metaInfo) {
    return `---
title: ${metaInfo.title || "无标题"}
tags: [${metaInfo.tags ? metaInfo.tags.join(', ') : ''}]
createdAt: ${metaInfo.createdAt || ""}
updatedAt: ${metaInfo.updatedAt || ""}
---
`;
}

function parseFrontmatter(rawText) {
    // 正则提取 YAML 头和 Markdown 正文
    const match = rawText.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (match) {
        // 🚨 核心修复点：必须加上，提取正则的第二个捕获组（也就是纯正文内容）
        return { content: match[2].trimStart() };
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
// 📡 核心业务流：拉取云端大厅 (瞬间解密文件与标签的全量目录)
// -------------------------------------------------------------------------
export async function fetchCloudList() {
    const { masterCredential } = getSession(); 
    const data = await apiFetch('/list');
    
    let decryptedFiles = [];
    if (data.filesCipher) {
        try {
            const plainJsonStr = await CryptoCore.decrypt(data.filesCipher, masterCredential);
            decryptedFiles = JSON.parse(plainJsonStr);
        } catch (e) {
            console.error("解密文件上帝索引失败");
        }
    }

    let decryptedTags = [];
    // 🚨 新增：解密标签树
    if (data.tagsCipher) {
        try {
            const plainTagsStr = await CryptoCore.decrypt(data.tagsCipher, masterCredential);
            decryptedTags = JSON.parse(plainTagsStr);
        } catch (e) {
            console.error("解密标签上帝索引失败");
        }
    }

    return { 
        files: decryptedFiles, 
        tags: decryptedTags // 返回解密后的干净数组给主线程
    };
}

// -------------------------------------------------------------------------
// 📥 核心业务流：从 R2 下载真身，解密并剥离 YAML
// -------------------------------------------------------------------------
export async function downloadAndDecrypt(fileId, wrappedKey, customCred) {
    const { masterCredential } = getSession();
    const activeCredential = customCred || masterCredential;

    const data = await apiFetch(`/note/${fileId}`);
    const ciphertextR2 = data.r2Payload;
    
    if (!ciphertextR2) return "";

    const rawText = await CryptoCore.decrypt(ciphertextR2, activeCredential);
    const parsed = parseFrontmatter(rawText);
    return parsed.content;
}

// -------------------------------------------------------------------------
// 📤 核心业务流：双轨盲化加密 (上帝视角全量推流)
// -------------------------------------------------------------------------
export async function encryptAndUpload(fileId, content, metaInfo, customCred, globalFilesArray) {
    const { masterCredential } = getSession();
    const activeCredential = customCred || masterCredential;

    // 1. 铸造 R2 真身密文 (YAML + 正文 捆绑加密)
    const fullDocument = buildFrontmatter(metaInfo) + content;
    const ciphertextR2 = await CryptoCore.encrypt(fullDocument, activeCredential);

    // 2. 铸造 KV 上帝密文 (把当前前端内存里的整个大厅目录全量加密)
    const ciphertextKV = await CryptoCore.encrypt(JSON.stringify(globalFilesArray), masterCredential);

    // 3. 并发双轨推流 (R2 和 KV 分开走各自的专属路由)
    await Promise.all([
        apiFetch(`/note/${fileId}`, { method: 'PUT', body: JSON.stringify({ r2Payload: ciphertextR2 }) }),
        apiFetch(`/list`, { method: 'PUT', body: JSON.stringify({ filesCipher: ciphertextKV }) })
    ]);

    return true;
}

// -------------------------------------------------------------------------
// 🧨 核心业务流：物理销毁 (传入更新后的大厅数组覆写 KV)
// -------------------------------------------------------------------------
export async function deleteNote(fileId, newGlobalFilesArray) {
    const { masterCredential } = getSession();
    const ciphertextKV = await CryptoCore.encrypt(JSON.stringify(newGlobalFilesArray), masterCredential);
    
    await Promise.all([
        apiFetch(`/note/${fileId}`, { method: 'DELETE' }),
        apiFetch(`/list`, { method: 'PUT', body: JSON.stringify({ filesCipher: ciphertextKV }) })
    ]);
    return true;
}

// -------------------------------------------------------------------------
// 🏷️ 核心业务流：更新 KV 标签树 (彻底盲化版)
// -------------------------------------------------------------------------
export async function updateCloudTags(newTags) {
    const { masterCredential } = getSession();
    // 🚨 新增：将标签数组转化为 JSON 字符串后，用主密匙加密成黑盒
    const tagsCipher = await CryptoCore.encrypt(JSON.stringify(newTags), masterCredential);

    await apiFetch('/tags', {
        method: 'PUT',
        // 发给后端的不再是明文 tags，而是密文 tagsCipher
        body: JSON.stringify({ tagsCipher }) 
    });
    return true;
}

// -------------------------------------------------------------------------
// 🆔 工具：生成全局唯一的无中线 32 位 ID
// -------------------------------------------------------------------------
export function generateSystemFileId() {
    return crypto.randomUUID().replace(/-/g, '');
}
