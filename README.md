# Backend

微信云托管后端服务。

## 环境变量

```text
PORT=80
ADMIN_USERNAME=后台管理员用户名
ADMIN_PASSWORD=后台管理员密码
SESSION_SECRET=登录会话签名密钥
MYSQL_ADDRESS=微信云托管 MySQL 地址，可直接写成 10.x.x.x:3306
MYSQL_PORT=可选，若 MYSQL_ADDRESS 已带端口可不填
MYSQL_USERNAME=MySQL 用户名
MYSQL_PASSWORD=MySQL 密码
MYSQL_DATABASE=MySQL 数据库名
TENCENT_SECRET_ID=腾讯云 API SecretId（用于 ASR）
TENCENT_SECRET_KEY=腾讯云 API SecretKey（用于 ASR）
TENCENTCLOUD_REGION=可选，默认 ap-guangzhou
ASR_ENGINE_MODEL_TYPE=可选，默认 16k_zh
ASR_VOICE_FORMAT=可选，默认 mp3
DATA_FILE=本地 JSON 数据文件路径，可选
```

未配置 MySQL 时，服务使用 JSON 文件保存数据，方便本地开发。本地默认后台账号是 `admin / admin123456`。部署到微信云托管时请配置 `MYSQL_ADDRESS`、`MYSQL_USERNAME`、`MYSQL_PASSWORD`、`MYSQL_DATABASE` 以及 `ADMIN_USERNAME`、`ADMIN_PASSWORD`，产品数据和后台账号都会写入 MySQL。

若要启用小程序语音查询，请额外配置 `TENCENT_SECRET_ID`、`TENCENT_SECRET_KEY`。当前实现使用小程序原生录音 + 云托管后端调用腾讯云一句话识别接口，避免在小程序端暴露密钥。

## 产品维护方式

后台按“品名”维护产品组。新增或编辑时可以在同一个表单内维护四个规格：

- 标准杯（冰）
- 标准杯（热）
- 吨吨桶（冰）
- 吨吨桶（热）

未勾选的规格不会保存，已勾选的规格会落到 `products` 表中，前台查询仍按单个具体规格返回 SOP。
