'use strict';

const {
    getArticlesForRole,
    getArticleBySlug,
    getCategoriesForArticles,
    CATEGORIES,
} = require('../data/helpArticles');

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

    return res.render('help/article', {
        article,
        categoryLabel,
        roleId,
    });
};

module.exports = { index, showArticle };
