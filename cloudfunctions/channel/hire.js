 // ============================================================
// 聘用 & 解聘 & 自动过期
// ============================================================
// 这个文件负责促销员的聘用和解聘操作。
// 聘用：标记某条记录为"在岗"，记录谁聘的、哪天到哪天
// 解聘：标记为"空闲"，必须写评价，评价自动写入评论列表
// 自动过期：聘用到期的记录自动变为"空闲"
// ============================================================

const { db } = require('./constants');
const { getDoc } = require('./records');

// 获取今天的日期字符串（YYYY-MM-DD 格式，方便比较）
function getTodayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ============================================================
// hirePromoter：聘用某个促销员（带时间区段）
// data：{ id, hiredBy, hireStartDate, hireEndDate }
//   - id: 促销员ID
//   - hiredBy: 聘用者签名
//   - hireStartDate: 聘用起始日期（YYYY-MM-DD，默认今天）
//   - hireEndDate: 聘用结束日期（YYYY-MM-DD，必须 >= hireStartDate）
// openid：当前操作者
// ============================================================
async function hirePromoter(data, openid) {
  // 先找这条记录
  const doc = await getDoc(data.id);
  if (!doc) return { success: false, message: '记录不存在' };

  // 获取聘用者签名（比如"广东深圳 · 区域经理 · 张三"）
  const hiredBy = data.hiredBy || '';
  const todayStr = getTodayString();
  // 聘用起始日期，默认今天
  const hireStartDate = data.hireStartDate || todayStr;
  // 聘用结束日期，必须 >= 起始日期
  let hireEndDate = data.hireEndDate || '';
  if (!hireEndDate) {
    return { success: false, message: '请选择聘用结束日期' };
  }
  if (hireEndDate < hireStartDate) {
    return { success: false, message: '结束日期不能早于开始日期' };
  }

  // 聘用日期（兼容旧字段，用开始日期）
  const hiredAt = hireStartDate;

  // 追加一条聘用历史记录
  const hireHistory = doc.hireHistory || [];
  hireHistory.push({
    id: Date.now(),           // 本条历史的唯一编号
    hiredBy,                  // 谁聘的
    hiredAt,                  // 聘用开始日期
    hireStartDate,            // 聘用起始日期
    hireEndDate,              // 聘用结束日期
    comment: '',              // 聘用时的备注（暂时为空）
    unhireAt: '',             // 解聘日期（暂时为空）
    unhireBy: '',             // 解聘者（暂时为空）
  });

  // 更新记录：设为在岗，记录时间区段
  await db.collection('channels').doc(doc._id).update({
    data: {
      hired: true,
      hiredBy,
      hiredAt,
      hireStartDate,
      hireEndDate,
      hireHistory,
    },
  });
  return { success: true };
}

// ============================================================
// autoExpireHired：自动解聘所有已过期聘用的促销员
// 查找 hired=true 且 hireEndDate 存在于今天之前的记录，
// 自动将其标记为空闲，并在聘用历史中写入系统自动解聘记录。
// 返回：{ success, count（本期新过期的数量）}
// ============================================================
async function autoExpireHired() {
  const todayStr = getTodayString();
  let expiredCount = 0;

  try {
    // 查出所有 hired=true 且有 hireEndDate 的记录
    // 注意：hireEndDate < todayStr 才是过期的
    const res = await db.collection('channels')
      .where({ hired: true })
      .get();

    // 逐条检查是否过期
    const batch = db.collection('channels');
    for (const doc of res.data) {
      if (!doc.hireEndDate) continue; // 没有结束日期的跳过（兼容旧数据）
      if (doc.hireEndDate >= todayStr) continue; // 还没到期

      // ---- 已过期：自动解聘 ----
      const hireHistory = doc.hireHistory || [];
      if (hireHistory.length > 0) {
        const last = hireHistory[hireHistory.length - 1];
        if (!last.unhireAt) {
          last.unhireAt = todayStr;
          last.unhireBy = '系统自动';
          last.comment = '聘用到期，系统自动解聘';
        }
      }

      // 更新数据库
      await batch.doc(doc._id).update({
        data: {
          hired: false,
          hiredBy: '',
          hiredAt: '',
          hireStartDate: '',
          hireEndDate: '',
          hireHistory,
        },
      });
      expiredCount++;
    }

    return { success: true, count: expiredCount };
  } catch (err) {
    console.error('autoExpireHired error:', err);
    return { success: false, message: err.message, count: expiredCount };
  }
}

// ============================================================
// unhirePromoter：解聘某个促销员（必须填写评价）
// data：{ id: 促销员ID, comment: 解聘评价, unhireBy: 解聘者 }
// openid：当前操作者
// ============================================================
async function unhirePromoter(data, openid) {
  // 先找记录
  const doc = await getDoc(data.id);
  if (!doc) return { success: false, message: '记录不存在' };
  // 必须填写评价才能解聘
  if (!data.comment) return { success: false, message: '解聘必须填写评价' };

  // 更新最近一条聘用历史的解聘信息
  const hireHistory = doc.hireHistory || [];
  if (hireHistory.length > 0) {
    const last = hireHistory[hireHistory.length - 1];
    if (!last.unhireAt) {
      last.unhireAt = new Date().toLocaleDateString('zh-CN'); // 解聘日期
      last.unhireBy = data.unhireBy || '';                    // 谁解聘的
      last.comment = data.comment || last.comment;            // 解聘评价
    }
  }

  // 把解聘评价同时写入评论列表（方便查看）
  const comments = doc.comments || [];
  comments.push({
    id: Date.now(),
    userId: openid,
    nickname: data.unhireBy || '匿名用户',
    content: data.comment,    // 解聘评价作为评论内容
    time: new Date().toLocaleString('zh-CN'),
  });

  // 更新数据库：改为空闲，清除聘用信息，保留历史
  await db.collection('channels').doc(doc._id).update({
    data: {
      hired: false,         // 不再在岗
      hiredBy: '',          // 清除聘用者
      hiredAt: '',          // 清除聘用日期
      hireStartDate: '',    // 清除聘用起始日期
      hireEndDate: '',      // 清除聘用结束日期
      hireHistory,          // 保留历史记录（含本次解聘信息）
      comments,             // 新增一条解聘评价
    },
  });
  return { success: true };
}

module.exports = {
  hirePromoter,     // 聘用
  unhirePromoter,   // 解聘
  autoExpireHired,  // 自动过期清理
};
