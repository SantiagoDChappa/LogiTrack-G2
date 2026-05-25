function toggleNavGroup(id) {
    const group = document.getElementById(id);
    if (group) group.classList.toggle('open');
}

// Auto-abrir grupo de reportes si la URL actual es /report/...
(function () {
    if (window.location.pathname.startsWith('/report/')) {
        const group = document.getElementById('nav-group-reportes');
        if (group) group.classList.add('open');
    }
})();

const userSection  = document.querySelector('.top-header .user');
const userDropdown = document.getElementById('user-dropdown');

userSection.addEventListener('click', () => {
    const isOpen = userDropdown.classList.toggle('open');
    userSection.classList.toggle('open', isOpen);
});

document.addEventListener('click', (e) => {
    if (!userSection.contains(e.target) && !userDropdown.contains(e.target)) {
        userDropdown.classList.remove('open');
        userSection.classList.remove('open');
    }
});

const hamburgerBtn = document.getElementById('btn-hamburger');
const leftHeader   = document.querySelector('.left-header');
const navOverlay   = document.getElementById('nav-overlay');

if (hamburgerBtn && leftHeader && navOverlay) {
    const openNav = () => {
        leftHeader.classList.add('open');
        navOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    };

    const closeNav = () => {
        leftHeader.classList.remove('open');
        navOverlay.classList.remove('open');
        document.body.style.overflow = '';
    };

    hamburgerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        leftHeader.classList.contains('open') ? closeNav() : openNav();
    });

    navOverlay.addEventListener('click', closeNav);

    leftHeader.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', closeNav);
    });

    const navCloseBtn = document.getElementById('btn-nav-close');
    if (navCloseBtn) {
        navCloseBtn.addEventListener('click', closeNav);
    }
}
