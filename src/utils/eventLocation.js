const userModel   = require('../models/user');
const branchModel = require('../models/branch');

const hasValue = (v) => v !== null && v !== undefined;

const toCoords = (branch) => ({
    latitude:  hasValue(branch?.latitude)  ? Number(branch.latitude)  : null,
    longitude: hasValue(branch?.longitude) ? Number(branch.longitude) : null,
    branchId:  branch?.id || null,
});

const resolveBranchCoords = async (branchId) => {
    if (!branchId) { return { latitude: null, longitude: null, branchId: null }; }
    const branch = await branchModel.getById(branchId);
    return toCoords(branch);
};

const resolveUserBranchCoords = async (userId) => {
    if (!userId) { return { latitude: null, longitude: null, branchId: null }; }
    const user = await userModel.getById(userId);
    if (!user?.branchId) { return { latitude: null, longitude: null, branchId: null }; }
    return resolveBranchCoords(user.branchId);
};

module.exports = { resolveBranchCoords, resolveUserBranchCoords };
