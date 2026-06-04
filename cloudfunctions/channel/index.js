// ============================================================
// 促销信息共享 - 云函数入口
// ============================================================
// 这个文件是整个后端的大门口。
// 前端（手机上的小程序）调用云函数时，首先进入这个文件。
// 它会根据前端传的 action（操作类型，比如"list"查列表、"add"新增）
// 把请求分发给对应模块去处理。
// ============================================================

// 从 constants.js 导入：公开操作列表 + 各操作需要的角色权限
const { publicActions, actionPermissions } = require('./constants');

// 导入各功能模块
const auth = require('./auth');          // 用户权限相关
const records = require('./records');     // 促销员数据的增删改查
const comments = require('./comments');   // 评论和点赞
const hire = require('./hire');           // 聘用和解聘
const batch = require('./batch');         // 批量导入和数据迁移
const xlsx = require('./xlsx');           // Excel 文件解析
const healthCert = require('./healthCert'); // 健康证上传和审核
const whitelist = require('./whitelist'); // 白名单管理和账号注销

// 微信云函数开发工具包，用来操作数据库
const cloud = require('wx-server-sdk');
// 初始化云服务，DYNAMIC_CURRENT_ENV 表示自动使用当前云环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// exports.main 是整个云函数的主入口。
// 前端调用 wx.cloud.callFunction 时会触发这个函数。
// event 参数包含前端传来的数据，格式：{ action: "xxx", data: { ... } }
exports.main = async (event) => {
  // 从前端请求里取出：操作类型 + 具体数据
  const { action, data } = event;
  // 微信会自动提供当前用户的上下文信息
  const wxContext = cloud.getWXContext();
  // 每个微信用户都有一个唯一的 openid，用来识别身份
  const openid = wxContext.OPENID;

  // 用 try/catch 包住所有操作，任何地方报错都不会导致服务器崩溃
  try {
    // ──── 公开操作（不需身份校验） ────
    // 如果前端请求的操作在 publicActions 这个列表里（比如登录验证、白名单查询）
    // 就不检查用户权限，直接放行
    if (publicActions.includes(action)) {
      // 根据不同的操作名，调用不同的函数
      switch (action) {
        case 'whitelistCheck': return await whitelist.whitelistCheck(openid, data);
        case 'authCheck':      return await auth.authCheck(openid);
        case 'authInit':       return await auth.authInit(openid, data);
        case 'authAddUser':    return await auth.authAddUser(openid, data);
        case 'authRemoveUser': return await auth.authRemoveUser(openid, data);
        case 'authListUsers':  return await auth.authListUsers(openid);
        default: return { success: false, message: 'Unknown action' };
      }
    }

    // ──── 需权限的操作 ────
    // 到这里说明前端要操作数据（查/增/删/改），需要检查权限

    // 兼容旧版：如果系统里还没有任何管理员，第一个调用的用户自动变成管理员
    await auth.ensureAdminExistsCompat(openid);

    // ──── list 操作特殊处理 ────
    // 任何人都能查列表，但非授权用户只能看到自己添加的记录
    if (action === 'list') {
      const userRole = await auth.getUserRole(openid);
      // 有角色（admin/viewer）→ 看到全部；没角色 → 只看自己的
      return await records.listChannels({
        ...data,
        filterOwn: !userRole,
        creatorOpenid: !userRole ? openid : '',
      }, openid);
    }

    // ──── 基础CRUD和聘用操作允许任何人 ────
    // 非授权用户也能增删改和聘用，后端函数内部会做所有权检查
    const publicCrudActions = ['add', 'update', 'delete', 'hire', 'unhire', 'addComment', 'deleteComment'];
    if (publicCrudActions.includes(action)) {
      switch (action) {
        case 'add':           return await records.addRecord(data, openid);
        case 'update':        return await records.updateRecord(data, openid);
        case 'delete':        return await records.deleteRecord(data, openid);
        case 'hire':          return await hire.hirePromoter(data, openid);
        case 'unhire':        return await hire.unhirePromoter(data, openid);
        case 'addComment':    return await comments.addComment(data, openid);
        case 'deleteComment': return await comments.deleteComment(data, openid);
        default: break;
      }
    }

    // 查一下：这个操作允许哪些角色执行？
    // 如果在 actionPermissions 里没找到这个操作，默认只有 admin 才能用
    const allowedRoles = actionPermissions[action] || ['admin'];
    // 查一下：当前用户是什么角色？
    const userRole = await auth.getUserRole(openid);
    // 如果没角色，或者角色不在允许列表里 → 拒绝
    if (!userRole || !allowedRoles.includes(userRole)) {
      // 返回失败信息，前端会提示"无权限"
      return { success: false, message: '无权限，请联系管理员' };
    }

    // 权限通过 → 根据操作名路由到对应模块
    // （add/update/delete/hire/unhire/addComment/deleteComment 已在上面处理）
    switch (action) {
      case 'getRecord':            return await records.getRecord(data);
      case 'toggleLike':           return await comments.toggleLike(data, openid);
      case 'autoExpire':           return await hire.autoExpireHired();
      case 'batchAdd':             return await batch.batchAdd(data, openid);
      case 'batchDelete':          return await batch.batchDelete(data, openid);
      case 'migrate':              return await batch.migrateLocal(data, openid);
      case 'migrateFlatten':       return await batch.migrateFlatten(data, openid);
      case 'parseXLSX':            return await xlsx.parseXLSX(data);
      case 'generateImportTemplate': return await xlsx.generateImportTemplate();
      case 'healthCertUpload':     return await healthCert.healthCertUpload(data, openid);
      case 'healthCertReview':     return await healthCert.healthCertReview(data, openid);
      case 'whitelistAdd':         return await whitelist.whitelistAdd(openid, data);
      case 'whitelistRemove':      return await whitelist.whitelistRemove(openid, data);
      case 'whitelistList':        return await whitelist.whitelistList(openid);
      case 'deleteAccount':        return await whitelist.deleteAccount(openid);
      // 如果以上都没匹配到，说明前端传了不认识的操作名
      default:                     return { success: false, message: 'Unknown action' };
    }
  } catch (err) {
    // 不管哪里出异常，都返回错误消息，不会让用户看到系统崩溃页面
    return { success: false, message: err.message };
  }
};
