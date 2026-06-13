// =========================================================================
// 📄 模块名称: main.js
// 🎯 模块功能: 极客云笔记总指挥部 (Bootloader & 0-Latency State Machine)
// 🛡️ 架构层级: Application 根节点 (Milkdown 强力驱动版)
// =========================================================================

import { initUI, logStatus, askForTagDetails, renderSidebarRecentList, renderNoteTagsUI, renderFileHallUI } from './components/ui.js';
import { initTripleLayerSecurity, logout, getSession } from './core/auth.js';
import { fetchCloudList, downloadAndDecrypt, encryptAndUpload, deleteNote, generateSystemFileId, updateCloudTags } from './core/storage.js';
import { TagManager } from './components/tags.js'; 
import { CryptoCore } from './core/crypto.js';

// ----------------------------------------------------
// ✒️ Milkdown 核心引擎与官方主题
// ----------------------------------------------------
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, parserCtx, commandsCtx } from 'https://esm.sh/@milkdown/core';
import { nord } from 'https://esm.sh/@milkdown/theme-nord';
import { commonmark } from 'https://esm.sh/@milkdown/preset-commonmark';
import { gfm } from 'https://esm.sh/@milkdown/preset-gfm';
import { history } from 'https://esm.sh/@milkdown/plugin-history';
import { listener, listenerCtx } from 'https://esm.sh/@milkdown/plugin-listener';

// ----------------------------------------------------
// 🪄 极客排版指令与 UI 插件 (Slash & Tooltip)
// ----------------------------------------------------
import { slashFactory, SlashProvider } from 'https://esm.sh/@milkdown/plugin-slash';
import { tooltipFactory, TooltipProvider } from 'https://esm.sh/@milkdown/plugin-tooltip'; // 👈 新增：悬浮菜单引擎
import { 
    wrapInHeadingCommand, 
    wrapInBlockquoteCommand, 
    wrapInBulletListCommand, 
    wrapInOrderedListCommand, 
    insertHrCommand, 
    createCodeBlockCommand,
    toggleStrongCommand,     // 👈 新增：加粗
    toggleEmphasisCommand,   // 👈 新增：斜体
    toggleInlineCodeCommand  // 👈 新增：行内高亮
} from 'https://esm.sh/@milkdown/preset-commonmark';
import { 
    insertTableCommand, 
    toggleStrikethroughCommand // 👈 新增：删除线
} from 'https://esm.sh/@milkdown/preset-gfm';

// =========================================================================
// 🧠 核心状态机 (0 延迟架构的数据大本营)
// =========================================================================
const State = {
    globalFiles: [],         
    globalTags: [],          
    currentFileId: null,     
    tagManagerInstance: null,
    customFileCredential: null, 
    hallActiveTagId: 'all'   
};

let milkdownEditor = null;
let currentMarkdownContent = ""; // 实时缓存 Markdown 内容，用于推流

// =========================================================================
// ✒️ 编辑器引擎方法集
// =========================================================================
async function initMilkdown() {
    // 1. 铸造 Slash (斜杠菜单) 引擎
    const slash = slashFactory('geek-slash');
    function slashPluginView(view) {
        const content = document.createElement('div');
        content.className = 'geek-slash-menu';
        
        // 🚀 满血版菜单 UI：增加了有序、任务、代码、分割线、表格
        content.innerHTML = `
        <div style="font-size: 11px; color: var(--text-muted); padding: 4px 8px; font-weight: bold;">基础排版</div>
            <div class="slash-item" data-cmd="h1"><span style="margin-right:8px; opacity:0.6;">#️⃣</span>大标题 (H1)</div>
            <div class="slash-item" data-cmd="h2"><span style="margin-right:8px; opacity:0.6;">##️⃣</span>中标题 (H2)</div>
            <div class="slash-item" data-cmd="h3"><span style="margin-right:8px; opacity:0.6;">###️⃣</span>小标题 (H3)</div>
            <div class="slash-item" data-cmd="quote"><span style="margin-right:8px; opacity:0.6;">❞</span>引用块</div>
            <div class="slash-item" data-cmd="hr"><span style="margin-right:8px; opacity:0.6;">➖</span>分割线</div>
            
            <div style="font-size: 11px; color: var(--text-muted); padding: 8px 8px 4px 8px; font-weight: bold; border-top: 1px solid var(--border-light); margin-top: 4px;">列表与结构</div>
            <div class="slash-item" data-cmd="ul"><span style="margin-right:8px; opacity:0.6;">⏺</span>无序列表</div>
            <div class="slash-item" data-cmd="ol"><span style="margin-right:8px; opacity:0.6;">🔢</span>有序列表</div>
            <div class="slash-item" data-cmd="code"><span style="margin-right:8px; opacity:0.6;">💻</span>代码块</div>
            <div class="slash-item" data-cmd="table"><span style="margin-right:8px; opacity:0.6;">📊</span>插入表格</div>
        `;
        content.addEventListener('mousedown', (e) => {
            e.preventDefault(); 
            const item = e.target.closest('.slash-item');
            if (!item) return;
            
            const cmd = item.dataset.cmd;
            milkdownEditor.action((ctx) => {
                const editorView = ctx.get(editorViewCtx);
                const { state } = editorView;
                
                // 抹除触发器 "/"
                editorView.dispatch(state.tr.delete(state.selection.from - 1, state.selection.from));
                
                const commands = ctx.get(commandsCtx);

                // 🚀 指令分发器：排除了内鬼，保留表格与代码块
                switch (cmd) {
                    case 'h1': commands.call(wrapInHeadingCommand.key, 1); break;
                    case 'h2': commands.call(wrapInHeadingCommand.key, 2); break;
                    case 'h3': commands.call(wrapInHeadingCommand.key, 3); break;
                    case 'quote': commands.call(wrapInBlockquoteCommand.key); break;
                    case 'hr': commands.call(insertHrCommand.key); break;
                    case 'ul': commands.call(wrapInBulletListCommand.key); break;
                    case 'ol': commands.call(wrapInOrderedListCommand.key); break;
                    case 'code': commands.call(createCodeBlockCommand.key); break;
                    case 'table': commands.call(insertTableCommand.key); break;
                }
            });
        });

        const provider = new SlashProvider({ content });
        return {
            update: (updatedView, prevState) => provider.update(updatedView, prevState),
            destroy: () => { provider.destroy(); content.remove(); },
        };
    } 

    // 2. 🚀 新增：铸造 Tooltip (划词悬浮菜单) 引擎
    const tooltip = tooltipFactory('geek-tooltip');
    function tooltipPluginView(view) {
        const content = document.createElement('div');
        content.className = 'geek-tooltip-menu';
        
        // 渲染四个核心操作按钮
        content.innerHTML = `
            <div class="tooltip-item" data-cmd="strong" title="加粗 (Ctrl+B)">B</div>
            <div class="tooltip-item italic" data-cmd="em" title="斜体 (Ctrl+I)">I</div>
            <div class="tooltip-item strike" data-cmd="strike" title="删除线">S</div>
            <div class="tooltip-item code" data-cmd="code" title="极客高亮">&lt;&gt;</div>
        `;

        content.addEventListener('mousedown', (e) => {
            e.preventDefault(); // 防止点击按钮时失去文本焦点
            const item = e.target.closest('.tooltip-item');
            if (!item) return;
            
            const cmd = item.dataset.cmd;
            milkdownEditor.action((ctx) => {
                const commands = ctx.get(commandsCtx);
                // 🚀 悬浮指令分发器
                switch (cmd) {
                    case 'strong': commands.call(toggleStrongCommand.key); break;
                    case 'em': commands.call(toggleEmphasisCommand.key); break;
                    case 'strike': commands.call(toggleStrikethroughCommand.key); break;
                    case 'code': commands.call(toggleInlineCodeCommand.key); break;
                }
            });
        });

        const provider = new TooltipProvider({ content });
        return {
            update: (updatedView, prevState) => provider.update(updatedView, prevState),
            destroy: () => { provider.destroy(); content.remove(); },
        };
    }

    // 3. 引擎点火并装载所有插件
    milkdownEditor = await Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, document.querySelector('#milkdown-editor'));
            ctx.set(defaultValueCtx, '');
            ctx.get(listenerCtx).markdownUpdated((ctx, markdown) => {
                currentMarkdownContent = markdown;
            });
            // 绑定我们捏好的两个 UI
            ctx.set(slash.key, { view: slashPluginView });
            ctx.set(tooltip.key, { view: tooltipPluginView }); // 👈 绑定悬浮菜单
        })
        .config(nord)
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener)
        .use(slash)
        .use(tooltip) // 👈 将悬浮菜单挂载到主线程
        .create();
}

// =========================================================================
// 🎛️ 编辑器内容流转引擎 (API)
// =========================================================================
function setEditorContent(markdownStr) {
    if (!milkdownEditor) return;
    milkdownEditor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const parser = ctx.get(parserCtx);
        const doc = parser(markdownStr);
        if (!doc) return;
        // 底层 AST 替换，确保 0 延迟且不破坏历史记录
        view.dispatch(view.state.tr.replace(0, view.state.doc.content.size, doc.slice(0, doc.content.size)));
    });
    currentMarkdownContent = markdownStr;
}

function clearEditor() {
    if (!milkdownEditor) return;
    milkdownEditor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        view.dispatch(view.state.tr.delete(0, view.state.doc.content.size));
    });
    currentMarkdownContent = "";
}

// =========================================================================
// 🚀 系统启动点火序列
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 系统核心模块加载中...");
    
    initUI();
    await initMilkdown(); // 初始化新引擎
    
    bindGlobalEvents();
    resetWorkspace();
    
    try {
        logStatus("⏳ 正在注入三层安全密钥...");
        const masterPassword = prompt("🔐 终端锁闭。请输入主控密匙唤醒系统：");
        if (!masterPassword) { logStatus("❌ 启动中止：拒绝访问，系统未被唤醒"); return; }

        // TODO: 接入真实的 SSO 后，Token 将从 URL 参数或 Cookie 中提取
        const ssoToken = "temp_token_for_now"; 
        await initTripleLayerSecurity(ssoToken, masterPassword);
        
        logStatus("⏳ 密匙驻留成功，正在扫描暗网目录...");
        await refreshCloudList();
    } catch (e) {
        logStatus("❌ 密钥注入失败：" + e.message);
    }
});

// =========================================================================
// 🔗 事件总线绑定 
// =========================================================================
function bindGlobalEvents() {
    const btnSync = document.getElementById('btn-sync');
    if (btnSync) btnSync.addEventListener('click', handleSync);

    const btnNew = document.querySelector('.new-note-btn');
    if (btnNew) btnNew.addEventListener('click', resetWorkspace);

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) btnLogout.addEventListener('click', logout);

    // 文件大厅 (固定桶 📁 图标直达)
    document.getElementById('btn-file-hall').addEventListener('click', () => {
        document.getElementById('fileBrowserModal').classList.add('active');
        triggerFileHallUpdate(); 
    });
    document.getElementById('btn-close-modal').addEventListener('click', () => {
        document.getElementById('fileBrowserModal').classList.remove('active');
    });

    document.getElementById('view-all-files').addEventListener('click', (e) => {
        document.querySelectorAll('.modal-sidebar .tag-item').forEach(el => el.classList.remove('active'));
        e.currentTarget.classList.add('active');
        State.hallActiveTagId = 'all';
        triggerFileHallUpdate();
    });

    const sidebarList = document.getElementById('tag-sidebar-list');
    if (sidebarList) {
        sidebarList.addEventListener('click', (e) => {
            const item = e.target.closest('.tag-item');
            if (item && !e.target.closest('.btn-edit-tag')) { 
                document.querySelectorAll('.modal-sidebar .tag-item').forEach(el => el.classList.remove('active'));
                document.getElementById('view-all-files').classList.remove('active');
                item.classList.add('active');
                State.hallActiveTagId = item.dataset.id;
                triggerFileHallUpdate();
            }
        });
    }

    document.getElementById('btn-add-tag').addEventListener('click', async () => {
        const result = await askForTagDetails(State.tagManagerInstance);
        if (result && result.action === 'save') { State.tagManagerInstance.addTag(result.data.name, result.data.color, result.data.parentId); }
    });

    document.addEventListener('tag-edit', async (e) => {
        const tag = e.detail;
        const result = await askForTagDetails(State.tagManagerInstance, tag);
        if (result) {
            if (result.action === 'save') { State.tagManagerInstance.updateTag(tag.id, result.data.name, result.data.color, result.data.parentId); } 
            else if (result.action === 'delete') {
                if (confirm(`🗑️ 确定要删除标签 "${tag.name}" 吗？\n删除后无法恢复！`)) State.tagManagerInstance.deleteTag(tag.id);
            } 
        }
    });

    // 独立密匙信封模式
    document.getElementById('btn-file-encrypt').addEventListener('click', async () => {
        if (!State.currentFileId) { alert("请先打开或新建一篇笔记，再进行加密操作。"); return; }
        const pwd = prompt("🔐 信封模式：请输入当前文件的独立加密密码\n（注：留空并确认，将恢复为默认的主密匙加密）");
        if (pwd === null) return; 

        if (pwd.trim() === "") {
            State.customFileCredential = null;
            logStatus("🔓 已切换为主密匙模式，正在重装载...");
        } else {
            State.customFileCredential = await CryptoCore.createCredential(pwd);
            logStatus("🔐 已切换为独立密码模式，正在重装载...");
        }
        handleSync();
    });

    // 全局浮窗“点击空白处关闭”
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) { overlay.classList.remove('active'); }
        });
    });
}

// =========================================================================
// 🛡️ 业务流 A：雷达扫描与目录解密
// =========================================================================
async function refreshCloudList() {
    try {
        const { files, tags } = await fetchCloudList();
        
        // 🚨 修复点 2：移除了已作废的 wrappedKey，补全 createdAt 映射
        State.globalFiles = files.map(f => ({
            id: f.id, title: f.title || "🔒 未知实体",
            tags: f.tags || [], createdAt: f.createdAt, updatedAt: f.updatedAt 
        }));

        State.globalFiles.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
        State.globalTags = tags || [];

        if (!State.tagManagerInstance) {
            State.tagManagerInstance = new TagManager('tag-sidebar-list', State.globalTags, async (newTagsArray) => {
                State.globalTags = newTagsArray;
                await updateCloudTags(newTagsArray);
                
                const usedTags = new Set();
                State.globalFiles.forEach(f => f.tags.forEach(id => usedTags.add(id)));
                State.tagManagerInstance.setUsedTags(usedTags);
                
                triggerFileHallUpdate();
                triggerTagsUIUpdate(currentNoteTags); 
            });
        }

        const usedTags = new Set();
        State.globalFiles.forEach(f => f.tags.forEach(id => usedTags.add(id)));
        State.tagManagerInstance.setUsedTags(usedTags);

        triggerSidebarUpdate();
        logStatus("✅ 加密目录及标签库同步完毕");
    } catch (e) { logStatus("❌ 获取目录失败：" + e.message); }
}

// =========================================================================
// 📖 业务流 C：密文提取与解密渲染
// =========================================================================
async function loadAndDecryptNote(fileId, isRetry = false) {
    logStatus("⏳ 正在进行三层解密提取...");
    if (!isRetry && State.currentFileId !== fileId) { State.customFileCredential = null; }

    try {
        const fileMeta = State.globalFiles.find(f => f.id === fileId);
        if (!fileMeta) { throw new Error("缺失该文件的元数据"); }

        // 下载并解密
        const decryptedData = await downloadAndDecrypt(fileId, null, State.customFileCredential);
        
        document.getElementById('note-title').value = fileMeta.title || "";
        document.getElementById('meta-updated').innerText = fileMeta.updatedAt || "未知时间";
        
        setEditorContent(decryptedData || "");
        
        State.currentFileId = fileId; 
        triggerTagsUIUpdate(fileMeta.tags || []);
        logStatus(`✅ 成功拉取：${fileMeta.title || '无标题'}`);
        
    } catch (e) {
        // 🚨 核心修复点：使用 e.name === "OperationError" 捕捉浏览器底层的密码错误拦截
        if (e.name === "OperationError" || (e.message && e.message.includes("密码错误"))) {
            logStatus("🔒 文件受保护，需要独立密码");
            const pwd = prompt("此文件受独立密码保护，请输入密码解锁：");
            if (pwd) {
                State.customFileCredential = await CryptoCore.createCredential(pwd);
                return loadAndDecryptNote(fileId, true);
            } else {
                logStatus("❌ 已取消解密"); 
                return;
            }
        }
        console.error(e); 
        logStatus("❌ 解密中止：" + (e.message || "未知底层拦截"));
    }
}

// =========================================================================
// ✍️ 业务流 D：加密推流与 OCC 防御
// =========================================================================
async function handleSync() {
    try { getSession(); } catch (e) { logStatus("❌ 拦截：核心密匙未驻留"); return; }
    
    let existingMeta = State.globalFiles.find(f => f.id === State.currentFileId);
    let creationTime = existingMeta ? existingMeta.createdAt : getFormattedTime();

    if (!State.currentFileId) { State.currentFileId = generateSystemFileId(); }

    const titleStr = document.getElementById('note-title').value || "无标题";
    const bodyContent = currentMarkdownContent; 
    const currentTags = [...currentNoteTags]; 
    const newUpdateTime = getFormattedTime();
    
    document.getElementById('meta-created').innerText = creationTime; // 🚨 修复点 4：补全时间回显
    document.getElementById('meta-updated').innerText = newUpdateTime;

    const metaInfo = { id: State.currentFileId, title: titleStr, tags: currentTags, createdAt: creationTime, updatedAt: newUpdateTime };
    const existingIndex = State.globalFiles.findIndex(f => f.id === State.currentFileId);
    if (existingIndex >= 0) { State.globalFiles[existingIndex] = metaInfo; } 
    else { State.globalFiles.push(metaInfo); }

    try {
        logStatus("⏳ 双轨加密推流中...");
        await encryptAndUpload(State.currentFileId, bodyContent, metaInfo, State.customFileCredential, State.globalFiles);
        logStatus("✅ 安全同步完成");
        triggerSidebarUpdate(); 
        triggerFileHallUpdate();
    } catch (e) {
        logStatus("❌ 同步失败：" + e.message);
    }
}

// =========================================================================
// 🧨 业务流 E：物理销毁
// =========================================================================
async function executeDelete(fileId) {
    if (!confirm("⚠️ 确认在云端彻底抹除该实体？此操作不可逆！")) return;
    try {
        logStatus("⏳ 执行物理销毁指令...");
        State.globalFiles = State.globalFiles.filter(f => f.id !== fileId);
        await deleteNote(fileId, State.globalFiles);
        logStatus("✅ 实体已销毁");
        if (State.currentFileId === fileId) { resetWorkspace(); }
        triggerSidebarUpdate(); 
        triggerFileHallUpdate();
    } catch (e) { logStatus("❌ 销毁失败：" + e.message); }
}

// =========================================================================
// 🎛️ 视图控制器 (接管 UI 层反馈)
// =========================================================================

let currentNoteTags = [];

function triggerSidebarUpdate() {
    renderSidebarRecentList(State.globalFiles.slice(0, 15), (id) => loadAndDecryptNote(id));
}

function triggerFileHallUpdate() {
    renderFileHallUI(State.globalFiles, State.globalTags, State.hallActiveTagId, 
        (id) => {
            document.getElementById('fileBrowserModal').classList.remove('active');
            loadAndDecryptNote(id);
        }, 
        (id) => executeDelete(id)
    );
}

function triggerTagsUIUpdate(selectedIds = []) {
    currentNoteTags = [...selectedIds];
    
    // ✅ 修复：必须调用引入的 renderNoteTagsUI 渲染器，绝不能调用自己！
    renderNoteTagsUI(State.globalTags, currentNoteTags, (tagId) => {
        if (currentNoteTags.includes(tagId)) { 
            currentNoteTags = currentNoteTags.filter(id => id !== tagId); 
        } else { 
            currentNoteTags.push(tagId); 
        }
        triggerTagsUIUpdate(currentNoteTags);
    });
}

// =========================================================================
// 🧰 通用工具集
// =========================================================================
function resetWorkspace() {
    State.currentFileId = null; State.customFileCredential = null; 
    document.getElementById('note-title').value = "";
    document.getElementById('meta-created').innerText = "（未保存）";
    document.getElementById('meta-updated').innerText = "（未保存）";
    triggerTagsUIUpdate([]); clearEditor();
    document.getElementById('note-title').focus();
    logStatus("✨ 画布已清空，可建立新终端。");
}

function getFormattedTime() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}
