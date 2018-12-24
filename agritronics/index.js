var pg = require("./conf/pg")
var pool = pg()
var async = require('async');
var request = require('request')
var parser = require('xml2json')
var schedule = require('node-schedule')
var conf = require("./conf/conf.json")
var job = require("./job_service")

let client = null

//init all stations from database s
let stations = {}
let sensors = []
let job_id_list = []
var job_group = {}
let t = null
let datatyps = []

var args = process.argv.slice(2);
var input = args[0];

pool.connect().then(conn => {
    client = conn
    initDataType().then(status => {
        if (status) {
            initStation()
        } else {
            console.log("ERROR: data type can not initialize!")
        }

    })
})

function initDataType() {
    return new Promise((resolve, reject) => {
        executeQuery("select name from tpb_master.data_type where name != ''").then(data => {
            if (data) {
                for (i in data.rows) {
                    datatyps.push(data.rows[i].name)
                }
                for (i in conf.jobgen.dataTypeName) {
                    let type = conf.jobgen.dataTypeName[i]
                    if (!datatyps.includes(type)) {
                        console.log("ERROR: Type" + type + "does not exist!")
                        process.exit()
                    }
                }
                resolve(true)
            } else reject(false)
        })
    })
}


function initStation() {
    if (input) {
        if (input == '-reset') {
            execute()
        } else {
            console.log(`not found option "${input}"`)
            process.exit()
        }
    } else {
        executeQuery("SELECT station_id, station_name, province_code, latitude, longitude FROM tpb_master.station where station_id != 'all'").then(res => {
            if (res) {
                for (i in res.rows) {
                    let station = res.rows[i];
                    stations[station.station_id] = {
                            "station_name": station.station_name,
                            "latitude": station.latitude,
                            "longitude": station.longitude,
                            "prov_code": station.province_code
                        }
                        // if (!(station.province_code in job_group)) {
                        //     job_group[station.province_code] = []
                        // }
                }

                let type_set = ["temperature", "rain", "humidity"]
                request(conf.bigstream.endpoint, function(error, response, body) {
                    if (response.statusCode == 200) {
                        let jobs = JSON.parse(body)

                        // console.log(jobs)
                        // let idx = 0
                        // async.whilst(
                        //     function() { return idx < jobs.length; },
                        //     function(callback) {
                        //         let job = jobs[idx];
                        //         idx++;
                        //         if (job.startsWith(conf.jobgen.storage_name_prefix)) {
                        //             if (!type_set.includes(job.replace(conf.jobgen.storage_name_prefix, '').split('.')[1])) {
                        //                 request.del(`http://bs.tanpibut.org/v1/jobs/${job}`, function(error, response, body) {
                        //                     console.log(body)
                        //                     console.log("Delete Job:", job)
                        //                     callback(null, idx)
                        //                 })

                        //             } else callback(null, idx)

                        //         } else callback(null, idx)
                        //     },
                        //     function(err, n) {


                        //         // 5 seconds have passed, n = 5
                        //     }
                        // );



                        for (i in jobs) {
                            let job = jobs[i]
                            if (job.startsWith(conf.jobgen.storage_name_prefix)) {

                                let prov_code = stations[job.replace(conf.jobgen.storage_name_prefix, '').split('.')[2]].prov_code
                                if (!(prov_code in job_group)) {
                                    job_group[prov_code] = []
                                }
                                job_group[prov_code].push(job)
                                job_id_list.push(job)
                            }
                        }

                        // console.log("JOB_GROUP: ", job_group)
                        // console.log("job_id_list: ", job_id_list)
                    }
                })

                run()

            }
        })
    }
}


var run = function() {
    job.initSensors(job_id_list, job_group)
        // t = schedule.scheduleJob('0 0 * * *', function() { //'0 0 * * *' '*/20 * * * * *'
    console.log(new Date() + "scheduling...");
    execute();
    // })
}



function execute() {
    console.log(new Date() + "excuting...");
    request(`${conf.endpoint}?appkey=${conf.appkey}`, function(error, response, body) {
        if (response.statusCode == 200) {
            let data = parser.toJson(body, { object: true }).xhr.IO;

            console.log(new Date() + " Station registeration...");
            regStation(data).then(stations => {
                if (stations) {
                    console.log("execute " + stations + " stations.")

                    console.log(new Date() + " Sensor registeration...");
                    regSensor(data).then(sensors => {
                        if (sensors) {
                            console.log("execute " + sensors + " sensors.")
                            console.log("Registration completed.")
                        }
                    })
                }
            })
        }
    });
}


function regStation(data) {
    return new Promise((resolve, reject) => {
        var station_id = "";
        var idx = 0;
        var station_count = 0;
        async.whilst(
            function() { return idx < data.length; },
            function(callback) {
                let stationObj = data[idx];
                idx++;
                let station = stations[stationObj.NetworkID];
                // console.log(`has station ${stationObj.NetworkID}:${station}`)
                setTimeout(function() {
                    if (station_id != stationObj.NetworkID) {
                        station_count += 1;
                        station_id = stationObj.NetworkID
                        if (JSON.stringify(stationObj.Latitude) != "{}" && JSON.stringify(stationObj.Longitude) != "{}") {
                            // console.log(`station ${stationObj.NetworkID}:${station.station_name}`)
                            if (!station) {
                                // on station not exists
                                createStation(stationObj).then(status => {
                                    if (status) {
                                        callback(null, idx);
                                    } else callback(status, idx)
                                }).catch(err => {
                                    console.log(new Date() + ": " + err.stack)
                                    callback(status, idx)
                                })
                            } else if (station.latitude != stationObj.Latitude || station.longitude != stationObj.Longitude || !station.station_name.includes(getStationName(stationObj))) {
                                // console.log(`update:${stationObj.NetworkID}-${stationObj.Type.replace(' ', '')}`)
                                updateStation(stationObj).then(status => {
                                    if (status) {
                                        callback(null, idx)
                                    } else callback(status, idx)
                                }).catch(err => {
                                    console.log(new Date() + ": " + err.stack)
                                    callback(status, idx)
                                })
                            } else {
                                // console.log(`station ${stationObj.NetworkID} is last update.`)
                                callback(null, idx)
                            }
                        } else {
                            console.log(`ERROR: Station ${stationObj.NetworkID} dose not have Latitude or Longitude!`)
                            callback(null, idx)
                        }
                    } else callback(null, idx)
                }, 10)
            },
            function(err, n) {
                if (err) {
                    reject(err)
                } else resolve(station_count)
                    // 5 seconds have passed, n = 5
            }
        );
    });
}

function regSensor(data) {
    return new Promise((resolve, reject) => {
        var idx = 0;
        let sensor_count = 0;
        async.whilst(
            function() { return idx < data.length; },
            function(callback) {
                let sensor = data[idx];
                idx++;
                let type = sensor.Type.replace(' ', '')
                    // let sensor_id = `${sensor.NetworkID}-${type}`

                let job_id = `${conf.jobgen.storage_name_prefix}.${type.toLowerCase()}.${sensor.NetworkID}`
                let station = stations[sensor.NetworkID]
                    // if (sensor.NetworkID == "LP-LS-0011") {
                    //     console.log(job_id)
                    //     console.log("station: ", station)
                    // }

                setTimeout(function() {
                    if (!job_id_list.includes(job_id)) {
                        if (conf.jobgen.dataTypeName.includes(type)) {
                            job.createJob(sensor, station).then(status => {
                                if (status) {
                                    sensor_count += 1;
                                    console.log(new Date(), `create job: ${job_id} completed.`)

                                }
                                callback(null, idx)
                            }).catch(err => {
                                console.log(new Date(), err.stack)
                                callback(null, idx)
                            })
                        } else {
                            callback(null, idx)
                        }
                    } else {
                        // sensor_count += 1;
                        // console.log(`Sensor ${sensor_id} is existed`)
                        callback(null, idx)
                    }
                }, 10)
            },
            function(err, n) {

                if (err) {
                    reject(err)
                } else {
                    job.commit().then(status => {
                        resolve(sensor_count)
                    })

                }
                // 5 seconds have passed, n = 5
            }
        );
    });
}

function createStation(station) {
    return new Promise((resolve, reject) => {
        console.log(new Date(), "New Station: ", station.NetworkID);
        getLocationWithLatLon(station.Latitude, station.Longitude).then((location) => {
            // console.log(`${getStationName(station)} - ${location.tambon_namt}`);
            let ins = `INSERT INTO tpb_master.station(station_id, station_name, tambon_code, tambon_namt, amphur_code, amphur_namt, province_code, province_namt, latitude, longitude, the_geom, active, create_timestamp, update_timestamp, data_source_id) 
                    VALUES 
                    ('${station.NetworkID}', '${getStationName(station)}', '${location.tambon_code}', '${location.tambon_namt}', '${location.amp_code}', '${location.amp_namt}', '${location.prov_code}',
                    '${location.prov_namt}', ${station.Latitude}, ${station.Longitude}, NULL, true, current_timestamp, current_timestamp, 1)`

            executeQuery(ins).then(res => {
                if (res) {
                    stations[station.NetworkID] = {
                        "station_name": getStationName(station),
                        "latitude": station.Latitude,
                        "longitude": station.Longitude,
                        "prov_code": location.prov_code
                    }
                    console.log(new Date(), `register new station: ${station.NetworkID} completed.`)
                    resolve(true)
                } else reject(null)
            }).catch(err => {
                console.log(new Date(), err.stack)
                reject(err)
            })

        })
        resolve(true)
    })
}

function getStationName(station) {
    let station_name = station.Region
    station_name = station_name.replace(`${station.NetworkID} `, '')
    station_name = station_name.split(' ต.')[0]
    station_name = station_name.split(' อ.')[0]
    station_name = station_name.split(' จ.')[0]
    return station_name
}

function updateStation(station) {
    return new Promise((resolve, reject) => {
        let q = `UPDATE tpb_master.station 
        SET station_name = '${getStationName(station)}', latitude = ${station.Latitude}, longitude = ${station.Longitude}, update_timestamp = current_timestamp 
        WHERE station_id = '${station.NetworkID}'`
        executeQuery(q).then(res => {
            if (res.rowCount > 0) {
                job.update(station).then(up => {
                    if (up) {
                        stations[station.NetworkID] = {
                            "station_name": getStationName(station),
                            "latitude": station.Latitude,
                            "longitude": station.Longitude
                        }
                        console.log(new Date(), `Update ${station.NetworkID}-${station.Type.replace(' ', '')} completed.`)
                        resolve(true)
                    } else reject(false)
                })
            }
        }).catch(err => {
            console.log(new Date(), err.stack)
            reject(err)
        })
    })



}

function insertStation(station, latestSensors) {
    return new Promise((resolve, reject) => {
        console.log(new Date(), "New Station: ", station.NetworkID);
        getLocationWithLatLon(station.Latitude, station.Longitude).then((location) => {
            // console.log(`${getStationName(station)} - ${location.tambon_namt}`);
            let ins = `INSERT INTO tpb_master.station(station_id, station_name, tambon_code, tambon_namt, amphur_code, amphur_namt, province_code, province_namt, latitude, longitude, the_geom, active, create_timestamp, update_timestamp, data_source_id) 
        VALUES 
        ('${station.NetworkID}', '${getStationName(station)}', '${location.tambon_code}', '${location.tambon_namt}', '${location.amp_code}', '${location.amp_namt}', '${location.prov_code}',
         '${location.prov_namt}', ${station.Latitude}, ${station.Longitude}, NULL, true, current_timestamp, current_timestamp, 1)`

            job.create(station, latestSensors, location).then(status => {
                if (status) {
                    executeQuery(ins).then(res => {
                        if (res) {
                            stations[station.NetworkID] = {
                                "station_name": getStationName(station),
                                "latitude": station.Latitude,
                                "longitude": station.Longitude
                            }
                        }
                        console.log(new Date(), `Import station: ${station.NetworkID} completed.`)
                        resolve(true)
                    })

                } else reject(status)
            })

        })
    })

}

function getLocationWithLatLon(lat, lon) {
    var q = `SELECT id, tambon_code, tambon_id, tambon_namt, tambon_name, amp_code, 
        amp_id, amp_namt, amp_name, prov_code, prov_namt, prov_name, 
        bbox, geojson, center, the_geom, start_date, end_date, active, 
        update_timestamp, remark, geojson_center, geojson_4326
    FROM tpb_master.tambon
    where ST_Contains(ST_Transform(the_geom, 4326), ST_SetSRID(ST_Point(${lon}, ${lat}),4326))`;
    return new Promise((resolve, reject) => {
        executeQuery(q).then(res => {
            if (res.rows.length > 0) {
                resolve(res.rows[0]);
            } else resolve(null);
        }).catch(err => {
            console.log(err.stack);
            reject(err);
        })
    })

}

function executeQuery(querySrc) {
    return new Promise((resolve, reject) => {
        client.query(querySrc).then(res => {
                resolve(res)
            })
            .catch(e => {
                reject(e)
            })
    })
}