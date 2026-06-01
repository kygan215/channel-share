// ============================================================
// 促销员记录 CRUD（增删改查）
// ============================================================
// 这个文件负责促销员数据的最基本操作：
//   查列表(list)、看详情(getRecord)、新增(addRecord)、
//   修改(updateRecord)、删除(deleteRecord)
// 所有函数都返回统一格式：{ success: true/false, 其他数据... }
// ============================================================

// 从 constants.js 获取数据库实例(db)和查询操作符(_)
// _ 用于高级查询，比如 _.in(数组) 表示"字段值在数组内"
const { db, _ } = require('./constants');

// getDoc：根据数字 id 查找单条记录（内部函数，不对外暴露）
// numericId：促销员记录的数字编号（不是数据库的 _id）
// 返回：找到的记录对象，或 null（没找到）
async function getDoc(numericId) {
  // 在 channels 集合里找 id 字段 = numericId 的文档
  const res = await db.collection('channels').where({ id: numericId }).get();
  // 如果找到了就返回第一条，否则返回 null
  return res.data[0] || null;
}

// ============================================================
// listChannels：获取促销员记录列表（支持分页 + 筛选）
// ============================================================
// data：前端传的参数，可能包含：
//   page（第几页，默认1）、pageSize（每页多少条，默认500）
//   province（按省份筛选）、status（按状态筛选：hired/idle）
// 返回：{ success, data（记录数组）, total（总数）, page, pageSize }
async function listChannels(data) {
  // 解析前端传来的参数，没有就用默认值
  const params = data || {};
  const page = params.page || 1;               // 当前页数
  const pageSize = Math.min(params.pageSize || 500, 500); // 每页最多500条
  const MAX_LIMIT = 100;  // 微信数据库单次最多只能取100条

  // 先统计 channels 集合总共有多少条数据
  const countResult = await db.collection('channels').count();
  const total = countResult.total;  // 总记录数
  // 如果一条数据都没有，直接返回空数组
  if (total === 0) return { success: true, data: [], total: 0 };

  // 计算要跳过多少条（第2页就跳过前pageSize条）
  const skip = (page - 1) * pageSize;

  // ---- 有筛选条件：按省份或状态过滤 ----
  if (params.province || params.status) {
    // 构建查询条件
    let query = db.collection('channels');
    if (params.status === 'hired') query = query.where({ hired: true });    // 只看在岗的
    else if (params.status === 'idle') query = query.where({ hired: false }); // 只看空闲的
    if (params.province) query = query.where({ province: params.province }); // 只看某个省

    // 统计筛选后的总数
    const filteredCount = await query.count();
    const fTotal = filteredCount.total;

    if (pageSize >= fTotal) {
      // 要取的数量 >= 总数 → 一次全部取完
      // 计算需要分几次取（因为每次最多100条）
      const batchTimes = Math.ceil(fTotal / MAX_LIMIT);
      const tasks = [];
      for (let i = 0; i < batchTimes; i++) {
        // 每次跳 i*100 条（第一次跳0，第二次跳100，第三次跳200...）
        tasks.push(query.skip(i * MAX_LIMIT).limit(MAX_LIMIT).get());
      }
      // 并发执行所有请求（Promise.all 会等所有请求都完成）
      const results = await Promise.all(tasks);
      // 把多次请求的结果合并成一个数组
      let items = [];
      results.forEach((r) => { items = items.concat(r.data); });
      return { success: true, data: items, total: fTotal, page, pageSize };
    } else {
      // 要分页取 → 按 page 和 pageSize 计算从哪里开始
      const batchTimes = Math.ceil(pageSize / MAX_LIMIT);
      const tasks = [];
      for (let i = 0; i < batchTimes; i++) {
        // skip = 当前页的起始位置 + 第几次取
        tasks.push(query.skip(skip + i * MAX_LIMIT).limit(MAX_LIMIT).get());
      }
      const results = await Promise.all(tasks);
      let items = [];
      results.forEach((r) => { items = items.concat(r.data); });
      return { success: true, data: items, total: fTotal, page, pageSize };
    }
  }

  // ---- 无筛选条件：取出全部数据 ----
  if (pageSize >= total) {
    // 一次取完所有数据
    const batchTimes = Math.ceil(total / MAX_LIMIT);
    const tasks = [];
    for (let i = 0; i < batchTimes; i++) {
      tasks.push(db.collection('channels').skip(i * MAX_LIMIT).limit(MAX_LIMIT).get());
    }
    const results = await Promise.all(tasks);
    let items = [];
    results.forEach((r) => { items = items.concat(r.data); });
    return { success: true, data: items, total };
  }

  // 分页取全部数据（不筛选，但分页）
  const batchTimes = Math.ceil(pageSize / MAX_LIMIT);
  const tasks = [];
  for (let i = 0; i < batchTimes; i++) {
    tasks.push(db.collection('channels').skip(skip + i * MAX_LIMIT).limit(MAX_LIMIT).get());
  }
  const results = await Promise.all(tasks);
  let items = [];
  results.forEach((r) => { items = items.concat(r.data); });
  return { success: true, data: items, total, page, pageSize };
}

// ============================================================
// getRecord：查看某一条促销员的详细信息
// ============================================================
// data：前端传的参数，包含 data.id（促销员的数字编号）
async function getRecord(data) {
  // 根据数字 id 查找记录
  const doc = await getDoc(data.id);
  if (!doc) return { success: false, message: '记录不存在' };
  // 找到后返回完整数据
  return { success: true, data: doc };
}

// ============================================================
// addRecord：新增一条促销员记录
// ============================================================
// data：前端填写的表单数据
// openid：当前操作者的微信编号
// 注意：如果同一个手机号已存在，则更新而不是重复新增
async function addRecord(data, openid) {
  const phone = data.phone || '';  // 手机号

  // 如果填了手机号，检查数据库里是否已存在相同手机号的记录
  if (phone) {
    const existing = await db.collection('channels').where({ phone }).get();
    if (existing.data.length > 0) {
      // 找到了同一手机号的记录 → 更新这条记录而不是新增
      const doc = existing.data[0];
      // 只更新前端传了值的字段（没传的保持不变）
      const updateData = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.province !== undefined) updateData.province = data.province;
      if (data.city !== undefined) updateData.city = data.city;
      if (data.district !== undefined) updateData.district = data.district;
      if (data.street !== undefined) updateData.street = data.street;
      if (data.wechat !== undefined) updateData.wechat = data.wechat;
      if (data.age !== undefined) updateData.age = data.age;
      if (data.remark !== undefined) updateData.remark = data.remark;
      if (data.kaTags !== undefined) updateData.kaTags = data.kaTags;
      if (data.baseSalary !== undefined) updateData.baseSalary = data.baseSalary;
      if (data.blacklisted !== undefined) updateData.blacklisted = data.blacklisted;
      if (data.quality !== undefined) updateData.quality = data.quality;

      // 写入数据库更新
      await db.collection('channels').doc(doc._id).update({ data: updateData });
      return { success: true, _id: doc._id, id: doc.id, merged: true };
    }
  }

  // 没有重复手机号 → 正常新增一条记录
  const record = {
    id: Date.now(),              // 用当前时间戳作为数字编号
    sn: data.sn || 0,            // 序号（同一省份内自增）
    name: data.name || '',       // 姓名
    province: data.province || '', // 省份
    city: data.city || '',       // 城市
    district: data.district || '', // 区/镇
    street: data.street || '',   // 详细地址
    phone,                       // 电话
    wechat: data.wechat || '',   // 微信号
    age: data.age || '',         // 年龄
    remark: data.remark || '',   // 备注
    baseSalary: data.baseSalary || '', // 底薪
    blacklisted: data.blacklisted || false, // 是否黑名单
    quality: data.quality || false,      // 是否优质
    kaTags: data.kaTags || [],   // 卖场经验标签
    healthCert: { status: 'none' }, // 健康证状态，默认"未上传"
    hired: false,                // 是否在岗
    hiredBy: '',                 // 聘用者
    hiredAt: '',                 // 聘用日期
    likes: [],                   // 点赞用户列表
    comments: [],                // 评论列表
    hireHistory: [],             // 聘用历史
    recorderUserId: data.recorderUserId || openid, // 录入人 openid
    recorderNickname: data.recorderNickname || '', // 录入人昵称
    recorderPosition: data.recorderPosition || '', // 录入人职位
    recorderProvince: data.recorderProvince || '', // 录入人所属省份
    recorderCity: data.recorderCity || '',         // 录入人所属城市
    creatorUserId: openid,       // 创建者的 openid
    createdAt: Date.now(),       // 创建时间
  };
  // 写入数据库
  const res = await db.collection('channels').add({ data: record });
  return { success: true, _id: res._id, id: record.id, merged: false };
}

// ============================================================
// updateRecord：修改促销员信息
// ============================================================
// data：前端传的要修改的字段（只修改有值的字段）
// openid：当前操作者
// 限制：只能编辑自己创建的记录
async function updateRecord(data, openid) {
  // 先找到这条记录
  const doc = await getDoc(data.id);
  if (!doc) return { success: false, message: '记录不存在' };
  // 检查：操作者必须是这条记录的创建者
  if (doc.creatorUserId !== openid) return { success: false, message: '只能编辑自己创建的内容' };

  // 只更新前端传了值的字段
  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.province !== undefined) updateData.province = data.province;
  if (data.city !== undefined) updateData.city = data.city;
  if (data.district !== undefined) updateData.district = data.district;
  if (data.street !== undefined) updateData.street = data.street;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.wechat !== undefined) updateData.wechat = data.wechat;
  if (data.age !== undefined) updateData.age = data.age;
  if (data.remark !== undefined) updateData.remark = data.remark;
  if (data.kaTags !== undefined) updateData.kaTags = data.kaTags;
  if (data.baseSalary !== undefined) updateData.baseSalary = data.baseSalary;
  if (data.blacklisted !== undefined) updateData.blacklisted = data.blacklisted;
  if (data.quality !== undefined) updateData.quality = data.quality;

  // 执行数据库更新
  await db.collection('channels').doc(doc._id).update({ data: updateData });
  return { success: true };
}

// ============================================================
// deleteRecord：删除一条促销员记录
// ============================================================
// data：包含 data.id（要删除的记录编号）
// openid：当前操作者
// 限制：只能删除自己创建的记录
async function deleteRecord(data, openid) {
  // 找到这条记录
  const doc = await getDoc(data.id);
  if (!doc) return { success: false, message: '记录不存在' };
  // 检查是否是本人创建的
  if (doc.creatorUserId !== openid) return { success: false, message: '只能删除自己创建的内容' };
  // 从数据库永久删除
  await db.collection('channels').doc(doc._id).remove();
  return { success: true };
}

// 导出所有函数，供其他模块使用（comments.js 和 healthCert.js 会用到 getDoc）
module.exports = {
  getDoc,        // 内部函数，但其他模块需要（评论、健康证也要根据记录ID操作）
  listChannels,  // 查列表
  getRecord,     // 看详情
  addRecord,     // 新增
  updateRecord,  // 修改
  deleteRecord,  // 删除
};
