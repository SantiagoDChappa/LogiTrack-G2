const btn   = document.getElementById('btn-theme');
const icon  = document.getElementById('theme-icon');
const label = document.getElementById('theme-label');
const html  = document.documentElement;

const saved = localStorage.getItem('theme') ?? 'light';
applyTheme(saved);

btn.addEventListener('click', () => {
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';

    btn.classList.add('spinning');
    setTimeout(() => btn.classList.remove('spinning'), 400);

    html.classList.add('theme-animated');
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    applyTheme(next);

    setTimeout(() => html.classList.remove('theme-animated'), 300);
});

function applyTheme(eTheme) {
    if (eTheme === 'dark') {
        icon.textContent  = 'dark_mode';
        label.textContent = 'Modo oscuro';
    } else {
        icon.textContent  = 'light_mode';
        label.textContent = 'Modo claro';
    }
}
