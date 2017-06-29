var spawn = require('child_process').spawn
var fs = require('fs');
var kue = require('kue-scheduler');
var ApiWay  = require('apiway.js')
let aw = new ApiWay({});
let awProject = aw.getProject();
let awInstance = aw.getInstance();


var TOPIC_PREFIX = 'apiway'

var Queue = kue.createQueue({
  prefix: 'q',
  redis: {
    port: 6379,
    host: 'redismaster',
    // host: 'localhost',
    options: {
      // see https://github.com/mranney/node_redis#rediscreateclient
    }
  },
  restore: true
});

exports.dispatch = function (topic, message) {
  // log.info(`topic: ${topic}`)
  // log.info(`message: ${message}`)

  let topicArray = topic.split("/")

  if (topicArray[1] == 'schedule') {
    if (topicArray[2] == 'create') {
      createSchedule(message)
    } else if (topicArray[2] == 'update') {

    }
  }
}

exports.topic = function () {
  return `${TOPIC_PREFIX}/+`
}

// var data = {
//   full_name: "bokkk",
//   _id: "59421a8b9815455b4b39e8da",
//   owner: "bluehackmaster",
//   schedule: "*/1 * * * *",
//   scheduleId: "3"
// }
// createSchedule(data)

function cleanJobs() {
  console.log('cleanJobs')
  Queue.clear(function(error,response){
    console.log(response)
  });
}

exports.recoverJobs = function () {
  // cleanJobs()

  Queue.restore(function(error, schedules){
    console.log('in restore')
    // console.log(error)
    schedules.forEach( function( schedule ) {
      // if (schedule.type != null && schedule.data != null) {
        console.log(schedule)
        makeJob(schedule.type, schedule.data)
      // }
    })
  });

  // console.log('recoverJobs')
  // Queue.active( function( err, ids ) {
  //   ids.forEach( function( id ) {
  //     console.log('active id:' + id)
  //     kue.Job.get( id, function( err, job ) {
  //       // Your application should check if job is a stuck one
  //       console.log('active job id: ' + id)
  //       // job.inactive();
  //     });
  //   });
  // });
  //
  // Queue.inactive( function( err, ids ) {
  //   ids.forEach( function( id ) {
  //     console.log('inactive id: ' + id)
  //     kue.Job.get( id, function( err, job ) {
  //       // Your application should check if job is a stuck one
  //       console.log('inactive job id: ' + id)
  //       // job.inactive();
  //     });
  //   });
  // });
}

function createSchedule (data) {
  let project = JSON.parse(data)

  if (!project) {
    throw `Data error: ${data}`
  }
  let jobType = `${project.full_name}-${project._id}`
  makeJob(jobType, project)
  // removeSchedule(Number.parseInt(project.scheduleId))
  //   .then(() => createSchedule(jobType, project))
}


function makeJob (name, data) {
  var searchKeys = []
  searchKeys.push(name)
  searchKeys.push(data._id)
  searchKeys.push(data.full_name)
  searchKeys.push(data.owner)

  var job = Queue
    .createJob(name, data)
    .attempts(3)
    .backoff(false)
    .priority('normal')
    .removeOnComplete( true )
    .searchKeys(searchKeys)
    // .unique(name)
    .save()


  // data.schedule = '* */5 * * * *'
  // console.log(data.schedule)
  //Queue.every(data.schedule, job);
  Queue.every('2 minutes', job);
  Queue.process(name, function (job, done) {
    console.log(`jobId:${job.id}`)
    awProject.setScheduleId(data._id, String(job.id)).then(res => {
      if (res != null) {
      }
      runProject(data)
      done();
    }).catch(err => {
      console.error(err)
      done();
    })
  })
}

Queue.on('already scheduled', function(job) {
  Queue.remove(job)
});

function runProject (project) {
  awInstance.addInstance({projectId: project._id}).then(res => {
    if (res!= null) {
    }
  }).catch(err => {
    console.error(err)
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
