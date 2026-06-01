// ============================================================
// 批量操作 & 数据迁移
// ============================================================
// 这个文件处理大数据量的操作：
//   批量导入（batchAdd）— 支持追加模式和覆盖模式
//   批量删除（batchDelete）— 只能删自己创建的
//   本地迁移（migrateLocal）— 从本地存储迁到云
//   扁平化迁移（migrateFlatten）— 旧格式→新格式
// ============================================================

const { db, _ } = require('./constants');
const { getDoc } = require('./records');

// ============================================================
// batchAdd：批量导入记录
// data：{ records: 记录数组, mode: 'append'或'replace' }
// openid：操作者
// 注意：如果 mode='replace'，会先清空所有数据再导入
// ============================================================
async function batchAdd(data, openid) {
  const records = data.records || [];
  if (records.length === 0) return { success: false, message: '无数据' };

  // 覆盖模式：先清空所有现有的数据
  if (data.mode === 'replace') {
    const MAX_LIMIT = 100;
    const countResult = await db.collection('channels').count();
    const total = countResult.total;
    if (total > 0) {
      const batchTimes = Math.ceil(total / MAX_LIMIT);
      for (let i = 0; i < batchTimes; i++) {
        // 每次取 100 条并删除
        const res = await db.collection('channels').skip(i * MAX_LIMIT).limit(MAX_LIMIT).get();
        const removeTasks = res.data.map((doc) => db.collection('channels').doc(doc._id).remove());
        await Promise.all(removeTasks);
      }
    }
  }

  // 组装新记录
  const now = Date.now();
  const docs = records.map((item, index) => ({
    id: now + index,                                            // 每条的ID = 时间戳 + 序号
    sn: item.sn || index + 1,                                   // 序号
    name: item.name || '', province: item.province || '',
    city: item.city || '', district: item.district || '', street: item.street || '',
    phone: item.phone || '', wechat: item.wechat || '',
    age: item.age || '', remark: item.remark || '',
    baseSalary: item.baseSalary || '',
    blacklisted: item.blacklisted || /黑名单/.test(item.internalTag || ''),
    quality: item.quality || /优质/.test(item.internalTag || ''),
    kaTags: Array.isArray(item.kaTags)
      ? item.kaTags
      : (typeof item.kaTags === 'string'
        ? item.kaTags.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
        : []),
    healthCert: { status: 'none' },
    hired: false, hiredBy: '', hiredAt: '',
    likes: [], comments: [], hireHistory: [],
    recorderUserId: item.recorderUserId || openid,
    recorderNickname: item.recorderNickname || '',
    recorderPosition: item.recorderPosition || '',
    recorderProvince: item.recorderProvince || '',
    recorderCity: item.recorderCity || '',
    creatorUserId: openid,
    createdAt: now,
  }));

  // 分批写入（每次最多写 100 条，微信数据库限制）
  const batchSize = 100;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    const promises = batch.map((d) => db.collection('channels').add({ data: d }));
    await Promise.all(promises);
  }

  return { success: true, count: docs.length };
}

// ============================================================
// batchDelete：批量删除（只能删自己创建的）
// data：{ ids: 要删除的记录ID数组 }
// openid：操作者
// ============================================================
async function batchDelete(data, openid) {
  const ids = data.ids || [];
  if (ids.length === 0) return { success: false, message: '无ID' };

  let deleted = 0;
  const batchSize = 100;
  // 分批处理
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    // 查找这些ID的记录
    const res = await db.collection('channels').where({ id: _.in(batch) }).get();
    // 只删除自己创建的那些
    const tasks = res.data
      .filter((doc) => doc.creatorUserId === openid)
      .map((doc) => db.collection('channels').doc(doc._id).remove());
    await Promise.all(tasks);
    deleted += tasks.length;
  }

  return { success: true, count: deleted };
}

// ============================================================
// migrateLocal：从本地存储迁移数据到云端
// data：{ records: 本地存储的记录数组 }
// openid：操作者
// ============================================================
async function migrateLocal(data, openid) {
  if (!data.records || data.records.length === 0) {
    return { success: false, message: '无数据可迁移' };
  }

  const now = Date.now();
  const docs = data.records.map((item, index) => ({
    id: item.id || now + index,
    sn: item.sn || 0,
    name: item.name || '', province: item.province || '',
    city: item.city || '', district: item.district || '', street: item.street || '',
    phone: item.phone || '', wechat: item.wechat || '',
    age: item.age || '', remark: item.remark || '',
    baseSalary: item.baseSalary || '',
    blacklisted: item.blacklisted || false, quality: item.quality || false,
    kaTags: Array.isArray(item.kaTags) ? item.kaTags : [],
    hired: item.hired || false, hiredBy: item.hiredBy || '', hiredAt: item.hiredAt || '',
    likes: item.likes || [], comments: item.comments || [], hireHistory: item.hireHistory || [],
    recorderUserId: item.recorderUserId || openid,
    recorderNickname: item.recorderNickname || '',
    recorderPosition: item.recorderPosition || '',
    recorderProvince: item.recorderProvince || '',
    recorderCity: item.recorderCity || '',
    creatorUserId: item.creatorUserId || openid,
    createdAt: now,
  }));

  // 分批写入
  const batchSize = 100;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    const promises = batch.map((d) => db.collection('channels').add({ data: d }));
    await Promise.all(promises);
  }

  return { success: true, count: docs.length };
}

// ============================================================
// migrateFlatten：扁平化迁移
// 旧格式：一条记录里嵌套了 promoters 数组
// 新格式：每条记录只有一个人
// 这个函数把旧数据全部读取 → 拆分成新格式 → 删除旧数据 → 写入新数据
// ============================================================
async function migrateFlatten(data, openid) {
  // 统计总数据量
  const countResult = await db.collection('channels').count();
  const total = countResult.total;
  if (total === 0) return { success: true, count: 0, message: '无数据' };

  // 读取全部旧文档
  const MAX_LIMIT = 100;
  const batchTimes = Math.ceil(total / MAX_LIMIT);
  const allDocs = [];
  for (let i = 0; i < batchTimes; i++) {
    const res = await db.collection('channels').skip(i * MAX_LIMIT).limit(MAX_LIMIT).get();
    allDocs.push(...res.data);
  }

  // 将旧文档拆分成新格式
  const now = Date.now();
  const newDocs = [];
  let snCounter = 0;

  for (const oldDoc of allDocs) {
    const promoters = oldDoc.promoters || [];

    if (promoters.length === 0) {
      // 没有促销员的旧卡片 → 生成一条空记录
      snCounter++;
      newDocs.push({
        id: now + snCounter,
        sn: oldDoc.sn || snCounter,
        name: '', province: oldDoc.province || '', city: oldDoc.city || '',
        district: oldDoc.district || '', street: oldDoc.street || '',
        phone: oldDoc.phone || '', wechat: oldDoc.wechat || '',
        age: oldDoc.age || '', remark: oldDoc.remark || '',
        baseSalary: oldDoc.baseSalary || '',
        blacklisted: oldDoc.blacklisted || false, quality: oldDoc.quality || false,
        kaTags: Array.isArray(oldDoc.kaTags) ? oldDoc.kaTags : [],
        hired: false, hiredBy: '', hiredAt: '',
        likes: oldDoc.likes || [], comments: oldDoc.comments || [], hireHistory: [],
        recorderUserId: oldDoc.creatorUserId || openid,
        recorderNickname: '', recorderPosition: '',
        recorderProvince: '', recorderCity: '',
        creatorUserId: oldDoc.creatorUserId || openid,
        createdAt: oldDoc.createdAt || now,
      });
    } else {
      // 有促销员的 → 每个促销员拆成一条记录
      for (const p of promoters) {
        snCounter++;
        newDocs.push({
          id: now + snCounter, sn: snCounter,
          name: p.name || '',
          province: oldDoc.province || p.recorderProvince || '',
          city: oldDoc.city || p.recorderCity || '',
          district: oldDoc.district || '', street: oldDoc.street || '',
          phone: p.phone || oldDoc.phone || '',
          wechat: oldDoc.wechat || '',
          age: p.age || oldDoc.age || '',
          remark: p.remark || oldDoc.remark || '',
          baseSalary: p.baseSalary || oldDoc.baseSalary || '',
          blacklisted: p.blacklisted || oldDoc.blacklisted || false,
          quality: p.quality || oldDoc.quality || false,
          kaTags: Array.isArray(p.kaTags) ? p.kaTags : (Array.isArray(oldDoc.kaTags) ? oldDoc.kaTags : []),
          hired: p.hired || false,
          hiredBy: p.hiredBy || '', hiredAt: p.hiredAt || '',
          likes: p.likes || [], comments: p.comments || [], hireHistory: p.hireHistory || [],
          recorderUserId: p.recorderUserId || oldDoc.creatorUserId || openid,
          recorderNickname: p.recorderNickname || '',
          recorderPosition: p.recorderPosition || '',
          recorderProvince: p.recorderProvince || oldDoc.province || '',
          recorderCity: p.recorderCity || oldDoc.city || '',
          creatorUserId: oldDoc.creatorUserId || openid,
          createdAt: oldDoc.createdAt || now,
        });
      }
    }
  }

  // 删除所有旧文档
  for (let i = 0; i < allDocs.length; i += MAX_LIMIT) {
    const batch = allDocs.slice(i, i + MAX_LIMIT);
    const promises = batch.map((d) => db.collection('channels').doc(d._id).remove());
    await Promise.all(promises);
  }

  // 写入所有新文档
  for (let i = 0; i < newDocs.length; i += MAX_LIMIT) {
    const batch = newDocs.slice(i, i + MAX_LIMIT);
    const promises = batch.map((d) => db.collection('channels').add({ data: d }));
    await Promise.all(promises);
  }

  return { success: true, count: newDocs.length, oldCount: allDocs.length };
}

module.exports = {
  batchAdd,          // 批量导入
  batchDelete,       // 批量删除
  migrateLocal,      // 本地数据迁移
  migrateFlatten,    // 旧格式扁平化迁移
};
