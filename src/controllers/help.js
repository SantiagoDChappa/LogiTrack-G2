'use strict';

const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

const {
    getArticlesForRole,
    getArticleBySlug,
    getAccessibleSlugs,
    getCategoriesForArticles,
    CATEGORIES,
} = require('../data/helpArticles');

const ARTICLES_DIR = path.join(__dirname, '..', 'views', 'help', 'articles');

// El acceso directo a un artículo sigue gateado por rol (showArticle -> 404).
// Pero un artículo puede enlazar a otros que el rol actual no tiene permitido:
// para que no se generen 404 al navegar, quitamos esos enlaces del HTML ya
// renderizado. Los ítems de "Artículos relacionados" se eliminan; los enlaces
// dentro de la prosa se degradan a texto (se conserva la etiqueta).
const stripInaccessibleHelpLinks = (html, accessibleSlugs) => {
    const isOk = (slug) => accessibleSlugs.has(slug);
    // 1) Ítems de lista de relacionados: <li><a href="/help/slug">…</a></li>
    let out = html.replace(
        /<li>\s*<a\b[^>]*\bhref="\/help\/([a-z0-9-]+)"[^>]*>[\s\S]*?<\/a>\s*<\/li>/gi,
        (match, slug) => (isOk(slug) ? match : '')
    );
    // 2) Enlaces en prosa: <a href="/help/slug">texto</a> -> texto
    out = out.replace(
        /<a\b[^>]*\bhref="\/help\/([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/gi,
        (match, slug, inner) => (isOk(slug) ? match : inner)
    );
    return out;
};

const index = (req, res) => {
    const roleId = Number(res.locals.currentUser.roleId);
    const articles = getArticlesForRole(roleId);
    const categories = getCategoriesForArticles(articles);

    return res.render('help/index', {
        articles,
        categories,
        roleId,
    });
};

const showArticle = (req, res) => {
    const roleId = Number(res.locals.currentUser.roleId);
    const article = getArticleBySlug(req.params.slug, roleId);

    if (!article) {
        return res.status(404).render('error', {
            status: 404,
            message: 'Artículo de ayuda no encontrado',
        });
    }

    const categoryLabel = CATEGORIES[article.category]?.label || 'Ayuda';

    // Pre-renderizamos el cuerpo del artículo para poder limpiar los enlaces a
    // artículos que este rol no puede ver. Si algo falla, article.ejs hace el
    // include directo como fallback.
    let articleHtml = null;
    try {
        const file = path.join(ARTICLES_DIR, `${article.partial}.ejs`);
        const raw = ejs.render(fs.readFileSync(file, 'utf8'), { ...res.locals }, { filename: file });
        articleHtml = stripInaccessibleHelpLinks(raw, getAccessibleSlugs(roleId));
    } catch {
        articleHtml = null;
    }

    return res.render('help/article', {
        article,
        categoryLabel,
        roleId,
        articleHtml,
    });
};

module.exports = { index, showArticle };
