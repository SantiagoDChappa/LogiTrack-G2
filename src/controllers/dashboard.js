const {
    getDashboardOperacionesData,
    getDashboardDesempenoData,
} = require('../services/reportData');
const { RoleType } = require('../constants/enums');

const resolveRoleAndBranch = (req, res) => {
    const currentUser = res.locals.currentUser || {};
    const isAdmin = currentUser.roleId === RoleType.ADMIN.id;
    return {
        branchId: isAdmin ? (req.query.branchId ? Number(req.query.branchId) : null) : (currentUser.branchId || null),
    };
};

const getDashboardOperaciones = async (req, res) => {
    const { branchId } = resolveRoleAndBranch(req, res);
    const viewModel = await getDashboardOperacionesData(req.query, branchId);
    res.render('report/dashboard-operaciones', viewModel);
};

const getDashboardDesempeno = async (req, res) => {
    const viewModel = await getDashboardDesempenoData(req.query);
    res.render('report/dashboard-desempeno', viewModel);
};

module.exports = { getDashboardOperaciones, getDashboardDesempeno };
