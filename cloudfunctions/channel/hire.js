// ============================================================
// 聘用 & 解聘
// ============================================================
// 这个文件负责促销员的聘用和解聘操作。
// 聘用：标记某条记录为"在岗"，记录谁聘的、哪天聘的
// 解聘：标记为"空闲"，必须写评价，评价自动写入评论列表
// ============================================================

const { db } = require('./constants');
const { getDoc } = require('./records');

// ============================================================
// hirePromoter：聘用某个促销员
// data：{ id: 促销员ID, hiredBy: 聘用者签名 }
// openid：当前操作者
// ============================================================
async function hirePromoter(data, openid) {
  // 先找这条记录
  const doc = await getDoc(data.id);
  if (!doc) return { success: false, message: '记录不存在' };

  // 获取聘用者签名（比如"广东深圳 · 区域经理 · 张三"）
  const hiredBy = data.hiredBy || '';
  // 聘用日期，默认今天
  const hiredAt = data.hiredAt || new Date().toLocaleDateString('zh-CN');

  // 追加一条聘用历史记录
  const hireHistory = doc.hireHistory || [];
  hireHistory.push({
    id: Date.now(),       // 本条历史的唯一编号
    hiredBy,              // 谁聘的
    hiredAt,              // 哪天聘的
    comment: '',          // 聘用时的备注（暂时为空）
    unhireAt: '',         // 解聘日期（暂时为空）
    unhireBy: '',         // 解聘者（暂时为空）
  });

  // 更新记录：设为在岗
  await db.collection('channels').doc(doc._id).update({
    data: { hired: true, hiredBy, hiredAt, hireHistory },
  });
  return { success: true };
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
      hireHistory,          // 保留历史记录（含本次解聘信息）
      comments,             // 新增一条解聘评价
    },
  });
  return { success: true };
}

module.exports = {
  hirePromoter,   // 聘用
  unhirePromoter, // 解聘
};
