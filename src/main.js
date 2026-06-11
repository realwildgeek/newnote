// =========================================================================
// 📄 模块名称: main.js
// 🎯 模块功能: 极客云笔记总指挥部 (Bootloader & 0-Latency State Machine)
// 🛡️ 架构层级: Application 根节点 (Milkdown 强力驱动版)
// =========================================================================

import { initUI, logStatus } from './components/ui.js';
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
// 🪄 Slash 极客菜单与全套排版指令
// ----------------------------------------------------
import { slashFactory, SlashProvider } from 'https://esm.sh/@milkdown/plugin-slash';
import { 
    wrapInHeadingCommand, 
    wrapInBlockquoteCommand, 
    wrapInBulletListCommand, 
    wrapInOrderedListCommand, 
    insertHrCommand, 
    createCodeBlockCommand 
} from 'https://esm.sh/@milkdown/preset-commonmark';
import { 
    insertTableCommand, 
    turnIntoTaskListCommand 
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

const defaultSystemTags = [
    { id: "tag_w8t5", name: "收集箱", color: "#007AFF", parentId: null },
    { id: "tag_b3l2", name: "工作台", color: "#34C759", parentId: null },
    { id: "tag_p9k4", name: "置顶", color: "#5856D6", parentId: null },
    { id: "tag_a1b2", name: "存档", color: "#8E8E93", parentId: null }
];

// =========================================================================
// ✒️ 编辑器引擎方法集
// =========================================================================
async function initMilkdown() {
    // 1. 铸造 Slash 插件工厂
    const slash = slashFactory('geek-slash');

    // 2. 构造 UI 容器与指令分发器
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
            <div class="slash-item" data-cmd="task"><span style="margin-right:8px; opacity:0.6;">☑️</span>待办清单</div>
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
                
                // 🚀 满血版指令分发器
                switch (cmd) {
                    case 'h1': commands.call(wrapInHeadingCommand.key, 1); break;
                    case 'h2': commands.call(wrapInHeadingCommand.key, 2); break;
                    case 'h3': commands.call(wrapInHeadingCommand.key, 3); break;
                    case 'quote': commands.call(wrapInBlockquoteCommand.key); break;
                    case 'hr': commands.call(insertHrCommand.key); break;
                    case 'ul': commands.call(wrapInBulletListCommand.key); break;
                    case 'ol': commands.call(wrapInOrderedListCommand.key); break;
                    case 'task': commands.call(turnIntoTaskListCommand.key); break;
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
    } // 👈 只有这里有一个闭合大括号，绝不能多写

    // 3. 引擎点火并装载 Slash
    milkdownEditor = await Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, document.querySelector('#milkdown-editor'));
            ctx.set(defaultValueCtx, '');
            ctx.get(listenerCtx).markdownUpdated((ctx, markdown) => {
                currentMarkdownContent = markdown;
            });
            // 绑定我们刚捏好的 Slash UI
            ctx.set(slash.key, { view: slashPluginView });
        })
        .config(nord)
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener)
        .use(slash) 
        .create();
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

        const mockJwtToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock";
        await initTripleLayerSecurity(mockJwtToken, masterPassword);
        
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

    // 文件大厅 (固定桶 📁 图标直达)
    document.getElementById('btn-file-hall').addEventListener('click', () => {
        document.getElementById('fileBrowserModal').classList.add('active');
        renderFileHallUI(); 
    });
    document.getElementById('btn-close-modal').addEventListener('click', () => {
        document.getElementById('fileBrowserModal').classList.remove('active');
    });

    document.getElementById('view-all-files').addEventListener('click', (e) => {
        document.querySelectorAll('.modal-sidebar .tag-item').forEach(el => el.classList.remove('active'));
        e.currentTarget.classList.add('active');
        State.hallActiveTagId = 'all';
        renderFileHallUI();
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
                renderFileHallUI();
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
// 🏷️ 标签编辑弹窗逻辑引擎
// =========================================================================
const PRESET_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#0ea5e9', '#3b82f6', '#8b5cf6', '#ec4899'];
function askForTagDetails(manager, existingTag = null) {
    return new Promise((resolve) => {
        const modal = document.getElementById('tagModal');
        const titleEl = document.getElementById('tag-modal-title');
        const inputName = document.getElementById('tag-name-input');
        const colorPicker = document.getElementById('tag-color-picker');
        const parentSelect = document.getElementById('tag-parent-select');
        const btnConfirm = document.getElementById('tag-confirm');
        const btnCancel = document.getElementById('tag-cancel');
        const editActions = document.getElementById('tag-edit-actions');
        const btnDelete = document.getElementById('btn-delete-tag');

        titleEl.innerText = existingTag ? '编辑标签' : '新建标签';
        inputName.value = existingTag ? existingTag.name : '';
        let selectedColor = existingTag ? existingTag.color : PRESET_COLORS;
        
        editActions.style.display = existingTag ? 'block' : 'none';

        colorPicker.innerHTML = '';
        PRESET_COLORS.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = `color-swatch ${color === selectedColor ? 'selected' : ''}`;
            swatch.style.backgroundColor = color;
            swatch.addEventListener('click', () => {
                document.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('selected'));
                swatch.classList.add('selected'); selectedColor = color;
            });
            colorPicker.appendChild(swatch);
        });

        parentSelect.innerHTML = '<option value="">无 (顶级标签) ></option>';
        if (manager && manager.tags) {
            manager.tags.forEach(tag => {
                if (!tag.parentId && (!existingTag || tag.id !== existingTag.id)) { 
                    const opt = document.createElement('option'); opt.value = tag.id; opt.innerText = tag.name + " >";
                    if (existingTag && existingTag.parentId === tag.id) opt.selected = true;
                    parentSelect.appendChild(opt);
                }
            });
        }

        const hasChildren = existingTag && manager && manager.tags.some(t => t.parentId === existingTag.id);
        if (hasChildren) {
            parentSelect.value = ""; parentSelect.disabled = true; parentSelect.style.opacity = "0.5"; parentSelect.style.cursor = "not-allowed";
        } else {
            parentSelect.disabled = false; parentSelect.style.opacity = "1"; parentSelect.style.cursor = "pointer";
        }

        modal.classList.add('active'); setTimeout(() => inputName.focus(), 100);

        const cleanup = () => {
            modal.classList.remove('active'); btnConfirm.removeEventListener('click', onConfirm);
            btnCancel.removeEventListener('click', onCancel); 
            btnDelete.removeEventListener('click', onDelete); inputName.removeEventListener('keydown', onEnter);
        };

        const onConfirm = () => {
            const name = inputName.value.trim(); if (!name) return;
            cleanup(); resolve({ action: 'save', data: { name, color: selectedColor, parentId: parentSelect.value || null }});
        };
        const onDelete = () => { cleanup(); resolve({ action: 'delete' }); };
        const onCancel = () => { cleanup(); resolve(null); };
        const onEnter = (e) => { if (e.key === 'Enter') onConfirm(); };

        btnConfirm.addEventListener('click', onConfirm); btnCancel.addEventListener('click', onCancel);
        btnDelete.addEventListener('click', onDelete); inputName.addEventListener('keydown', onEnter);
    });
}

// =========================================================================
// 🛡️ 业务流 A：雷达扫描与目录解密
// =========================================================================
async function refreshCloudList() {
    try {
        const { files, tags } = await fetchCloudList();
        
        State.globalFiles = files.map(f => ({
            id: f.id, title: f.title || "🔒 未知实体",
            tags: f.tags || [], updatedAt: f.updatedAt, wrappedKey: f.wrappedKey 
        }));

        State.globalFiles.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
        State.globalTags = tags || defaultSystemTags;

        if (!State.tagManagerInstance) {
            State.tagManagerInstance = new TagManager('tag-sidebar-list', State.globalTags, async (newTagsArray) => {
                State.globalTags = newTagsArray;
                await updateCloudTags(newTagsArray);
                
                const usedTags = new Set();
                State.globalFiles.forEach(f => f.tags.forEach(id => usedTags.add(id)));
                State.tagManagerInstance.setUsedTags(usedTags);
                
                renderFileHallUI();
                renderNoteTagsUI(currentNoteTags); 
            });
        }

        const usedTags = new Set();
        State.globalFiles.forEach(f => f.tags.forEach(id => usedTags.add(id)));
        State.tagManagerInstance.setUsedTags(usedTags);

        renderSidebarRecentList();
        logStatus("✅ 加密目录及标签库同步完毕");
    } catch (e) { logStatus("❌ 获取目录失败：" + e.message); }
}

// =========================================================================
// 🖼️ 业务流 B：侧边栏渲染
// =========================================================================
function renderSidebarRecentList() {
    const listContainer = document.getElementById("cloud-file-list");
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const recentFiles = State.globalFiles.slice(0, 15); 
    if (recentFiles.length === 0) {
        listContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; text-align: center; margin-top: 20px;">空空如也</div>';
        return;
    }

    recentFiles.forEach(fileObj => {
        const container = document.createElement('div');
        container.className = 'file-item-container';
        container.innerHTML = `<div class="file-item" title="${fileObj.title}" style="width: 100%;">📄 ${fileObj.title}</div>`;
        container.querySelector('.file-item').addEventListener('click', () => loadAndDecryptNote(fileObj.id));
        listContainer.appendChild(container);
    });
}

// =========================================================================
// 📖 业务流 C：密文提取与解密渲染
// =========================================================================
async function loadAndDecryptNote(fileId, isRetry = false) {
    logStatus("⏳ 正在进行三层解密提取...");
    if (!isRetry && State.currentFileId !== fileId) { State.customFileCredential = null; }

    try {
        const fileMeta = State.globalFiles.find(f => f.id === fileId);
        if (!fileMeta || !fileMeta.wrappedKey) { throw new Error("缺失该文件的专属解密凭证"); }

        // 🚨 迁移点：此处的 decryptedData 现在应当是 Markdown 文本，而不是 HTML
        const decryptedData = await downloadAndDecrypt(fileId, fileMeta.wrappedKey, State.customFileCredential);
        
        document.getElementById('note-title').value = fileMeta.title || "";
        document.getElementById('meta-updated').innerText = fileMeta.updatedAt || "未知时间";
        
        setEditorContent(decryptedData || "");
        
        State.currentFileId = fileId; 
        renderNoteTagsUI(fileMeta.tags || []);
        logStatus(`✅ 成功拉取：${fileMeta.title || '无标题'}`);
    } catch (e) {
        if (e.message.includes("OperationError") || e.message.includes("密码错误")) {
            logStatus("🔒 文件受保护，需要独立密码");
            const pwd = prompt("此文件受独立密码保护，请输入密码解锁：");
            if (pwd) {
                State.customFileCredential = await CryptoCore.createCredential(pwd);
                return loadAndDecryptNote(fileId, true);
            } else {
                logStatus("❌ 已取消解密"); return;
            }
        }
        console.error(e); logStatus("❌ 解密中止：" + e.message);
    }
}

// =========================================================================
// ✍️ 业务流 D：加密推流与 OCC 防御
// =========================================================================
async function handleSync() {
    try { getSession(); } catch (e) { logStatus("❌ 拦截：核心密匙未驻留"); return; }
    if (!State.currentFileId) { State.currentFileId = generateSystemFileId(); }

    const titleStr = document.getElementById('note-title').value || "无标题";
    const bodyContent = currentMarkdownContent; // 从 Milkdown 引擎拉取 Markdown
    const currentTags = [...currentNoteTags]; 
    const newUpdateTime = getFormattedTime();
    document.getElementById('meta-updated').innerText = newUpdateTime;

    const metaInfo = { title: titleStr, tags: currentTags, updatedAt: newUpdateTime };

    try {
        logStatus("⏳ 双轨加密推流中...");
        await encryptAndUpload(State.currentFileId, bodyContent, metaInfo, State.customFileCredential);
        logStatus("✅ 安全同步完成");
        refreshCloudList();
    } catch (e) {
        if (e.message === "OCC_CONFLICT") {
            logStatus("🚨 发生并发冲突！云端存在更新版本。");
            alert("⚠️ 冲突警告：\n云端账本已被修改，为防止覆盖丢失，本次推流已被强制拦截。\n请刷新页面获取最新内容。");
        } else { logStatus("❌ 同步失败：" + e.message); }
    }
}

// =========================================================================
// 🧨 业务流 E：物理销毁
// =========================================================================
async function executeDelete(fileId) {
    if (!confirm("⚠️ 确认在云端彻底抹除该实体？此操作不可逆！")) return;
    try {
        logStatus("⏳ 执行物理销毁指令...");
        await deleteNote(fileId);
        logStatus("✅ 实体已销毁");
        if (State.currentFileId === fileId) { resetWorkspace(); }
        refreshCloudList();
    } catch (e) { logStatus("❌ 销毁失败：" + e.message); }
}

// =========================================================================
// 🧰 通用工具集
// =========================================================================
function resetWorkspace() {
    State.currentFileId = null; State.customFileCredential = null; 
    document.getElementById('note-title').value = "";
    document.getElementById('meta-created').innerText = "（未保存）";
    document.getElementById('meta-updated').innerText = "（未保存）";
    renderNoteTagsUI(["tag_w8t5"]); clearEditor();
    document.getElementById('note-title').focus();
    logStatus("✨ 画布已清空，可建立新终端。");
}

function getFormattedTime() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

// =========================================================================
// 🏷️ 业务流 F：右侧胶囊打标签体验
// =========================================================================
let currentNoteTags = []; 

function renderNoteTagsUI(selectedTagIds = []) {
    currentNoteTags = [...selectedTagIds]; 
    const container = document.getElementById('meta-tags-container');
    if (!container) return;
    container.innerHTML = '';
    
    const availableTags = State.globalTags;
    if (availableTags.length === 0) {
        container.innerHTML = '<span style="color:var(--text-muted); font-size:12px;">暂无可用标签</span>';
        return;
    }

    availableTags.forEach(tag => {
        const isSelected = currentNoteTags.includes(tag.id);
        const capsule = document.createElement('div');
        capsule.style.cssText = `display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; margin: 4px 6px 4px 0; border-radius: 12px; font-size: 12px; cursor: pointer; user-select: none; transition: 0.2s; border: 1px solid ${isSelected ? tag.color : 'var(--border-dark)'}; background: ${isSelected ? tag.color + '20' : 'transparent'}; color: ${isSelected ? 'var(--text-main)' : 'var(--text-muted)'};`;
        capsule.innerHTML = `<span style="width:8px; height:8px; border-radius:50%; background:${tag.color}; opacity:${isSelected ? '1' : '0.3'}; transition: 0.2s;"></span>${tag.name}`;
        capsule.addEventListener('click', () => {
            if (currentNoteTags.includes(tag.id)) { currentNoteTags = currentNoteTags.filter(id => id !== tag.id); } 
            else { currentNoteTags.push(tag.id); }
            renderNoteTagsUI(currentNoteTags); 
        });
        container.appendChild(capsule);
    });
}

// =========================================================================
// 🗂️ 业务流 G：高级文件大厅渲染引擎
// =========================================================================
function renderFileHallUI() {
    const gridContainer = document.getElementById('file-grid-container');
    if(!gridContainer) return;
    gridContainer.innerHTML = '';

    if (State.hallActiveTagId === 'all') {
        gridContainer.innerHTML = `<div style="margin-bottom: 16px; padding: 0 4px;"><input type="text" id="file-search-input" placeholder="🔍 搜索文件名称..." class="file-search-input"></div><div class="file-grid" id="all-files-grid"><div style="display: flex; padding: 8px 16px 8px 32px; border-bottom: 1px solid var(--border-light); font-size: 12px; color: var(--text-muted); font-weight: bold; margin-bottom: 4px;"><div style="flex: 1;">文件名称</div><div style="width: 150px; text-align: right;">最后修改</div><div style="width: 40px; text-align: center;">操作</div></div></div>`;
        const grid = document.getElementById('all-files-grid');
        const searchInput = document.getElementById('file-search-input');

        const renderFlatFiles = (query) => {
            while (grid.children.length > 1) { grid.removeChild(grid.lastChild); }
            const filtered = State.globalFiles.filter(f => f.title.toLowerCase().includes(query.toLowerCase()));
            if (filtered.length === 0) { grid.insertAdjacentHTML('beforeend', '<div style="color: var(--text-muted); text-align: center; padding: 40px; font-size: 14px;">没有找到匹配的文件 🛸</div>'); return; }

            filtered.forEach(file => {
                const card = document.createElement('div'); card.className = 'file-card';
                let tagsHtml = '';
                if (State.globalTags) {
                    file.tags.forEach(tId => {
                        const t = State.globalTags.find(tag => tag.id === tId);
                        if(t) tagsHtml += `<span class="inline-tag-pill" style="background-color: ${t.color}15; color: ${t.color}; border: 1px solid ${t.color}30;">${t.name}</span>`;
                    });
                }
                card.innerHTML = `<div class="file-card-icon">📄</div><div class="file-card-name" title="${file.title}">${file.title}<span class="inline-tag-container">${tagsHtml}</span></div><div class="file-card-time">${file.updatedAt || '未知时间'}</div><div class="file-card-delete" title="物理销毁">🗑️</div>`;
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.file-card-delete')) { e.stopPropagation(); executeDelete(file.id); return; }
                    document.getElementById('fileBrowserModal').classList.remove('active');
                    loadAndDecryptNote(file.id);
                });
                grid.appendChild(card);
            });
        };

        renderFlatFiles(''); 
        searchInput.addEventListener('input', (e) => renderFlatFiles(e.target.value));
        return; 
    }

    const groups = {};
    State.globalFiles.forEach(file => {
        if (file.tags.length > 0) {
            file.tags.forEach(tId => { if (!groups[tId]) groups[tId] = []; groups[tId].push(file); });
        }
    });

    let tagsToShow = [];
    if (State.globalTags) {
        const target = State.globalTags.find(t => t.id === State.hallActiveTagId);
        if (target) { tagsToShow.push(target); tagsToShow.push(...State.globalTags.filter(t => t.parentId === target.id)); }
    }

    const renderGroup = (title, files) => {
        if (files.length === 0) return;
        const header = document.createElement('div'); header.className = 'file-group-header';
        header.innerHTML = `<span>🏷️ ${title}</span> <span class="file-group-count">${files.length} 篇笔记</span>`;
        gridContainer.appendChild(header);

        const grid = document.createElement('div'); grid.className = 'file-grid';
        const listHeader = document.createElement('div');
        listHeader.style.cssText = "display: flex; padding: 8px 16px 8px 32px; border-bottom: 1px solid var(--border-light); font-size: 12px; color: var(--text-muted); font-weight: bold; margin-bottom: 4px;";
        listHeader.innerHTML = `<div style="flex: 1;">文件名称</div><div style="width: 150px; text-align: right;">最后修改</div><div style="width: 40px; text-align: center;">操作</div>`;
        grid.appendChild(listHeader);

        files.forEach(file => {
            const card = document.createElement('div'); card.className = 'file-card';
            card.innerHTML = `<div class="file-card-icon">📄</div><div class="file-card-name" title="${file.title}">${file.title}</div><div class="file-card-time">${file.updatedAt || '未知时间'}</div><div class="file-card-delete" title="物理销毁">🗑️</div>`;
            card.addEventListener('click', (e) => {
                if (e.target.closest('.file-card-delete')) { e.stopPropagation(); executeDelete(file.id); return; }
                document.getElementById('fileBrowserModal').classList.remove('active');
                loadAndDecryptNote(file.id);
            });
            grid.appendChild(card);
        });
        gridContainer.appendChild(grid);
    };

    tagsToShow.forEach(tag => {
        const filesInTag = groups[tag.id] || [];
        if (filesInTag.length > 0) renderGroup(tag.name, filesInTag);
    });

    if (gridContainer.innerHTML === '') { gridContainer.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 40px; font-size: 14px;">该标签下暂无关联笔记 🛸</div>'; }
}
