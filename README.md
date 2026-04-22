# Backend

微信云托管后端服务。

## 环境变量

```text
PORT=80
ADMIN_USERNAME=后台管理员用户名
ADMIN_PASSWORD=后台管理员密码
SESSION_SECRET=登录会话签名密钥
MYSQL_HOST=微信云托管 MySQL 地址
MYSQL_PORT=3306
MYSQL_USER=MySQL 用户名
MYSQL_PASSWORD=MySQL 密码
MYSQL_DATABASE=MySQL 数据库名
DATA_FILE=本地 JSON 数据文件路径，可选
```

未配置 MySQL 时，服务使用 JSON 文件保存数据，方便本地开发。本地默认后台账号是 `admin / admin123456`。部署到微信云托管时请配置 MySQL 和 `ADMIN_USERNAME`、`ADMIN_PASSWORD`，产品数据和后台账号都会写入 MySQL。
