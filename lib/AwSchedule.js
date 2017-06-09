/**
 * @file
 * @copyright
 * @license
 *
 */
var bunyan = require('bunyan')
var spawn = require('child_process').spawn
var fs = require('fs');
var scheduleLoopConfig = require('../config/apiway-schdule-loop.json')
var SCHEDULE_LOOP_PREFIX = 'apiway-schedule-loop-'

let log = bunyan.createLogger({name:'awschedule'})
/* eslint valid-jsdoc: ["error", {"requireReturnDescription": false}] */

class AwSchedule {
  constructor() {
    this.TOPIC_PREFIX = 'apiway'
  }

  dispatch (topic, message) {
    log.info(`topic: ${topic}`)
    log.info(`message: ${message}`)

    let service = topic.split("/")[1]

    if (service == 'schedule') {
     this.setSchedule(message)
    }
  }

  get topic() {
    return `${this.TOPIC_PREFIX}/+`
  }

  setSchedule (data) {
    let project = JSON.parse(data)

    if (!project) {
      throw `Data error: ${data}`
    }
    this.setupDocker(project)
      .then(data => this.runDocker(data))
  }

  setupDocker(data) {
    return new Promise((resolve, reject) => {
      console.log('setupDocker')
      console.log(data)
      let id = data.full_name.replace('/', '-').toLowerCase()
      scheduleLoopConfig.metadata.name = SCHEDULE_LOOP_PREFIX + id


      let projectId = {
        name: 'projectId',
        value: data._id
      }
      scheduleLoopConfig.spec.containers[0].env.push(projectId)
      let schedule = {
        name: 'schedule',
        value: data.schedule
      }
      scheduleLoopConfig.spec.containers[0].env.push(schedule)
      // scheduleLoopConfig.spec.containers[0].env[0].value = data._id
      let configFile = scheduleLoopConfig.metadata.name + '.json'
      let configString = JSON.stringify(scheduleLoopConfig)
      fs.writeFileSync(configFile, configString, 'utf8')
      // console.log(scheduleLoopConfig)
      // console.log('in setupDocker: resolve')
      resolve(data)
    })
  }

  runDocker(data) {
    return new Promise((resolve, reject) => {
      console.log('runDocker: data = ' + data)
      let configFile = scheduleLoopConfig.metadata.name + '.json'
      let cmd = `kubectl create -f ${configFile} && rm -f ${configFile}`
      // let cmd = `kubectl create -f ${configFile}`
      // let cmd = 'ls -al'
      this.runInBash(cmd, (err) => {
        if (err) {
          console.log('runDocker error : ' + err)
          reject(err)
        } else {
          console.log('runDocker done')
          resolve(data)
        }
      })
    })
  }

  runInBash(cmd, cb) {
    console.log("runInBash: " + cmd);
    // console.log('bok--------1 ' + logCmd);
    var proc = spawn('/bin/bash', ['-c', cmd ])
    // proc.stdout.pipe(utils.lineStream(log.info))
    // proc.stderr.pipe(utils.lineStream(log.error))
    // proc.on('error', cb)
    proc.on('error', function (err) {
      console.log(err)
      cb(err);
    });
    proc.stdout.on('data', function(data) {
      console.log(data.toString());
    });
    proc.stderr.on('data', function(data) {
      console.log(data.toString());
    });

    proc.on('close', function(code) {
      var err
      console.log("close: " + code);
      if (code) {
        err = new Error(`Command "${cmd}" failed with code ${code}`)
        err.code = code
        // err.logTail = log.getTail()
      }
      cb(code)
    })
  }
}

module.exports = AwSchedule;
