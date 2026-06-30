const AVATAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444', '#84cc16'];

const avatarColor = (name) => {
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) { h = name.charCodeAt(i) + ((h << 5) - h); }
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

const initials = (name) => {
    if (!name) { return '?'; }
    const p = name.trim().split(' ');
    return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
};

module.exports = { avatarColor, initials };
