// ============================================================
// 权限管理 — 谁可以用这个系统
// ============================================================
// 这个文件负责判断每个用户能不能用系统、能用哪些功能。
// 有三种身份：
//   admin  → 管理员，什么都能干
//   viewer → 查看者，只能看数据不能改
//   null   → 没权限，不能使用系统
// ============================================================

// 从 constants.js 拿数据库实例（db）和管理员注册密码（SETUP_TOKEN）
const { db, SETUP_TOKEN } = require('./constants');

// isAdmin：查一下这个用户是不是管理员
// openid：用户的微信唯一编号
// 返回 true=是管理员 / false=不是
async function isAdmin(openid) {
  try {
    // 去数据库的 users 集合里查：有没有 openid 匹配的记录，且角色是 admin
    const res = await db.collection('users').where({ openid }).get();
    // 如果查到记录并且角色是 admin → 返回 true
    return res.data.length > 0 && res.data[0].role === 'admin';
  } catch (e) {
    // 万一数据库查询失败（比如网络问题），保守起见返回 false
    return false;
  }
}

// ensureAdminExistsCompat：兼容旧版的自动注册管理员
// 如果系统里还没有任何管理员，谁第一个调用就自动变成管理员
// openid：当前用户的微信编号
// 返回 { success, message }
async function ensureAdminExistsCompat(openid) {
  // 先查一下有没有管理员（role = 'admin'）
  const countRes = await db.collection('users').where({ role: 'admin' }).count();
  // 如果已经有了管理员 → 不用注册，直接返回
  if (countRes.total > 0) {
    return { success: true, message: '管理员已存在' };
  }
  // 还没有管理员 → 把当前用户注册为管理员
  try {
    await db.collection('users').add({
      data: { openid, role: 'admin', createdAt: Date.now() },
    });
    // 注册成功
    return { success: true, message: '已成为管理员' };
  } catch (e) {
    // 写入数据库失败
    return { success: false, message: '注册失败' };
  }
}

// ensureAdminExists：需要密码的管理员注册（对外接口）
// 用在 authInit 操作，需要前端传 token（密码）过来
// openid：当前用户， token：管理员注册密码
// 返回 { success, message }
async function ensureAdminExists(openid, token) {
  // 先查有没有管理员
  const countRes = await db.collection('users').where({ role: 'admin' }).count();
  // 如果已经有了 → 不能再注册
  if (countRes.total > 0) {
    return { success: true, message: '管理员已存在' };
  }
  // 还没管理员，检查密码对不对
  if (token !== SETUP_TOKEN) {
    // 密码不对，拒绝
    return { success: false, message: '管理员设置令牌无效' };
  }
  // 密码对了，注册为管理员
  try {
    await db.collection('users').add({
      data: { openid, role: 'admin', createdAt: Date.now() },
    });
    return { success: true, message: '已成为管理员' };
  } catch (e) {
    return { success: false, message: '注册失败' };
  }
}

// getUserRole：获取某个用户的角色
// openid：用户微信编号
// 返回 'admin' | 'viewer' | null（null 表示无权限）
async function getUserRole(openid) {
  // 先查是不是管理员
  if (await isAdmin(openid)) return 'admin';
  // 不是管理员 → 查他在不在白名单里
  try {
    const res = await db.collection('whitelist_users').where({ openid }).get();
    // 如果白名单用户表里有他 → 是 viewer
    if (res.data.length > 0) return 'viewer';
  } catch (e) {}
  // 既不是 admin 也不在白名单 → 无权限
  return null;
}

// ============================================================
// 以下是公开接口（可以被任何人调用，不需要登录）
// ============================================================

// authCheck：前端调用这个接口来查"我是什么身份？"
// openid：当前用户
// 返回：{ isAdmin, isViewer, registered, role }
async function authCheck(openid) {
  try {
    // 调用 getUserRole 获取角色
    const role = await getUserRole(openid);
    // 根据角色返回对应的身份信息
    if (role === 'admin') {
      return { success: true, isAdmin: true, isViewer: false, registered: true, role: 'admin' };
    }
    if (role === 'viewer') {
      return { success: true, isAdmin: false, isViewer: true, registered: true, role: 'viewer' };
    }
    // 没有角色 → 未注册用户
    return { success: true, isAdmin: false, isViewer: false, registered: false, role: null };
  } catch (e) {
    // 查询出错时保守返回"无权限"
    return { success: true, isAdmin: false, isViewer: false, registered: false, role: null };
  }
}

// authInit：用密码申管理员
// openid：当前用户，data：前端传来的数据（含 token 密码）
// 返回 { success, message }
async function authInit(openid, data) {
  // 从 data 里取出 token（管理员密码），调用 ensureAdminExists
  const result = await ensureAdminExists(openid, (data && data.token) || '');
  // 把结果返回给前端
  return {
    success: result.success,
    message: result.message,
  };
}

// authAddUser：管理员添加其他用户（需要调用者本身是管理员）
// adminOpenid：调用者的 openid，data：要添加的用户信息
async function authAddUser(adminOpenid, data) {
  // 先检查调用者是不是管理员
  if (!(await isAdmin(adminOpenid))) {
    return { success: false, message: '无权限' };
  }
  // 取出要添加的用户 openid 和角色（默认 admin）
  const targetOpenid = data.openid;
  const role = data.role || 'admin';

  // 检查这个用户是否已经被加过了
  const existing = await db.collection('users').where({ openid: targetOpenid }).get();
  if (existing.data.length > 0) {
    return { success: false, message: '该用户已存在' };
  }

  // 加到 users 集合
  await db.collection('users').add({
    data: { openid: targetOpenid, role, createdAt: Date.now(), addedBy: adminOpenid },
  });
  return { success: true };
}

// authRemoveUser：管理员删除用户
// adminOpenid：调用者，data：要删的目标用户
async function authRemoveUser(adminOpenid, data) {
  // 检查调用者是不是管理员
  if (!(await isAdmin(adminOpenid))) {
    return { success: false, message: '无权限' };
  }
  // 查找要删除的用户
  const targetOpenid = data.openid;
  const res = await db.collection('users').where({ openid: targetOpenid }).get();
  if (res.data.length === 0) {
    return { success: false, message: '用户不存在' };
  }
  // 从数据库删除该用户的记录
  await db.collection('users').doc(res.data[0]._id).remove();
  return { success: true };
}

// authListUsers：管理员查看所有用户列表
// adminOpenid：调用者
async function authListUsers(adminOpenid) {
  // 检查调用者是不是管理员
  if (!(await isAdmin(adminOpenid))) {
    return { success: false, message: '无权限' };
  }
  // 查询 users 集合的全部数据
  const res = await db.collection('users').get();
  // 返回用户列表
  return { success: true, data: res.data };
}

// 导出所有函数，供 index.js 路由调用
module.exports = {
  isAdmin,
  ensureAdminExists,
  ensureAdminExistsCompat,
  getUserRole,
  authCheck,
  authInit,
  authAddUser,
  authRemoveUser,
  authListUsers,
};
