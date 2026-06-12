// =========================================================================
// 📄 模块名称: ui.js
// 🎯 模块功能: 全局视觉与极简交互控制
// 🛡️ 架构层级: Components 组件层 (纯渲染，无业务状态)
// ⚠️ 依赖规范: 仅处理 CSS 变量切换、DOM class 增删、文字反馈。绝对不包含网络与加密逻辑。
// =========================================================================

// -------------------------------------------------------------------------
// ⚡️ 功能模块: 视觉初始化引线
// -------------------------------------------------------------------------
export function initUI() {
    // 1. 初始化暗黑/亮色主题 (从本地存储读取用户偏好)
    const savedTheme = localStorage.getItem('geek_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // 2. 绑定主题切换按钮
    const themeBtn = document.querySelector('.theme-toggle-btn');
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleTheme);
    }

    // 3. 绑定侧边栏呼出/驻留按钮 (支持移动端菜单和桌面端图钉)
    const pinBtns = document.querySelectorAll('#pinBtn, .mobile-menu-btn');
    pinBtns.forEach(btn => btn.addEventListener('click', togglePin));
}

// -------------------------------------------------------------------------
// 🌓 功能模块: 主题调度引擎 (深/浅色无缝切换)
// -------------------------------------------------------------------------
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    // 切换 DOM 属性并持久化到本地存储
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('geek_theme', newTheme);
}

// -------------------------------------------------------------------------
// 🧭 功能模块: 侧边栏抽屉引擎
// -------------------------------------------------------------------------
function togglePin() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('pinned');
    }
}

// -------------------------------------------------------------------------
// 📢 功能模块: 顶部状态日志输出
// -------------------------------------------------------------------------
export function logStatus(msg) { 
    // 🚨 关键修复：已对接 index.html 中实际存在的 ID (status-bar)
    const statusEl = document.getElementById('status-bar');
    if (statusEl) {
        statusEl.innerText = msg;
    }
}

// -------------------------------------------------------------------------
// 🏷️ 功能模块: 标签编辑弹窗 UI
// -------------------------------------------------------------------------
const PRESET_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#0ea5e9', '#3b82f6', '#8b5cf6', '#ec4899'];
export function askForTagDetails(manager, existingTag = null) {
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
