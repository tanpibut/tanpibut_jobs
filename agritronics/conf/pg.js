var pg = require('pg');
var config = {
    user: "USERNAME",
    database: "DATABASE_NAME",
    password: "PASSWORD",
    host: "DATABASE_HOST",
    port: 5432,
    max: 300,
    idleTimeoutMillis: 30000,
}

module.exports = function() {
    return new pg.Pool(config);
}
