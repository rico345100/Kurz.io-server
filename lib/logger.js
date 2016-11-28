"use strict";

const fs = require('fs'); 
const winston = require('winston');
const Log = require('express-winston-middleware').Log;

// create log directory if not exists
const logDir = __base + '/logs';

try {
	fs.accessSync(logDir, fs.F_OK);
}
catch(e) {
	console.log('Log directory created because it was not exists.');
	fs.mkdirSync(logDir);
}

let log = new Log({
	transports: [
		new winston.transports.File({
			json: true,
			filename: __base + '/logs/log.log' 
		})
	]
});

module.exports = log;