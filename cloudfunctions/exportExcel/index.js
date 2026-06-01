// ============================================================
// 云函数：导出渠道信息到 Excel
// 依赖：node-xlsx 生成 xlsx 文件
// 数据来源：优先使用前端传入的 records，回退为查询云数据库
// ============================================================

// 导入云开发 SDK
const cloud = require('wx-server-sdk');
// 导入 Excel 生成库
const xlsx = require('node-xlsx');

// 初始化云环境（使用当前云函数所在环境）
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
// 获取数据库引用
const db = cloud.database();

// 云函数入口
exports.main = async (event, context) => {
  try {
    // ---- 权限校验 ----
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    // 自动注册第一个管理员（如尚未注册）
    const countRes = await db.collection('users').where({ role: 'admin' }).count();
    if (countRes.total === 0) {
      await db.collection('users').add({
        data: { openid, role: 'admin', createdAt: Date.now() },
      });
    }

    const userRes = await db.collection('users').where({ openid }).get();
    const isAdmin = userRes.data.length > 0 && userRes.data[0].role === 'admin';
    if (!isAdmin) {
      return { success: false, message: '无权限，请联系管理员' };
    }

    // ---- 获取数据 ----
    // 优先使用前端传入的数据（本地存储模式）
    // 如果没有传入则回退到查询数据库（云数据库模式）
    let data = event.records;

    // 前端未传入数据时，从云数据库查询
    if (!data) {
      // 获取总记录数
      const countResult = await db.collection('channels').count();
      const total = countResult.total;

      if (total === 0) {
        return { success: false, message: '暂无数据可导出' };
      }

      // 分批获取所有数据（数据库单次最多返回 100 条）
      const MAX_LIMIT = 100;
      const batchTimes = Math.ceil(total / MAX_LIMIT);
      const tasks = [];
      for (let i = 0; i < batchTimes; i++) {
        tasks.push(
          db
            .collection('channels')
            .skip(i * MAX_LIMIT)       // 跳过已获取的数据
            .limit(MAX_LIMIT)           // 每次取 100 条
            .orderBy('province', 'asc')  // 按省份升序
            .orderBy('serialNo', 'asc')  // 同省份内按序号升序
            .get()
        );
      }
      // 并行执行所有分页查询
      const results = await Promise.all(tasks);
      data = [];
      results.forEach((res) => {
        data = data.concat(res.data);
      });
    }

    // 仍无数据则提示
    if (!data || data.length === 0) {
      return { success: false, message: '暂无数据可导出' };
    }

    // ---- 构建 Excel 表格数据 ----
    // 第一行为表头（与 add 表单和 import 模板的所有字段对齐）
    const excelData = [
      ['序号', '姓名', '年龄', '省份', '城市', '区/镇', '乡/县/镇/街道', '电话', '微信号',
       '卖场经验', '底薪(元/天)', '备注', '内部标注', '聘用状态', '记录人', '记录人职位',
       '健康证', '评论数'],
    ];

    // 遍历每条记录转为行
    data.forEach((item) => {
      const healthCertStatus = item.healthCert
        ? ({ none: '未上传', pending: '待审核', approved: '已认证', rejected: '已驳回' }[item.healthCert.status] || '未上传')
        : '未上传';
      const hireStatus = item.hired ? '在岗'
        : ((item.hireHistory || []).length > 0 ? '有记录' : '空闲');
      const internalTag = item.blacklisted ? '⚫黑名单'
        : (item.quality ? '⭐优质' : '');

      excelData.push([
        item.sn || item.serialNo || '',
        item.name || '',
        item.age || '',
        item.province || '',
        item.city || '',
        item.district || '',
        item.street || '',
        item.phone || '',
        item.wechat || '',
        (item.kaTags || []).join('、'),
        item.baseSalary || '',
        item.remark || '',
        internalTag,
        hireStatus,
        item.recorderNickname || '',
        item.recorderPosition || '',
        healthCertStatus,
        (item.comments || []).length,
      ]);
    });

    // 使用 node-xlsx 生成 Excel 文件 buffer
    const buffer = xlsx.build([
      {
        name: '促销员信息',   // sheet 名称
        data: excelData,   // 表格数据
        options: {},
      },
    ]);

    // ---- 上传到云存储 ----
    // 文件名包含时间戳避免重复
    const fileName = `渠道信息_${Date.now()}.xlsx`;
    const uploadResult = await cloud.uploadFile({
      cloudPath: fileName,   // 云存储路径
      fileContent: buffer,    // 文件内容
    });

    // ---- 获取临时下载链接（有效期 1 小时） ----
    const fileList = [{ fileID: uploadResult.fileID, maxAge: 3600 }];
    const tempResult = await cloud.getTempFileURL({ fileList });

    // 返回下载链接
    return {
      success: true,
      downloadUrl: tempResult.fileList[0].tempFileURL,
      total: data.length,
    };
  } catch (err) {
    // 任何异常均返回错误信息
    console.error(err);
    return { success: false, message: err.message };
  }
};
