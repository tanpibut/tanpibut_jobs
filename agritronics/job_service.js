var async = require('async')
var request = require('request')
var parser = require('xml2json')
var fs = require('fs')
var config = require('./conf/conf.json')

var template = require('./template/job_template.json')
var launcher = require('./template/job_launcher_template.json')
var stationId = ""
var dataTypes = []

// var sensors = []
var job_id_list = []
var job_group = {}

var launcherUpdateList = []

exports.initSensors = function(joblist, jobgroup) {
    // sensors = ss
    // console.log(sensors[0])
    job_id_list = joblist
    job_group = jobgroup
        // console.log(job_id_list[0])
        // console.log(`init launcher = ${job_id_list.length}`)
}


exports.update = function(station) {
    var fileName = `${station.NetworkID}-${station.Type.replace(' ', '')}`
    var job = genJob(station)

    return new Promise((resolve, reject) => {
        request.post({ url: config.bigstream.endpoint, form: job }, (err, httpResponse, body) => {
            if (err) {
                reject(err)
            } else {
                resolve(true)
            }
        })
    })

}

exports.commit = function() {
    return new Promise((resolve, reject) => {
        var idx = 0
        let groups = Object.keys(job_group)
        async.whilst(
            function() { return idx < groups.length; },
            function(callback) {
                let group = groups[idx]
                idx++
                if (launcherUpdateList.includes(group)) {
                    let listJob = job_group[group]
                    launcher.job_id = `tpb.launcher.${group}`
                    launcher.data_out.param.to = listJob
                        // console.log(JSON.stringify(launcher))
                        // console.log("Commit Launcher:", launcher)

                    request.post({ url: `${config.bigstream.endpoint}?reload=true`, form: launcher }, (err, httpResponse, body) => {
                        console.log(body)
                        if (err) {
                            console.log(err)
                            callback(null, idx)
                        } else {
                            console.log(new Date(), `create/update launcher.${group} = ${listJob.length}`)
                            callback(null, idx)
                        }



                    })
                } else callback(null, idx)

            },
            function(err, n) {
                launcherUpdateList = []
                resolve(true)
            }
        );
    })
}

exports.createJob = function(sensor, station) {
    return new Promise((resolve, reject) => {
        let job = genJob(sensor)


        //console.log("Create JOB: ", job)

        request.post({ url: config.bigstream.endpoint, form: job }, (err, httpResponse, body) => {
            if (err) {
                console.log(err)
                reject(err)
            } else {
                // sensors.push(`${sensor.NetworkID}-${sensor.Type.replace(' ', '')}`);
                job_id_list.push(job.job_id);

                if (sensor.Type.replace(' ', '') == "SignalQuality") {
                    if (!launcherUpdateList.includes("signal")) {
                        launcherUpdateList.push("signal")
                    }
                    if (!("signal" in job_group)) {
                        job_group["signal"] = []
                    }
                    job_group["signal"].push(job.job_id);
                } else if (sensor.Type.replace(' ', '') == "BatteryVoltage") {
                    if (!launcherUpdateList.includes("battery")) {
                        launcherUpdateList.push("battery")
                    }
                    if (!("battery" in job_group)) {
                        job_group["battery"] = []
                    }
                    job_group["battery"].push(job.job_id);
                } else if (!launcherUpdateList.includes(station.prov_code)) {
                    launcherUpdateList.push(station.prov_code)
                    if (!(station.prov_code in job_group)) {
                        job_group[station.prov_code] = []
                        job_group[station.prov_code].push(job.job_id);
                    } else job_group[station.prov_code].push(job.job_id);
                } else if (!(station.prov_code in job_group)) {
                    job_group[station.prov_code] = []
                    job_group[station.prov_code].push(job.job_id);
                } else job_group[station.prov_code].push(job.job_id);
                resolve(true)
            }
        })
    })
}


exports.create = function(station, latestSensors, location) {
    return new Promise((resolve, reject) => {
        var idx = 0
        async.whilst(
            function() { return idx < latestSensors.length; },
            function(callback) {
                ltSensor = latestSensors[idx]
                idx++
                setTimeout(function() {
                    if (station.NetworkID == ltSensor.NetworkID) {
                        if (config.jobgen.dataTypeName.includes(ltSensor.Type.replace(' ', '')) && !sensors.includes(`${station.NetworkID}-${ltSensor.Type.replace(' ', '')}`)) {
                            let job = genJob(ltSensor)
                            request.post({ url: config.bigstream.endpoint, form: job }, (err, httpResponse, body) => {
                                if (err) {
                                    console.log(err)
                                    callback(err, idx)
                                    reject(err)
                                } else {
                                    // sensors.push(`${ltSensor.NetworkID}-${ltSensor.Type.replace(' ', '')}`);
                                    job_id_list.push(job.job_id);
                                    if (!launcherUpdateList.includes(location.prov_code)) {
                                        launcherUpdateList.push(location.prov_code)
                                    }

                                    if (!(location.prov_code in job_group)) {
                                        job_group[location.prov_code] = []
                                    }
                                    job_group[location.prov_code].push(job.job_id);
                                    console.log(new Date(), `create job: ${station.NetworkID}-${ltSensor.Type.replace(' ', '')} Completed`)
                                    callback(null, idx)
                                }
                            })
                        } else callback(null, idx)
                    } else callback(null, idx)
                }, 10)
            },
            function(err, n) {
                let groups = Object.keys(job_group)
                for (i in groups) {
                    let group = groups[i]
                    if (launcherUpdateList.includes(group)) {
                        let listJob = job_group[group]
                        launcher.job_id = `tpb.launcher.${group}`
                        launcher.data_out.param.to = listJob
                        request.post({ url: `${config.bigstream.endpoint}?reload=true`, form: launcher }, (err, httpResponse, body) => {
                            if (err) {
                                console.log(err)
                                launcherUpdateList = []
                                reject(err)
                            } else {
                                console.log(new Date(), `create/update launcher${group} = ${listJob.length}`)
                                launcherUpdateList = []
                                resolve(true)
                            }
                        })
                    }

                }
            }
        );
    })
}


function genJob(station) {
    template.job_id = `${config.jobgen.storage_name_prefix}.${station.Type.replace(' ', '').toLowerCase()}.${station.NetworkID}`
    template.data_in.profile.station_id = station.NetworkID
    template.data_in.profile.latitude = station.Latitude
    template.data_in.profile.longitude = station.Latitude
    template.data_in.param.recover = config.jobgen.recover
    template.data_in.param.url = config.endpoint
    template.data_in.param.appkey = config.appkey
    template.data_in.param.station_id = station.NetworkID
    template.data_in.param.data_type.type = station.IONumber
    template.data_in.param.data_type.name = station.Type.replace(' ', '')
    template.data_in.param.data_type.node_id = station.NodeId
        // if(station.NetworkID.startsWith("MMS")){
        //     template.data_in.param.init_observed_date = "2017-01-01";
        //     template.data_in.param.init_observed_time = config.init_observed_time;
        // }
        // else{
    template.data_in.param.init_observed_date = config.jobgen.init_observed_date
    template.data_in.param.init_observed_time = config.jobgen.init_observed_time
        // }
    template.data_in.param.limit = config.jobgen.limit
    template.data_out.type = "storage"
    template.data_out.param.storage_name = `${config.jobgen.storage_name_prefix}.${station.Type.replace(' ', '').toLowerCase()}.${station.NetworkID}`
    return template
}