var pg = require('pg');
var config = {
    user: "igrid",
    database: "tanpibut",
    password: "vkiNfu:uigrid",
    host: "localhost",
    port: 5432,
    max: 300,
    idleTimeoutMillis: 30000,
}

module.exports = function() {
    return new pg.Pool(config);
}