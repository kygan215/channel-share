// ============================================================
// 共享数据访问层 — 所有页面都通过这个文件干活
// ============================================================
// 这个文件是前端（手机上的小程序）和后端（云函数）之间的桥梁。
// 所有页面都通过 require('../../utils/channel-service') 调用这里面的函数。
//
// 函数分类：
//   1. API 调用（跟云函数通信）
//   2. 用户信息（获取当前用户是谁）
//   3. 数据格式化（搜索、排序、导出）
// ============================================================

// ============================================================
// 第一部分：API 调用 — 跟云函数通信
// ============================================================

// 获取所有促销员记录（支持分页 + 60秒本地缓存）
// options：可选参数 { page: 第几页, pageSize: 每页几条 }
// 返回：促销员数据数组
async function getAllChannels(options = {}) {
  const page = options.page || 1;           // 默认第1页
  const pageSize = options.pageSize || 500;  // 默认每页500条

  // 如果是首页全量数据请求（第1页500条），走本地缓存
  // 缓存有效期60秒，60秒内不重复请求服务器
  if (page === 1 && pageSize === 500) {
    const cached = wx.getStorageSync('channels_cache');
    // 如果本地有缓存，且没超过60秒 → 直接用缓存数据
    if (cached && cached.data && cached.timestamp) {
      const age = Date.now() - cached.timestamp; // 计算缓存已存在多久
      if (age < 60000) {
        return cached.data; // 缓存没过期，直接返回
      }
    }
  }

  try {
    // 调用云函数 channel，执行 list 操作
    const res = await wx.cloud.callFunction({
      name: 'channel',
      data: { action: 'list', data: { page, pageSize } },
    });
    // 如果云函数返回成功
    if (res.result && res.result.success) {
      const data = res.result.data || [];
      // 如果是首页全量数据，写入本地缓存（下次不用再请求）
      if (page === 1 && pageSize === 500) {
        wx.setStorageSync('channels_cache', { data, timestamp: Date.now() });
      }
      return data;
    }
    // 云函数返回了但不是成功状态 → 返回空数组
    return [];
  } catch (err) {
    // 网络错误/服务器超时等情况
    console.error('getAllChannels error:', err);
    wx.showToast({ title: '网络异常，请检查网络', icon: 'none' });
    return [];
  }
}

// checkAuth：检查当前用户的权限身份
// 返回：{ success, isAdmin（是否管理员）, isViewer（是否查看者）, registered（是否注册）, role（角色名） }
async function checkAuth() {
  try {
    // 调用云函数的 authCheck 操作
    const res = await wx.cloud.callFunction({
      name: 'channel',
      data: { action: 'authCheck' },
    });
    // 返回结果，如果没结果就返回默认的"未授权"
    return res.result || { success: false, isAdmin: false, registered: false };
  } catch (err) {
    // 网络错误 → 保守返回"未授权"
    return { success: false, isAdmin: false, registered: false, error: err.message };
  }
}

// checkWhitelist：验证手机号是否在白名单中
// phone：要验证的手机号
// 返回：{ success, message }
async function checkWhitelist(phone) {
  try {
    // 调用云函数的 whitelistCheck 操作
    const res = await wx.cloud.callFunction({
      name: 'channel',
      data: { action: 'whitelistCheck', data: { phone } },
    });
    return res.result || { success: false, message: '验证失败' };
  } catch (err) {
    return { success: false, message: '网络错误，请稍后重试' };
  }
}

// getSettings：读取本地的功能开关设置
// 返回：{ canAdd（能否新增）, canEdit（能否修改）, canDelete（能否删除）, canPromoter（能否聘用）, canReview（能否审核） }
function getSettings() {
  // 从本地存储读取 appSettings，如果没有就用空对象
  const settings = wx.getStorageSync('appSettings') || {};
  // 每个开关默认都是 true（不限制），除非设置里明确设为 false
  return {
    canAdd: settings.permAdd !== false,
    canEdit: settings.permEdit !== false,
    canDelete: settings.permDelete !== false,
    canPromoter: settings.permPromoter !== false,
    canReview: settings.permReview !== false,
  };
}

// ============================================================
// 第二部分：用户信息 — 获取当前用户是谁
// ============================================================

// getUserId：获取或初始化当前用户的微信 openid
// 返回：openid 字符串
async function getUserId() {
  // 先从本地存储取（之前存过就直接用）
  let openid = wx.getStorageSync('_openid');
  if (!openid) {
    try {
      // 本地没有 → 调用 login 云函数获取
      const { result } = await wx.cloud.callFunction({ name: 'login' });
      openid = result.openid;
      // 存到本地，下次不用再请求
      wx.setStorageSync('_openid', openid);
    } catch (err) {
      // 如果连 login 云函数都调用失败，生成一个临时ID
      openid = 'u' + Date.now();
      wx.setStorageSync('_openid', openid);
    }
  }
  return openid;
}

// buildHireByIdentity：构建聘用时的身份标识字符串
// 例如：广东省深圳市 · 区域经理 · 张三
// 用于在"聘用"时记录谁聘的
// 返回：字符串
function buildHireByIdentity() {
  const userInfo = wx.getStorageSync('userInfo') || {}; // 读取用户信息
  const province = userInfo.province || '';   // 省份
  const city = userInfo.city || '';           // 城市
  const position = userInfo.position || '';   // 职位
  const nickname = userInfo.nickname || '';   // 昵称
  const parts = [];
  const region = province + city;             // 合并省+市
  if (region) parts.push(region);             // 如果有省市区信息就加进去
  if (position) parts.push(position);         // 有职位就加进去
  if (nickname) parts.push(nickname);         // 有昵称就加进去
  // 用 · 连接，比如"广东省深圳市 · 区域经理 · 张三"
  return parts.join(' · ') || nickname || '匿名用户';
}

// getMyNickname：获取当前用户的昵称
// 返回：昵称或"匿名用户"
function getMyNickname() {
  const userInfo = wx.getStorageSync('userInfo') || {};
  return userInfo.nickname || '匿名用户';
}

// getMyOpenid：获取当前用户的 openid
// 返回：openid 或空字符串
function getMyOpenid() {
  return wx.getStorageSync('_openid') || '';
}

// ============================================================
// 第三部分：数据格式化 — 搜索、排序、导出
// ============================================================

// normalizeTags：把标签转成数组
// 传进来可能是数组 ['沃尔玛']、也可能是字符串 "沃尔玛,家乐福"
// 总之转成统一的数组格式
// tags：标签数据
// 返回：标签数组
function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean);          // 如果是数组，过滤掉空值
  if (typeof tags === 'string') {
    // 如果是字符串，按逗号/顿号/空格分割
    return tags.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

// getHealthCertText：把健康证状态转成中文显示
// healthCert：健康证对象，形如 { status: 'none'/'pending'/'approved'/'rejected' }
// 返回：中文状态
function getHealthCertText(healthCert) {
  const status = healthCert && healthCert.status;
  if (status === 'approved') return '已认证';
  if (status === 'pending') return '待审核';
  if (status === 'rejected') return '未通过';
  return '未上传';
}

// getLatestHireInfo：获取最近一次聘用信息
// item：促销员记录，hireHistory：聘用历史数组
// 返回：{ hiredBy（谁聘的）, hiredAt（聘用日期）, unhireAt（解聘日期）, comment（评价） }
function getLatestHireInfo(item, hireHistory) {
  // 取聘用历史最后一条（最新的一条）
  const latest = hireHistory.length ? hireHistory[hireHistory.length - 1] : {};
  return {
    hiredBy: item.hiredBy || latest.hiredBy || '',
    hiredAt: item.hiredAt || latest.hiredAt || '',
    unhireAt: latest.unhireAt || '',
    comment: latest.comment || '',
  };
}

// ============================================================
// processData — 核心函数：筛选、排序、分组
// ============================================================
// 这个函数干的活最多，它把原始数据按照用户的选择进行：
//   1. 关键词搜索
//   2. 按省/市/区筛选
//   3. 按标签筛选（黑名单/优质）
//   4. 排序
//   5. 附加展示用的字段（如头像字符、状态标签）
//   6. 按省份分组
//
// options 包含：
//   allData（原始数据）、searchText（搜索关键词）
//   selectedProvince/City/District/Street（地区筛选）
//   selectedTag（标签筛选）
//   sortIndex（排序方式索引）、sortOptions（排序选项列表）
//   currentUserId（当前用户ID，用来判断"是否我创建的"）
//
// 返回：按省份分组后的数组，每组有 province 和 items
function processData(options) {
  // 从 options 里解出所有参数
  const {
    allData, searchText,
    selectedProvince, selectedCity, selectedDistrict, selectedStreet,
    selectedTag,
    sortIndex, sortOptions,
    currentUserId,
  } = options;

  // ── 第一步：关键词搜索 ──
  // 如果用户输入了搜索词，逐条筛选
  let filtered = allData.filter((item) => {
    // 没输入搜索词 → 不过滤，全部保留
    if (!searchText) return true;
    // 用空格分割多个关键词，比如"张三 深圳" → 要求同时匹配"张三"和"深圳"
    const keywords = searchText.toLowerCase().split(/\s+/).filter(Boolean);
    if (keywords.length === 0) return true;

    // 提取该条记录所有可搜索的字段，拼成一个长字符串
    const kaTags = normalizeTags(item.kaTags);
    const healthCertText = getHealthCertText(item.healthCert);
    const searchableText = [
      item.sn, item.name, item.province, item.city, item.district,
      item.street, item.phone, item.wechat, item.age, item.remark,
      item.baseSalary, item.recorderNickname, item.recorderPosition,
      item.blacklisted ? '黑名单' : '',
      item.quality ? '优质 优质临促' : '',
      item.hired ? '合作中 聘用中' : '',
      healthCertText,
      kaTags.join(' '),
    ].filter((v) => v !== undefined && v !== null).join(' ').toLowerCase();

    // 每个关键词都要能在搜索文本中找到
    return keywords.every((kw) => searchableText.indexOf(kw) !== -1);
  });

  // ── 第二步：按省/市/区筛选 ──
  if (selectedProvince && selectedProvince !== '全部省份') {
    filtered = filtered.filter((item) => item.province === selectedProvince);
  }
  if (selectedCity && selectedCity !== '全部城市') {
    filtered = filtered.filter((item) => item.city === selectedCity);
  }
  if (selectedDistrict && selectedDistrict !== '全部区镇') {
    filtered = filtered.filter((item) => item.district === selectedDistrict);
  }
  // 街道是模糊搜索（包含匹配）
  if (selectedStreet) {
    const streetKw = selectedStreet.toLowerCase();
    filtered = filtered.filter((item) => (item.street || '').toLowerCase().indexOf(streetKw) !== -1);
  }

  // ── 第三步：按标签筛选（黑名单/优质） ──
  if (selectedTag === 'blacklist') {
    // 只看黑名单
    filtered = filtered.filter((item) => item.blacklisted);
  } else if (selectedTag === 'quality') {
    // 只看优质
    filtered = filtered.filter((item) => item.quality);
  }

  // ── 第四步：排序 ──
  const sortMode = sortOptions[sortIndex]; // 获取当前选择的排序方式
  if (sortMode === '序号降序') {
    // 按序号从大到小
    filtered.sort((a, b) => (b.sn || 0) - (a.sn || 0));
  } else {
    // 默认按序号从小到大
    filtered.sort((a, b) => (a.sn || 0) - (b.sn || 0));
  }

  // ── 第五步：给每条记录附加展示字段 ──
  filtered = filtered.map((item) => {
    const hireHistory = Array.isArray(item.hireHistory) ? item.hireHistory : [];
    const hasComments = (item.comments || []).length > 0;           // 有没有评论
    const hasHistory = hireHistory.length > 0 || item.hired || hasComments; // 有没有聘用历史
    const hireStatus = hasHistory ? 'hired_before' : 'none';         // 聘用状态
    const kaTags = normalizeTags(item.kaTags);
    const latestHire = getLatestHireInfo(item, hireHistory);
    // 拼装展示标签
    const detailTags = [];
    if (item.age) detailTags.push(`年龄 ${item.age}岁`);
    if (kaTags.length > 0) detailTags.push(`卖场 ${kaTags.length}项`);
    if (item.baseSalary) detailTags.push(`底薪 ${item.baseSalary}元/天`);
    if (item.blacklisted) detailTags.push('黑名单');
    if (item.quality) detailTags.push('优质临促');
    detailTags.push(`健康证${getHealthCertText(item.healthCert)}`);
    if (hasComments) detailTags.push(`评价 ${item.comments.length}条`);

    // 返回增强后的数据（在原有字段基础上附加了 _ 开头的字段）
    return {
      ...item,  // 保留原始字段
      kaTags,
      _avatarChar: (item.name || '?').slice(0, 1),      // 头像显示字符（名字第一个字）
      _hireStatus: hireStatus,                            // 聘用状态
      _hasHistory: hasHistory,                            // 是否有历史记录
      _isCreator: item.creatorUserId === currentUserId,   // 是否当前用户创建的
      _detailTags: detailTags,                            // 展示标签数组
      _healthCertText: getHealthCertText(item.healthCert),// 健康证状态
      _latestHire: latestHire,                            // 最近聘用信息
      // 下面这些保证字段必定存在（防止前端访问 undefined 报错）
      likes: item.likes || [],
      hireHistory: hireHistory.map((h) => ({
        ...h, id: h.id || 0,
        hiredBy: h.hiredBy || '未知', hiredAt: h.hiredAt || '',
        comment: h.comment || '', unhireAt: h.unhireAt || '', unhireBy: h.unhireBy || '',
      })),
      comments: (item.comments || []).map((c) => ({
        ...c, _avatarChar: (c.nickname || '?').slice(0, 1),
      })),
    };
  });

  // ── 第六步：按省份分组 ──
  const groupMap = new Map();
  filtered.forEach((item) => {
    const p = item.province || '未知';
    if (!groupMap.has(p)) groupMap.set(p, []);
    groupMap.get(p).push(item);
  });

  // 把 Map 转成数组格式
  let groups = [];
  groupMap.forEach((items, province) => {
    groups.push({ province, items });
  });

  // ── 组排序（省份排序） ──
  if (sortMode === '省份A-Z') {
    groups.sort((a, b) => a.province.localeCompare(b.province, 'zh'));
  } else if (sortMode === '省份Z-A') {
    groups.sort((a, b) => b.province.localeCompare(a.province, 'zh'));
  } else if (sortMode === '序号升序') {
    groups.sort((a, b) => (a.items[0].sn || 0) - (b.items[0].sn || 0));
  } else if (sortMode === '序号降序') {
    groups.sort((a, b) => (b.items[0].sn || 0) - (a.items[0].sn || 0));
  }

  return groups; // 返回分组后的数据
}

// ============================================================
// exportToCSV — 将分组数据导出为 CSV 格式
// ============================================================
// groupedData：processData 处理后的分组数据
// 返回：{ filePath（文件路径）, csvContent（CSV 内容）, fileName（文件名）} 或 null（导出失败）
function exportToCSV(groupedData) {
  // 先把分组数据拍平成一个数组
  const records = [];
  groupedData.forEach((group) => {
    group.items.forEach((item) => { records.push(item); });
  });

  if (records.length === 0) return false; // 没有数据，无法导出

  // CSV 的表头（Excel 第一行）
  const headers = ['序号', '姓名', '年龄', '省份', '城市', '区/镇', '乡/县/镇/街道', '电话', '微信号', '卖场经验', '底薪(元/天)', '备注', '内部标注', '聘用状态', '记录人', '记录人职位', '健康证', '评论数'];
  // 把每条记录转成一行数组
  const rows = records.map((r) => {
    const healthCertStatus = r.healthCert
      ? ({ none: '未上传', pending: '待审核', approved: '已认证', rejected: '已驳回' }[r.healthCert.status] || '未上传')
      : '未上传';
    const hireStatus = r.hired ? '在岗' : ((r.hireHistory || []).length > 0 ? '有记录' : '空闲');
    const internalTag = r.blacklisted ? '⚫黑名单' : (r.quality ? '⭐优质' : '');
    return [
      r.sn || '', r.name || '', r.age || '',
      r.province || '', r.city || '', r.district || '', r.street || '',
      r.phone || '', r.wechat || '',
      (r.kaTags || []).join('、'), r.baseSalary || '', r.remark || '',
      internalTag, hireStatus,
      r.recorderNickname || '', r.recorderPosition || '',
      healthCertStatus, (r.comments || []).length,
    ];
  });

  // 把数组转成 CSV 文本（处理逗号和引号的转义）
  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => {
      const str = String(cell);
      // 内容里如果有逗号或引号，需要用引号包起来
      return str.indexOf(',') !== -1 || str.indexOf('"') !== -1
        ? '"' + str.replace(/"/g, '""') + '"'
        : str;
    }).join(','))
    .join('\n');

  // 写入临时文件
  const fs = wx.getFileSystemManager();
  const fileName = `促销员数据_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.csv`;
  const filePath = wx.env.USER_DATA_PATH + '/' + fileName;

  try {
    // BOM + 内容（BOM 保证 Excel 打开不乱码）
    fs.writeFileSync(filePath, '﻿' + csvContent, 'utf8');
    return { filePath, csvContent, fileName };
  } catch (err) {
    console.error('导出失败', err);
    return null;
  }
}

// ============================================================
// 统一导出 — 所有页面都从这拿函数
// ============================================================
// 页面中这样用：
//   const { getAllChannels, processData } = require('../../utils/channel-service');
module.exports = {
  // API 调用
  getAllChannels, checkAuth, checkWhitelist, getSettings,
  // 用户信息
  getUserId, buildHireByIdentity, getMyNickname, getMyOpenid,
  // 数据格式化
  normalizeTags, getHealthCertText, getLatestHireInfo,
  processData, exportToCSV,
};
