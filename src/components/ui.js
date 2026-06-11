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
