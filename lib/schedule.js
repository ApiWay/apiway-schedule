var spawn = require('child_process').spawn
var fs = require('fs');
var HashMap = require('hashmap')
var map = new HashMap();
var arraySplit = require('./array-split')
var ApiWay  = require('apiway-sdk-js')
var AwPubSub = require('apiway-pubsub')
let aw = new ApiWay({});
let awInstance = aw.getInstance();
let awSchedule = aw.getSchedule();
let awScheduler = aw.getScheduler();
let schedulerConfig = require('../config/apiway-scheduler.json')
var bunyan = require('bunyan')
let log = bunyan.createLogger({name:'schedule'})


var SCHEDULER_POD_PREFIX = 'apiway-scheduler-'
var TOPIC_PREFIX = 'apiway'

let QUERY_SCHEDULE_PER_PAGE = 100
let QUERY_SCHEDULE_PAGE = 0
let MAX_SCHEDULES_PER_SCHEDULER = 3


exports.dispatch = function (topic, message) {
  log.info(`topic: ${topic}`)
  log.info(`message: ${message}`)

  let topicArray = topic.split("/")

  console.log(topicArray)
  if (topicArray[1] == 'schedule') {
    if (topicArray[2] == 'create') {
      createSchedule(message)
    } else if (topicArray[2] == 'update') {
      setTimeout(function () {
      }, 2000);
    }
  }
}

exports.topic = function () {
  return `${TOPIC_PREFIX}/+`
}

exports.bootstrap = function () {
  distributeSchedules()
}

function createSchedule(message) {
  console.log('createSchedule')
  let schedule = JSON.parse(message)
  console.log(schedule)

  getSchedulers().then((schedulers) => {
    console.log(schedulers)
    if (schedulers.length > 0) {
      schedulers.forEach(scheduler => {
        if (scheduler.schedules.length < MAX_SCHEDULES_PER_SCHEDULER) {
          addSchedule(scheduler._id, schedule._id)
        } else {
          createScheduler(schedule)
        }
      })
    } else {
      createScheduler(schedule)
    }
  })
}

function removeSchedule (jobId) {
  return new Promise((resolve, reject) => {
    try {
      Queue.remove(jobId, function (error, response) {
        resolve()
        console.log(error)
        console.log(response)
        console.log('removed')
      })
    } catch (err) {
      console.log('remove error')
      resolve()
    }
  })
}

function createScheduler (schedule) {
  console.log('createScheduler')
  let schedules = []
  schedules.push(schedule._id)
  console.log(schedules)
  let options = {
    schedules: schedules
  }
  awScheduler.addScheduler(options).then(res => {
    // console.log(res.data.data)
    let schedulerId = res.data.data
    spawnScheduler(schedulerId)

    let o = {
      schedulerId: schedulerId
    }
    awSchedule.updateSchedule(schedule._id, o)
      .then(res => {
        console.log('updateSchedule: schedulerID done')
      })
  })
}

function addSchedule(schedulerId, scheduleId) {
  console.log('1 addSchedule')
  let schedules = []
  schedules.push(scheduleId)
  console.log(schedules)
  let options = {
    schedules: schedules
  }
  awScheduler.addSchedules(schedulerId, options)
    .then((res) => {
      console.log('post addScheduler')
      let s = res.data.data
      console.log(s)
      let options = {
        schedulerId: s._id
      }
      console.log(s._id)
      awSchedule.updateSchedule(scheduleId, options)
        .then((res) => {
          pubCreateSchedule(res.data.data)
        })
    })
}

function updateScheduler (schedulerId, schedules) {
  console.log('updateScheduler')
  let options = {
    schedules: schedules
  }
  awScheduler.updateScheduler(schedulerId, options)
    .then((res) => {
      console.log('post updateScheduler')
      let s = res.data.data
      console.log(s)
      s.schedules.forEach(scheduleId => {
        let options = {
          schedulerId: s._id
        }
        console.log(s._id)
        awSchedule.updateSchedule(scheduleId, options)
          .then(res => {
            let schedule = res.data.data
            pubCreateSchedule(schedule)
          })
      })
    })
    // console.log(res.data.data)

}

function pubCreateSchedule (schedule) {
  let awPubSub = new AwPubSub()
  console.log(schedule)
  awPubSub.publish('apiway/scheduler/create', JSON.stringify(schedule))
}

function distributeSchedules () {
  console.log('distributeSchedules')
  getAllSchedule([], 0, (schedules) => {
    let schedulesSize = schedules.length
    let remainSchedulesSize = schedulesSize
    let schedulesIndex = 0
    console.log(schedules)
    getSchedulers().then(schedulers => {

      if (schedulers.length > 0) {
        schedulers.forEach(scheduler => {
          if (remainSchedulesSize > 0) {
            let s = MAX_SCHEDULES_PER_SCHEDULER - scheduler.schedules.length
            let size = s < schedulesSize ? s : schedulesSize
            remainSchedulesSize = remainSchedulesSize - size
            // console.log(remainSchedulesSize)
            // console.log(size)
            let items = schedules.slice(schedulesIndex, size + 1)
            schedulesIndex += size
            updateScheduler(scheduler._id, items)
          }
        })
        if (remainSchedulesSize > 0) {
          let array = schedules.slice(schedulesIndex, schedules.length + 1)
          let remainSchedules = arraySplit(array, MAX_SCHEDULES_PER_SCHEDULER)
          remainSchedules.forEach(items => {
            createScheduler(items)
          })
        }
      } else {
        console.log('schedulers.length == 0')
        let remainSchedules = arraySplit(schedules, MAX_SCHEDULES_PER_SCHEDULER)
        remainSchedules.forEach(items => {
          console.log(items)
          createScheduler(items)
        })
      }
    })
  })
}

function getSchedulers () {
  return new Promise((resolve, reject) => {
    awScheduler.getSchedulers(null).then((res) => {
      console.log("getSchedulers")
      console.log(res.data.data)
      resolve(res.data.data.schedulers)
    })
  })
}

function spawnScheduler (scheduler) {
  schedulerConfig.metadata.name = SCHEDULER_POD_PREFIX + scheduler._id
  schedulerConfig.metadata.labels.schedulerId = scheduler._id
  let env = {
    name: "schedulerId",
    value: scheduler._id
  }
  schedulerConfig.spec.containers[0].env.push(env)
  let configFile = schedulerConfig.metadata.name + '.json'
  let configString = JSON.stringify(schedulerConfig)
  fs.writeFileSync(configFile, configString, 'utf8')

  let cmd = `kubectl create -f ${configFile} && rm -f ${configFile}`
  runInBash(cmd, (err) => {
    if (err) {
      console.log('spawnScheduler error : ' + err)
      //Remove Scheduler from DB
    } else {
      console.log('spawnScheduler done')
    }
  })
}

function getSchedules() {
  return new Promise((resolve, reject) => {
    getAllSchedule([], 0, (schedules) => {
      resolve(schedules)
    })
  })
}

function getAllSchedule(array, page, cb) {
  let options = {
    per_page: QUERY_SCHEDULE_PER_PAGE,
    page: page,
    state: "inactive"
  }
  awSchedule.getSchedules(options).then(res => {
    if (res != null && res.data != null && res.data.data != null && res.data.data.schedules != null) {
      let schedules = res.data.data.schedules
      if (schedules.length > 0) {
        let a = array.concat(schedules)
        getAllSchedule(a, page + 1, cb)
      } else {
        cb(array)
      }
    }
  })
}

function runInBash(cmd, cb) {
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

function gracefullExit () {
  console.log('gracefullExit')
}

exports.gracefullExit = gracefullExit
