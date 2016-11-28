"use strict";

const fs = require('fs'); 
const winston = require('winston');
const winstonMiddleware = require('express-winston-middleware');

// create log directory if not exists
const logDir = __base + '/logs';

try {
	fs.accessSync(logDir, fs.F_OK);
}
catch(e) {
	console.log('Log directory created because it was not exists.');
	fs.mkdirSync(logDir);
}

console.log("Log at: " + logDir + "/*.log\n");

let logger = new winstonMiddleware.request({
	transports: [
		new winston.transports.File({
			json: true,
			filename: __base + '/logs/server.log' 
		})
	]
});

module.exports = logger;