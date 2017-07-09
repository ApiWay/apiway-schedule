#!/usr/bin/env node

/**
 * Module dependencies.
 */

var config = require('../config')
var bunyan = require('bunyan')
var mqtt = require('mqtt')
var schedule = require('../lib/schedule')

let log = bunyan.createLogger({name:'schedule'})

/**
 * Connect to MQTT Broker
 */

let url = `${config.mqtt.protocol}://${config.mqtt.host}`
log.info(url)
var client = mqtt.connect(url)

/**
 * Listen on provided port, on all network interfaces.
 */

client.on('connect', onConnect);
client.on('message', onMessage);
client.on('error', onError);

/**
 * Event listener for MQTT broker "connect" event.
 */

function onConnect() {
  // client.subscribe(schedule.topic)
  schedule.bootstrap()
  client.subscribe('apiway/schedule/+')
}

/**
 * Event listener for MQTT broker "message" event.
 */
function onMessage(topic, message, packet) {
  log.info(`topic:${topic}`)
  log.info(`message:${message}`)
  schedule.dispatch(topic, message)
}

/**
 * Event listener for MQTT broker "error" event.
 */

function onError (error) {
  log.info(error)
}

process.on('uncaughtException', function (err) {
  console.log('uncaughtException : ' + err);
  schedule.gracefullExit()
});
