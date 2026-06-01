# 促销信息共享 🚀

销售团队促销员管理平台 — 微信小程序

## 功能简介

一款专为销售团队打造的促销员信息管理工具，帮助团队高效管理各省份促销员信息、健康证审核、聘用记录和团队协作。

## 主要功能

| 功能 | 说明 |
|------|------|
| 🔍 **促销员查询** | 按省份/城市/区镇筛选，支持关键词搜索、多维度排序 |
| ➕ **新增记录** | 智能定位自动填写位置、剪贴板检测微信号、卖场经验标签 |
| 📂 **批量导入** | 支持 CSV / Excel 文件批量导入，智能列名匹配 |
| 📋 **促销管理** | 编辑、删除、聘用/解聘、评论、点赞、健康证审核 |
| ✅ **健康证管理** | 健康证上传、审核流转（待审核→通过/驳回） |
| 📊 **数据统计** | 首页概览：总促销员数、在岗数、优质临促数、覆盖省份 |
| ⬇ **数据导出** | 导出为 CSV 格式，支持分享到微信或复制到剪贴板 |
| 👥 **权限管理** | 白名单机制 + 管理员/查看者双角色，保障数据安全 |

## 隐私与安全 🔒

- 首次使用需阅读并同意隐私协议
- 录入促销员时提示"请确保已获得本人同意"
- 评论内容经敏感词过滤（含长度限制）
- 白名单验证：仅授权用户可访问数据
- 支持账号注销，30天内清除所有相关数据
- 完整的[隐私政策](miniprogram/pages/privacy/privacy.wxml)和[用户协议](miniprogram/pages/agreement/agreement.wxml)

## 技术栈

- **前端**：微信小程序原生（JavaScript + WXML + WXSS）
- **后端**：微信云开发（云函数 + 云数据库 + 云存储）
- **工具库**：SheetJS（Excel 处理）、wx-server-sdk

## 项目结构

```
cloudfunctions/channel/     ← 云函数（后端逻辑）
├── index.js                路由入口
├── constants.js            常量/配置
├── auth.js                 权限管理
├── records.js              促销员CRUD
├── comments.js             评论/点赞
├── hire.js                 聘用/解聘
├── batch.js                批量导入/迁移
├── xlsx.js                 Excel解析
├── healthCert.js           健康证
└── whitelist.js            白名单/注销

miniprogram/                 ← 小程序前端
├── pages/                  页面
│   ├── index/              首页（统计概览）
│   ├── my/                 我的（个人中心）
│   ├── add/                新增/编辑促销员
│   ├── query/              查询条件
│   ├── query-results/      查询结果
│   ├── manage/             促销管理
│   ├── import/             批量导入
│   ├── settings/           设置（白名单管理）
│   ├── about/              关于
│   ├── privacy/            隐私政策
│   └── agreement/          用户协议
├── utils/                  工具函数
└── images/                 图片资源
```

## 快速开始

1. 使用微信开发者工具打开项目
2. 在 `project.config.json` 中配置你的微信 appid
3. 开通微信云开发，创建云环境
4. 将 `miniprogram/app.js` 中的环境 ID 改为你的云环境 ID
5. 部署云函数（右键 `cloudfunctions/channel` → 上传并部署）
6. 在云开发控制台配置数据库索引（参考 `docs/database-indexes.md`）
7. 编译运行

## 管理员首次使用

1. 打开小程序 → 同意隐私协议 → 系统自动注册第一个用户为管理员
2. 在「设置」页配置白名单（添加团队成员手机号）
3. 团队成员通过手机号验证后即可查看数据

## 上线检查清单

- [ ] 修改 `constants.js` 中的 `SETUP_TOKEN` 为随机字符串
- [ ] 在云开发控制台配置数据库索引
- [ ] 部署所有云函数
- [ ] `project.private.config.json` 中 `urlCheck` 设为 `true`
- [ ] 微信公众平台 → 设置 → 更新隐私声明
- [ ] 检查 `project.private.config.json` 是否在 `.gitignore` 中（含 appid）
