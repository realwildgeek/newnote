// 模拟固定 Bucket 的云端数据库
let mockCloudDB = [
    { id: "note_001", title: "核心引擎测试日志", tags: ["tag_w8t5"], updatedAt: "2026-06-11 01:00", wrappedKey: "mock_key", content: "# 引擎点火成功\n\n固定桶架构已就绪，文件大厅连接正常。可在此输入 Markdown 测试推流逻辑。" }
];

export async function fetchCloudList() {
    const files = mockCloudDB.map(n => ({ id: n.id, title: n.title, tags: n.tags, updatedAt: n.updatedAt, wrappedKey: n.wrappedKey }));
    return { files, tags: null };
}

export async function downloadAndDecrypt(fileId, wrappedKey, customCred) {
    const note = mockCloudDB.find(n => n.id === fileId);
    if (!note) throw new Error("文件不存在");
    // 预留：真实环境在此调用 CryptoCore.decryptText
    return note.content; 
}

export async function encryptAndUpload(fileId, content, metaInfo, customCred) {
    const existingIndex = mockCloudDB.findIndex(n => n.id === fileId);
    // 预留：真实环境在此调用 CryptoCore.encryptText
    const newRecord = { id: fileId, title: metaInfo.title, tags: metaInfo.tags, updatedAt: metaInfo.updatedAt, wrappedKey: "new_key", content: content };
    
    if (existingIndex >= 0) { mockCloudDB[existingIndex] = newRecord; } 
    else { mockCloudDB.push(newRecord); }
    return true;
}

export async function deleteNote(fileId) {
    mockCloudDB = mockCloudDB.filter(n => n.id !== fileId);
    return true;
}

export async function updateCloudTags(newTags) {
    console.log("KV 标签树已同步", newTags);
    return true;
}

export function generateSystemFileId() {
    return 'note_' + Math.random().toString(36).substr(2, 9);
}
