// Global variables
let authToken = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
let bookmarks = [];
let sortable = null;
let viewMode = localStorage.getItem('viewMode') || 'grid';
let theme = localStorage.getItem('theme') || 'light';

// Toast notification function
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '';
    switch(type) {
        case 'success':
            icon = '<i class="fas fa-check-circle"></i>';
            break;
        case 'error':
            icon = '<i class="fas fa-exclamation-circle"></i>';
            break;
        case 'warning':
            icon = '<i class="fas fa-exclamation-triangle"></i>';
            break;
        default:
            icon = '<i class="fas fa-info-circle"></i>';
    }
    
    toast.innerHTML = `
        ${icon}
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// API Configuration
const API_BASE_URL = '/api';

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Apply saved theme
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        document.getElementById('themeIcon').className = 'fas fa-sun';
    }
    
    if (authToken && currentUser) {
        showMainPage();
        loadBookmarks();
        updateStats();
    } else {
        showAuthPage();
    }
    
    // Bind form handlers
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('addBookmarkForm').addEventListener('submit', handleAddBookmark);
    document.getElementById('editBookmarkForm').addEventListener('submit', handleEditBookmark);
    
    // Bind modal form handlers (check if elements exist first)
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', handleChangePassword);
    }
    
    const deleteAccountForm = document.getElementById('deleteAccountForm');
    if (deleteAccountForm) {
        deleteAccountForm.addEventListener('submit', handleDeleteAccount);
    }
    
    // 移动端优化
    preventZoom();
    optimizeMobilePerformance();
});

// 防止缩放
function preventZoom() {
    // 防止双击缩放
    let lastTouchEnd = 0;
    document.addEventListener('touchend', function (event) {
        const now = (new Date()).getTime();
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    }, false);
    
    // 防止手势缩放
    document.addEventListener('gesturestart', function (e) {
        e.preventDefault();
    });
    
    document.addEventListener('gesturechange', function (e) {
        e.preventDefault();
    });
    
    document.addEventListener('gestureend', function (e) {
        e.preventDefault();
    });
    
    // 防止键盘缩放
    document.addEventListener('touchmove', function (event) {
        if (event.scale !== 1) {
            event.preventDefault();
        }
    }, { passive: false });
}

// 移动端性能优化
function optimizeMobilePerformance() {
    // 检测是否为移动设备
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
        // 禁用某些动画
        document.body.classList.add('mobile-device');
        
        // 优化滚动性能
        let ticking = false;
        
        function updateScrollPosition() {
            // 可以在这里添加滚动优化逻辑
            ticking = false;
        }
        
        document.addEventListener('scroll', function() {
            if (!ticking) {
                requestAnimationFrame(updateScrollPosition);
                ticking = true;
            }
        }, { passive: true });
    }
}

// Auth Functions
function switchTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabs = document.querySelectorAll('.tab-btn');
    
    if (tab === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        tabs[0].classList.add('active');
        tabs[1].classList.remove('active');
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        tabs[0].classList.remove('active');
        tabs[1].classList.add('active');
    }
    
    clearAuthMessage();
}

function showAuthPage() {
    document.getElementById('authPage').style.display = 'flex';
    document.getElementById('mainPage').style.display = 'none';
}

function showMainPage() {
    document.getElementById('authPage').style.display = 'none';
    document.getElementById('mainPage').style.display = 'block';
    document.getElementById('username').textContent = currentUser.username;
    
    // Apply saved view mode
    setViewMode(viewMode);
}

function showAuthMessage(message, type) {
    const messageEl = document.getElementById('authMessage');
    messageEl.textContent = message;
    messageEl.className = `message ${type}`;
}

function clearAuthMessage() {
    const messageEl = document.getElementById('authMessage');
    messageEl.textContent = '';
    messageEl.className = 'message';
}

async function handleLogin(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!username || !password) {
        showAuthMessage('请输入用户名和密码', 'error');
        return false;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            showMainPage();
            loadBookmarks();
            updateStats();
        } else {
            showAuthMessage(data.error || '登录失败', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showAuthMessage('网络错误，请稍后重试', 'error');
    }
    
    return false;
}

async function handleRegister(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const verificationCode = document.getElementById('verificationCode').value;
    
    if (password !== confirmPassword) {
        showAuthMessage('两次输入的密码不一致', 'error');
        return;
    }
    
    if (password.length < 6) {
        showAuthMessage('密码至少需要6个字符', 'error');
        return;
    }
    
    if (!verificationCode.trim()) {
        showAuthMessage('请输入验证码', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password, verification_code: verificationCode })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showAuthMessage('注册成功！请登录', 'success');
            setTimeout(() => switchTab('login'), 1500);
        } else {
            showAuthMessage(data.error || '注册失败', 'error');
        }
    } catch (error) {
        console.error('Register error:', error);
        showAuthMessage('网络错误，请稍后重试', 'error');
    }
    
    return false;
}

function logout() {
    if (confirm('确定要退出登录吗？')) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        authToken = null;
        currentUser = null;
        bookmarks = [];
        showAuthPage();
    }
}

// User dropdown menu
function toggleUserDropdown() {
    const dropdown = document.getElementById('userDropdown');
    dropdown.classList.toggle('show');
    
    // Close dropdown when clicking outside
    const closeDropdown = (e) => {
        if (!e.target.closest('.dropdown')) {
            dropdown.classList.remove('show');
            document.removeEventListener('click', closeDropdown);
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', closeDropdown);
    }, 0);
}

// Change Password Functions
function showChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'block';
    document.getElementById('oldPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'none';
}

async function handleChangePassword(e) {
    e.preventDefault();
    
    const oldPassword = document.getElementById('oldPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    
    if (newPassword !== confirmNewPassword) {
        showToast('新密码两次输入不一致', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showToast('新密码长度至少6位', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/user/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                old_password: oldPassword,
                new_password: newPassword
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(data.message || '密码修改成功，请重新登录', 'success');
            closeChangePasswordModal();
            // Clear auth and redirect to login after 2 seconds
            setTimeout(() => {
                localStorage.removeItem('authToken');
                localStorage.removeItem('currentUser');
                authToken = null;
                currentUser = null;
                bookmarks = [];
                showAuthPage();
                showToast('请使用新密码登录', 'info');
            }, 2000);
        } else {
            showToast(data.error || '密码修改失败', 'error');
        }
    } catch (error) {
        showToast('网络错误，请稍后重试', 'error');
    }
}

// Delete Account Functions
function showDeleteAccountModal() {
    document.getElementById('deleteAccountModal').style.display = 'block';
    document.getElementById('deletePassword').value = '';
    document.getElementById('confirmDelete').checked = false;
}

function closeDeleteAccountModal() {
    document.getElementById('deleteAccountModal').style.display = 'none';
}

async function handleDeleteAccount(e) {
    e.preventDefault();
    
    const password = document.getElementById('deletePassword').value;
    const confirmDelete = document.getElementById('confirmDelete').checked;
    
    if (!confirmDelete) {
        showToast('请确认您要删除账号', 'error');
        return;
    }
    
    if (!confirm('最后确认：您真的要永久删除账号吗？此操作不可恢复！')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/user/account`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                password: password,
                confirm: true
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(data.message || '账号已删除', 'success');
            // Clear local storage and redirect to login
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentUser');
            authToken = null;
            currentUser = null;
            bookmarks = [];
            // Close modal first
            closeDeleteAccountModal();
            // Show auth page after a short delay
            setTimeout(() => {
                showAuthPage();
            }, 1500);
        } else {
            showToast(data.error || '删除失败', 'error');
        }
    } catch (error) {
        showToast('网络错误，请稍后重试', 'error');
    }
}

// Bookmark Functions
async function loadBookmarks() {
    try {
        const response = await fetch(`${API_BASE_URL}/bookmarks`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            bookmarks = await response.json();
            renderBookmarks();
        } else if (response.status === 401) {
            logout();
        }
    } catch (error) {
        console.error('Failed to load bookmarks:', error);
    }
}

function renderBookmarks() {
    const bookmarksList = document.getElementById('bookmarksList');
    const emptyState = document.getElementById('emptyState');
    
    bookmarksList.innerHTML = '';
    
    if (bookmarks.length === 0) {
        emptyState.classList.add('show');
    } else {
        emptyState.classList.remove('show');
        
        // Filter bookmarks if search is active
        let displayBookmarks = bookmarks;
        const searchTerm = document.getElementById('searchInput')?.value.toLowerCase();
        if (searchTerm) {
            displayBookmarks = bookmarks.filter(b => 
                b.title.toLowerCase().includes(searchTerm) ||
                b.url.toLowerCase().includes(searchTerm) ||
                (b.note && b.note.toLowerCase().includes(searchTerm))
            );
        }
        
        displayBookmarks.forEach(bookmark => {
            const bookmarkEl = createBookmarkElement(bookmark);
            bookmarksList.appendChild(bookmarkEl);
        });
        
        // Initialize sortable
        initializeSortable();
    }
    
    updateStats();
}

function createBookmarkElement(bookmark) {
    const div = document.createElement('div');
    div.className = `bookmark-card ${bookmark.is_pinned ? 'pinned' : ''}`;
    div.dataset.id = bookmark.id;
    
    // Get favicon or use first letter
    const firstLetter = bookmark.title.charAt(0).toUpperCase();
    const domain = new URL(bookmark.url).hostname;
    
    // Format date
    const date = new Date(bookmark.created_at);
    const dateStr = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    
    // Add pin indicator if pinned
    const pinIndicator = bookmark.is_pinned ? '<div class="pin-indicator"><i class="fas fa-thumbtack"></i></div>' : '';
    
    div.innerHTML = `
        <div class="bookmark-date">${dateStr}</div>
        ${pinIndicator}
        <div class="bookmark-favicon">
            <i class="fas fa-globe"></i>
        </div>
        <div class="bookmark-content">
            <div class="bookmark-title">${escapeHtml(bookmark.title)}</div>
            <a href="${escapeHtml(bookmark.url)}" target="_blank" class="bookmark-url">
                <i class="fas fa-link"></i>
                ${escapeHtml(domain)}
            </a>
            ${bookmark.note ? `<div class="bookmark-note">${escapeHtml(bookmark.note)}</div>` : ''}
        </div>
        <div class="bookmark-actions">
            <button class="bookmark-btn pin ${bookmark.is_pinned ? 'pinned' : ''}" onclick="toggleBookmarkPin(${bookmark.id})">
                <i class="fas fa-${bookmark.is_pinned ? 'thumbtack' : 'thumbtack'}"></i> 
                ${bookmark.is_pinned ? '取消置顶' : '置顶'}
            </button>
            <button class="bookmark-btn qr" onclick="showQRCode('${escapeHtml(bookmark.url)}', '${escapeHtml(bookmark.title)}')">
                <i class="fas fa-qrcode"></i> 二维码
            </button>
            <button class="bookmark-btn edit" onclick="openEditModal(${bookmark.id})">
                <i class="fas fa-edit"></i> 编辑
            </button>
            <button class="bookmark-btn delete" onclick="deleteBookmark(${bookmark.id})">
                <i class="fas fa-trash"></i> 删除
            </button>
        </div>
    `;
    
    return div;
}

function initializeSortable() {
    const bookmarksList = document.getElementById('bookmarksList');
    
    // Destroy existing sortable instance
    if (sortable) {
        sortable.destroy();
    }
    
    // Only enable sortable on non-mobile devices
    if (window.innerWidth > 768) {
        sortable = new Sortable(bookmarksList, {
            animation: 150,
            handle: '.drag-handle',
            ghostClass: 'dragging',
            dragClass: 'drag-over',
            onEnd: async function(evt) {
                // Get new order
                const items = bookmarksList.querySelectorAll('.bookmark-item');
                const bookmarkIds = Array.from(items).map(item => parseInt(item.dataset.id));
                
                // Update order on server
                try {
                    const response = await fetch(`${API_BASE_URL}/bookmarks/reorder`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${authToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ bookmark_ids: bookmarkIds })
                    });
                    
                    if (response.ok) {
                        // Reload bookmarks to sync with server
                        loadBookmarks();
                    }
                } catch (error) {
                    console.error('Failed to reorder bookmarks:', error);
                    // Reload to restore original order
                    loadBookmarks();
                }
            }
        });
    }
}

async function handleAddBookmark(e) {
    e.preventDefault();
    
    const title = document.getElementById('bookmarkTitle').value.trim();
    const url = document.getElementById('bookmarkUrl').value.trim();
    const note = document.getElementById('bookmarkNote').value.trim();
    
    try {
        const response = await fetch(`${API_BASE_URL}/bookmarks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, url, note })
        });
        
        if (response.ok) {
            // Clear form
            document.getElementById('addBookmarkForm').reset();
            // Reload bookmarks
            loadBookmarks();
        } else if (response.status === 401) {
            logout();
        }
    } catch (error) {
        alert('添加书签失败，请稍后重试');
    }
}

function openEditModal(bookmarkId) {
    const bookmark = bookmarks.find(b => b.id === bookmarkId);
    if (!bookmark) return;
    
    document.getElementById('editBookmarkId').value = bookmark.id;
    document.getElementById('editTitle').value = bookmark.title;
    document.getElementById('editUrl').value = bookmark.url;
    document.getElementById('editNote').value = bookmark.note || '';
    
    document.getElementById('editModal').classList.add('show');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
}

async function handleEditBookmark(e) {
    e.preventDefault();
    
    const bookmarkId = document.getElementById('editBookmarkId').value;
    const title = document.getElementById('editTitle').value.trim();
    const url = document.getElementById('editUrl').value.trim();
    const note = document.getElementById('editNote').value.trim();
    
    try {
        const response = await fetch(`${API_BASE_URL}/bookmarks/${bookmarkId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, url, note })
        });
        
        if (response.ok) {
            closeEditModal();
            loadBookmarks();
        } else if (response.status === 401) {
            logout();
        }
    } catch (error) {
        alert('更新书签失败，请稍后重试');
    }
}

async function deleteBookmark(bookmarkId) {
    if (!confirm('确定要删除这个书签吗？')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/bookmarks/${bookmarkId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            loadBookmarks();
        } else if (response.status === 401) {
            logout();
        }
    } catch (error) {
        alert('删除书签失败，请稍后重试');
    }
}

// Utility Functions
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// New Functions for Enhanced UI
function toggleTheme() {
    const body = document.body;
    const themeIcon = document.getElementById('themeIcon');
    
    if (body.classList.contains('dark-theme')) {
        body.classList.remove('dark-theme');
        themeIcon.className = 'fas fa-moon';
        theme = 'light';
    } else {
        body.classList.add('dark-theme');
        themeIcon.className = 'fas fa-sun';
        theme = 'dark';
    }
    
    localStorage.setItem('theme', theme);
}

function toggleQuickAdd() {
    const form = document.getElementById('quickAddForm');
    const btn = document.querySelector('.btn-quick-add');
    
    if (form.style.display === 'none' || !form.style.display) {
        form.style.display = 'block';
        btn.innerHTML = '<i class="fas fa-times-circle"></i> <span>取消添加</span>';
    } else {
        form.style.display = 'none';
        btn.innerHTML = '<i class="fas fa-plus-circle"></i> <span>快速添加书签</span>';
        document.getElementById('addBookmarkForm').reset();
    }
}

function setViewMode(mode) {
    viewMode = mode;
    localStorage.setItem('viewMode', mode);
    
    const bookmarksList = document.getElementById('bookmarksList');
    const gridBtn = document.getElementById('gridView');
    const listBtn = document.getElementById('listView');
    
    if (mode === 'grid') {
        bookmarksList.className = 'bookmarks-grid';
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
    } else {
        bookmarksList.className = 'bookmarks-list';
        listBtn.classList.add('active');
        gridBtn.classList.remove('active');
    }
    
    renderBookmarks();
}

function searchBookmarks() {
    renderBookmarks();
}

function updateStats() {
    // Update total bookmarks
    document.getElementById('totalBookmarks').textContent = bookmarks.length;
    
    // Update today added
    const today = new Date().toDateString();
    const todayCount = bookmarks.filter(b => 
        new Date(b.created_at).toDateString() === today
    ).length;
    document.getElementById('todayAdded').textContent = todayCount;
    
    // Placeholder for categories and favorites
    document.getElementById('categories').textContent = '5';
    document.getElementById('favorites').textContent = Math.floor(bookmarks.length * 0.3);
}

// QR Code Functions
let currentQR = null;

function showQRCode(url, title) {
    // Clean up previous QR code
    const container = document.getElementById('qrcode-container');
    container.innerHTML = '';
    
    // Set modal content
    document.getElementById('qr-title').textContent = title;
    document.getElementById('qr-url').textContent = url;
    
    // Generate QR code
    currentQR = new QRCode(container, {
        text: url,
        width: 256,
        height: 256,
        colorDark: '#6366f1',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
    });
    
    // Show modal
    document.getElementById('qrModal').classList.add('show');
}

function closeQRModal() {
    document.getElementById('qrModal').classList.remove('show');
    currentQR = null;
}

function downloadQR() {
    if (!currentQR) return;
    
    const canvas = document.querySelector('#qrcode-container canvas');
    if (canvas) {
        const link = document.createElement('a');
        link.download = 'qrcode.png';
        link.href = canvas.toDataURL();
        link.click();
    }
}

function copyURL() {
    const url = document.getElementById('qr-url').textContent;
    navigator.clipboard.writeText(url).then(() => {
        // Show temporary success message
        const btn = document.querySelector('.btn-copy');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> 已复制';
        btn.style.background = '#10b981';
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
        }, 2000);
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        const btn = document.querySelector('.btn-copy');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> 已复制';
        btn.style.background = '#10b981';
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
        }, 2000);
    });
}

// Pin/Unpin Functions
async function toggleBookmarkPin(bookmarkId) {
    try {
        const response = await fetch(`${API_BASE_URL}/bookmarks/${bookmarkId}/pin`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const updatedBookmark = await response.json();
            
            // Update the bookmark in local array
            const index = bookmarks.findIndex(b => b.id === bookmarkId);
            if (index !== -1) {
                bookmarks[index] = updatedBookmark;
            }
            
            // Re-render bookmarks to reflect the new order
            loadBookmarks();
        } else if (response.status === 401) {
            logout();
        } else {
            console.error('Failed to toggle pin status');
        }
    } catch (error) {
        console.error('Error toggling pin status:', error);
        alert('置顶操作失败，请稍后重试');
    }
}

// Handle window resize to reinitialize sortable
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (bookmarks.length > 0) {
            renderBookmarks();
        }
    }, 250);
});