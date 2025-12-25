/**
 * 用户会话管理模块
 * 基于浏览器 Cookie 的匿名用户标识
 * 用于 UI 状态隔离，防止多用户操作互相干扰
 */

class UserSession {
    constructor() {
        this.userId = null;
        this.cookieName = 'music_player_user_id';
        this.cookieMaxAge = 30 * 24 * 60 * 60; // 30天（秒）
        this.init();
    }

    /**
     * 初始化用户会话
     */
    init() {
        // 尝试从 Cookie 读取现有用户ID
        this.userId = this.getCookie(this.cookieName);
        
        if (!this.userId) {
            // 生成新的用户ID
            this.userId = this.generateUserId();
            this.setCookie(this.cookieName, this.userId, this.cookieMaxAge);
            console.log('[用户会话] 新用户ID已创建:', this.userId);
        } else {
            console.log('[用户会话] 已恢复用户ID:', this.userId);
        }
    }

    /**
     * 生成唯一用户ID
     * 格式: u_xxxxxxxx (8位随机字符)
     */
    generateUserId() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let id = 'u_';
        for (let i = 0; i < 8; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        // 添加时间戳后4位增加唯一性
        id += Date.now().toString(36).slice(-4);
        return id;
    }

    /**
     * 获取当前用户ID
     */
    getUserId() {
        return this.userId;
    }

    /**
     * 设置 Cookie
     */
    setCookie(name, value, maxAgeSeconds) {
        const expires = new Date(Date.now() + maxAgeSeconds * 1000).toUTCString();
        document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
    }

    /**
     * 获取 Cookie
     */
    getCookie(name) {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [cookieName, cookieValue] = cookie.trim().split('=');
            if (cookieName === name) {
                return decodeURIComponent(cookieValue);
            }
        }
        return null;
    }

    /**
     * 删除 Cookie（用于调试）
     */
    clearSession() {
        document.cookie = `${this.cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        this.userId = null;
        console.log('[用户会话] 会话已清除');
    }

    /**
     * 重新生成用户ID（用于调试）
     */
    regenerateUserId() {
        this.userId = this.generateUserId();
        this.setCookie(this.cookieName, this.userId, this.cookieMaxAge);
        console.log('[用户会话] 用户ID已重新生成:', this.userId);
        return this.userId;
    }
}

// 导出单例
export const userSession = new UserSession();
