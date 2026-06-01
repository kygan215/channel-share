// ============================================================
// 评论 & 点赞
// ============================================================
// 这个文件负责：
//   点赞/取消点赞（toggleLike）
//   添加评论（addComment）— 含敏感词过滤 + 500字限制
//   删除评论（deleteComment）— 只能删自己的
// ============================================================

// 拿数据库实例和敏感词列表
const { db, SENSITIVE_WORDS } = require('./constants');
// 用 records.js 的 getDoc 来根据数字ID查找记录
const { getDoc } = require('./records');

// ============================================================
// toggleLike：点赞或取消点赞
// 如果用户已经点过赞 → 取消（再次点击取消）
// 如果用户没点过 → 点赞
// data：{ id: 促销员记录的数字编号 }
// openid：当前用户的微信编号
// ============================================================
async function toggleLike(data, openid) {
  // 找到要操作的记录
  const doc = await getDoc(data.id);
  if (!doc) return { success: false, message: '记录不存在' };

  // 获取当前点赞列表，没点赞过就是空数组
  const likes = doc.likes || [];
  // 看看当前用户是否已经在点赞列表里
  const likeIdx = likes.indexOf(openid);
  if (likeIdx !== -1) {
    // 已经点过赞 → 取消点赞（从列表移除）
    likes.splice(likeIdx, 1);
  } else {
    // 没点过 → 点赞（添加到列表）
    likes.push(openid);
  }

  // 更新数据库中的 likes 字段
  await db.collection('channels').doc(doc._id).update({ data: { likes } });
  return { success: true };
}

// ============================================================
// addComment：添加评论
// data：{ id: 促销员ID, content: 评论内容, nickname: 评论者昵称, time: 时间 }
// openid：评论者的微信编号
// ============================================================
async function addComment(data, openid) {
  // 先找到这条促销员记录
  const doc = await getDoc(data.id);
  if (!doc) return { success: false, message: '记录不存在' };

  // 检查评论内容
  const content = data.content || '';

  // 长度限制：最多500字
  if (content.length > 500) {
    return { success: false, message: '评论内容不能超过500字' };
  }

  // 敏感词过滤：把内容转小写，逐个检查敏感词列表
  const lowerContent = content.toLowerCase();
  for (const word of SENSITIVE_WORDS) {
    if (lowerContent.indexOf(word.toLowerCase()) !== -1) {
      return { success: false, message: '评论内容包含敏感词，请修改' };
    }
  }

  // 把新评论加到评论列表末尾
  const comments = doc.comments || [];
  comments.push({
    id: Date.now(),                     // 评论唯一编号（时间戳）
    userId: openid,                     // 评论者的 openid
    nickname: data.nickname || '匿名用户', // 评论者昵称
    content,                            // 评论内容
    time: data.time || new Date().toLocaleString('zh-CN'), // 评论时间
  });

  // 更新数据库
  await db.collection('channels').doc(doc._id).update({ data: { comments } });
  return { success: true };
}

// ============================================================
// deleteComment：删除评论（只能删自己的）
// data：{ id: 促销员ID, commentId: 评论的ID }
// openid：当前用户
// ============================================================
async function deleteComment(data, openid) {
  // 找到记录
  const doc = await getDoc(data.id);
  if (!doc) return { success: false, message: '记录不存在' };

  // 找到这条评论
  const comment = (doc.comments || []).find((c) => c.id === data.commentId);
  if (!comment) return { success: false, message: '评论不存在' };

  // 检查：必须是自己发的评论才能删
  if (comment.userId !== openid) return { success: false, message: '只能删除自己的评论' };

  // 过滤掉要删除的评论（保留其他所有评论）
  const comments = (doc.comments || []).filter((c) => c.id !== data.commentId);
  await db.collection('channels').doc(doc._id).update({ data: { comments } });
  return { success: true };
}

// 导出三个函数
module.exports = {
  toggleLike,    // 点赞/取消
  addComment,    // 添加评论（含审核）
  deleteComment, // 删除评论
};
