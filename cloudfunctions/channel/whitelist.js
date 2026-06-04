// ============================================================
// 白名单管理 & 账号注销
// ============================================================
// 这个文件负责：
//   白名单验证（根据手机号判断用户是否有权限查看数据）
//   白名单增删查（管理员管理）
//   账号注销（从 users 和 whitelist_users 删除用户）
// ============================================================

const { db } = require('./constants');
const { getDoc } = require('./records');
const { isAdmin } = require('./auth');

// ============================================================
// whitelistCheck：验证手机号是否在白名单中
// 这是公开接口（任何人都能调用）
// 如果验证通过，会自动把 openid → phone 的映射写入 whitelist_users 集合
// 后续该用户再次访问时，直接通过 openid 识别身份，不用再输手机号
// ============================================================
async function whitelistCheck(openid, data) {
  // 取出要验证的手机号
  const phone = (data && data.phone) || '';
  if (!phone) return { success: false, message: '请输入手机号' };

  try {
    // 查一下白名单集合（如果集合不存在，count 返回 0）
    let total = 0;
    try {
      const wlCount = await db.collection('whitelist').count();
      total = wlCount.total;
    } catch (e) {
      // 集合不存在时视为空集合
      total = 0;
    }
    // 如果白名单还没配置（空集合）→ 提示联系管理员
    if (total === 0) {
      return { success: false, message: '系统尚未配置白名单，请联系管理员' };
    }
    // 查这个手机号是否在白名单中
    const res = await db.collection('whitelist').where({ phone }).get();
    if (res.data.length === 0) {
      return { success: false, message: '手机号不在白名单中' };
    }

    // 验证通过 → 记录 openid 和 phone 的关联关系
    // 下次该用户再来就不用重新验证了
    const existing = await db.collection('whitelist_users').where({ openid }).get();
    if (existing.data.length === 0) {
      await db.collection('whitelist_users').add({
        data: { openid, phone, role: 'viewer', verifiedAt: Date.now() },
      });
    }
    return { success: true, message: '验证通过' };
  } catch (e) {
    return { success: false, message: '验证失败，请稍后重试' };
  }
}

// ============================================================
// whitelistAdd：管理员添加手机号到白名单（支持批量）
// data：{ phones: ['138xxx', '139xxx'] }
// 流程：直接尝试写入，不怕集合不存在和重复
// ============================================================
async function whitelistAdd(adminOpenid, data) {
  // 检查调用者是不是管理员
  if (!(await isAdmin(adminOpenid))) {
    return { success: false, message: '无权限' };
  }
  const phones = data.phones || [];
  if (phones.length === 0) return { success: false, message: '请提供手机号' };

  // 逐个添加
  let added = 0;
  const errors = [];
  for (const phone of phones) {
    const trimmed = phone.trim();
    if (!trimmed) continue;
    try {
      // 直接尝试写入（微信云数据库：集合不存在时，add 会自动创建集合）
      // 用 phone 作为唯一标识，避免重复
      await db.collection('whitelist').add({
        data: { phone: trimmed, addedBy: adminOpenid, createdAt: Date.now() },
      });
      added++;
    } catch (e) {
      // 如果是"记录已存在"类的错误，忽略（不是真错误）
      if (e.message && e.message.indexOf('duplicate') !== -1) {
        errors.push(`${trimmed}（已存在）`);
      } else if (e.message && e.message.indexOf('permission') !== -1) {
        errors.push(`${trimmed}（数据库权限不足，请去云开发控制台创建 whitelist 集合）`);
      } else {
        console.error(`whitelistAdd error for ${trimmed}:`, e);
        errors.push(`${trimmed}（${e.message}）`);
      }
    }
  }
  return { success: true, added, total: phones.length, errors: errors.length > 0 ? errors : undefined };
}

// ============================================================
// whitelistRemove：管理员移除白名单中的某个手机号
// data：{ phone: '138xxx' }
// 注意：同时会清除 whitelist_users 中的关联记录
// ============================================================
async function whitelistRemove(adminOpenid, data) {
  // 检查权限
  if (!(await isAdmin(adminOpenid))) {
    return { success: false, message: '无权限' };
  }
  const phone = (data && data.phone) || '';
  if (!phone) return { success: false, message: '请提供手机号' };

  // 从 whitelist 集合删除
  const res = await db.collection('whitelist').where({ phone }).get();
  if (res.data.length === 0) return { success: false, message: '该手机号不在白名单中' };
  await db.collection('whitelist').doc(res.data[0]._id).remove();

  // 同时清除 whitelist_users 中的关联（该用户下次需要重新验证）
  const userRes = await db.collection('whitelist_users').where({ phone }).get();
  if (userRes.data.length > 0) {
    await db.collection('whitelist_users').doc(userRes.data[0]._id).remove();
  }

  return { success: true };
}

// ============================================================
// whitelistList：管理员查看所有白名单
// ============================================================
async function whitelistList(adminOpenid) {
  // 检查权限
  if (!(await isAdmin(adminOpenid))) {
    return { success: false, message: '无权限' };
  }
  // 返回全部白名单
  const res = await db.collection('whitelist').get();
  return { success: true, data: res.data, total: res.data.length };
}

// ============================================================
// deleteAccount：注销账号
// 从 users 和 whitelist_users 两个集合中删除该用户的记录
// 注意：不会删除 channels 中的数据（促销员数据归属系统，不属于个人）
// ============================================================
async function deleteAccount(openid) {
  // 从 users 集合删除
  const userRes = await db.collection('users').where({ openid }).get();
  if (userRes.data.length > 0) {
    await db.collection('users').doc(userRes.data[0]._id).remove();
  }
  // 从 whitelist_users 集合删除
  const wlUserRes = await db.collection('whitelist_users').where({ openid }).get();
  if (wlUserRes.data.length > 0) {
    await db.collection('whitelist_users').doc(wlUserRes.data[0]._id).remove();
  }
  return { success: true, message: '账号已注销' };
}

module.exports = {
  whitelistCheck,   // 验证手机号
  whitelistAdd,     // 添加白名单
  whitelistRemove,  // 移除白名单
  whitelistList,    // 查看白名单
  deleteAccount,    // 注销账号
};
