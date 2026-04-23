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
DATA_FILE=本地 JSON 数据文件路径，可选
```

未配置 MySQL 时，服务使用 JSON 文件保存数据，方便本地开发。本地默认后台账号是 `admin / admin123456`。部署到微信云托管时请配置 `MYSQL_ADDRESS`、`MYSQL_USERNAME`、`MYSQL_PASSWORD`、`MYSQL_DATABASE` 以及 `ADMIN_USERNAME`、`ADMIN_PASSWORD`，产品数据和后台账号都会写入 MySQL。

## 产品维护方式

后台按“品名”维护产品组。新增或编辑时可以在同一个表单内维护四个规格：

- 标准杯（冷）
- 标准杯（热）
- 吨吨桶（冷）
- 吨吨桶（热）

未勾选的规格不会保存，已勾选的规格会落到 `products` 表中，前台查询仍按单个具体规格返回 SOP。
