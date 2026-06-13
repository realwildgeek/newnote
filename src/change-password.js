// =========================================================================
// 📄 模块名称: change-password.js
// 🎯 模块功能: 零知识架构底层数据重铸引擎 (全量再加密流水线)
// =========================================================================

import { CryptoCore } from './core/crypto.js';
import { getSession } from './core/auth.js';

const DOM = {
    oldPwd: document.getElementById('oldPwd'),
    newPwd: document.getElementById('newPwd'),
    confirmPwd: document.getElementById('confirmPwd'),
    btnSubmit: document.getElementById('btnSubmit'),
    statusBox: document.getElementById('statusBox')
};

function showStatus(msg, type = 'info') {
    DOM.statusBox.style.display = 'block';
    DOM.statusBox.className = `status-box ${type}`;
    DOM.statusBox.innerText = msg;
}

// 独立的极简网络引擎
async function fetchAPI(endpoint, options = {}) {
    const { jwt } = getSession(); 
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}`, ...options.headers };
    const response = await fetch(`/api${endpoint}`, { ...options, headers });
    if (!response.ok) throw new Error(`HTTP 异常: ${response.status}`);
    return response.json();
}

DOM.btnSubmit.addEventListener('click', async () => {
    const oldP = DOM.oldPwd.value;
    const newP = DOM.newPwd.value;
    const confirmP = DOM.confirmPwd.value;

    if (!oldP || !newP || !confirmP) return showStatus("请完整填写所有密匙字段。", "error");
    if (newP !== confirmP) return showStatus("两次输入的新密匙不一致。", "error");
    if (oldP === newP) return showStatus("新密匙不能与当前密匙相同。", "error");

    DOM.btnSubmit.disabled = true;
    
    try {
        showStatus("⏳ 正在验证当前密匙并拉取上帝索引...", "info");
        
        // 1. 派生钥匙
        const oldCredential = await CryptoCore.createCredential(oldP);
        const newCredential = await CryptoCore.createCredential(newP);

        // 2. 拉取大厅黑盒
        const listData = await fetchAPI('/list');
        
        let globalFilesArray = [];
        let globalTagsArray = [];

        // 3. 验证旧密码 (尝试解密目录)
        if (listData.filesCipher) {
            try {
                const plainStr = await CryptoCore.decrypt(listData.filesCipher, oldCredential);
                globalFilesArray = JSON.parse(plainStr);
            } catch (e) {
                throw new Error("当前主控密匙验证失败，拒绝访问。");
            }
        }
        if (listData.tagsCipher) {
            try {
                const plainTags = await CryptoCore.decrypt(listData.tagsCipher, oldCredential);
                globalTagsArray = JSON.parse(plainTags);
            } catch (e) { console.warn("标签树解密异常或为空"); }
        }

        // 4. 遍历并重铸 R2 实体
        let successCount = 0;
        let skipCount = 0;

        for (let i = 0; i < globalFilesArray.length; i++) {
            const file = globalFilesArray[i];
            showStatus(`⏳ 正在重铸实体 ${i + 1} / ${globalFilesArray.length}...`, "info");
            
            const noteData = await fetchAPI(`/note/${file.id}`);
            if (!noteData.r2Payload) continue;

            try {
                // 尝试用旧主密码解密真身
                const rawText = await CryptoCore.decrypt(noteData.r2Payload, oldCredential);
                // 解密成功，说明它是受主密码保护的，立刻用新密码重铸！
                const newCiphertext = await CryptoCore.encrypt(rawText, newCredential);
                await fetchAPI(`/note/${file.id}`, { method: 'PUT', body: JSON.stringify({ r2Payload: newCiphertext }) });
                successCount++;
            } catch (e) {
                // 🚨 核心逻辑：如果解密抛出 OperationError，说明此笔记是被【独立密码】加密的信封。
                // 绝不能强行覆盖，直接跳过，保留原样！
                skipCount++;
            }
        }

        // 5. 重铸 KV 上帝索引 (用新密码包裹)
        showStatus("⏳ 正在重铸全域索引与标签树...", "info");
        const newTagsCipher = await CryptoCore.encrypt(JSON.stringify(globalTagsArray), newCredential);
        const newFilesCipher = await CryptoCore.encrypt(JSON.stringify(globalFilesArray), newCredential);

        await fetchAPI(`/tags`, { method: 'PUT', body: JSON.stringify({ tagsCipher: newTagsCipher }) });
        await fetchAPI(`/list`, { method: 'PUT', body: JSON.stringify({ filesCipher: newFilesCipher }) });

        // 6. 大功告成
        showStatus(`✅ 密匙重铸完成！(重加密: ${successCount}篇, 保留独立信封: ${skipCount}篇) 3秒后返回大厅...`, "success");
        
        setTimeout(() => { window.location.href = 'index.html'; }, 3000);

    } catch (e) {
        showStatus(e.message, "error");
        DOM.btnSubmit.disabled = false;
    }
});
