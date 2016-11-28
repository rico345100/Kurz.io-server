"use strict";

global.__base = __dirname;

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt-nodejs');
const express = require('express');
const app = express();
const http = require('http').Server(app)
const io = require('socket.io')(http);
const SocketIOFile = require('socket.io-file');
const am2 = require('am2');
const mime = require('mime');
const xvalid = require('xvalid');

const authKey = 'ferrero-nutella';

require('socketio-auth')(io, {
	authenticate: (socket, data, callback) => {
		callback(null, data.key === authKey);
	}
});


// create global logger
const expressLogger = require(__dirname + '/lib/expressLogger');
const logger = require(__dirname + '/lib/logger');
global.logger = logger;

const lib = require(__dirname + '/lib');
const addressbook = lib.addressbook;
const channel = lib.channel;
const user = lib.user;
const PORT_NUMBER = 3000;


http.listen(PORT_NUMBER, () => {
	console.log(`Kurz.io server listening on *:${PORT_NUMBER}`);
});

// use winston as logging middleware
app.use(expressLogger);

app.get('/profile/:name', (req, res) => {
	let name = req.params.name;
	res.sendFile(__dirname + '/userdata/profile/' + path.basename(name));
});

app.get('/channel/image/:name', (req, res) => {
	let name = req.params.name;
	res.sendFile(__dirname + '/userdata/channel/image/' + path.basename(name));
});

app.get('/channel/:channelID/file/:fileId', (req, res) => {
	let channelID = req.params.channelID;
	let fileId = req.params.fileId;
	
	// get file data
	channel.getFileData(channelID, fileId).then((fileInfo) => {
		res.download(`${__dirname}/userdata/channel/${channelID}/${fileInfo.name}`, fileInfo.originalName);
	});
});

app.get('/channel/:channelID/image/:fileId', (req, res) => {
	let channelID = req.params.channelID;
	let fileId = req.params.fileId;
	
	// get file data
	channel.getFileData(channelID, fileId).then((fileInfo) => {
		res.sendFile(`${__dirname}/userdata/channel/${channelID}/${fileInfo.name}`);
	});
});

// start db
am2.connect('localhost', 'kurz-io', { reconnect: true, connectTimeout: 3000 }).then( () => {
	console.log('db connected!');

	function createUniqueIndex(col, index) {
		am2.createIndex(col, index, {
			unique: true
		}).then( () => {
			//console.log('created ' + col +' indexes(unique)');
		}).catch( (error) => {
			//console.log('failed to create ' + col + ' indexes: ' + error);
			logger.error('failed to create ' + col + ' indexes: ' + error);
		});
	}
	function createSparseIndex(col, index) {
		am2.createIndex(col, index, {
			sparse: true
		}).then( () => {
			//console.log('created ' + col +' indexes(sparse)');
		}).catch( (error) => {
			//console.log('failed to create ' + col + ' indexes: ' + error);
			logger.error('failed to create ' + col + ' indexes: ' + error);
		});
	}

	// update indexes
	// user
	createUniqueIndex('user', { email: 1 });
	createUniqueIndex('user', { nickname: 1 });
	createSparseIndex('user', { channelReads: 1 });

	// addressbook
	createSparseIndex('addressbook', { email: 1 });
	createSparseIndex('addressbook', { target: 1 });

	// channelList
	createSparseIndex('channelList', { creator: 1 });
	createSparseIndex('channelList', { target: 1 });
	createUniqueIndex('channelList', { lastMessage: 1 });
	createSparseIndex('channelList', { participants: 1});

	// uploadedFiles
	createSparseIndex('uploadedFiles', { uploader: 1 });

}).catch( (err) => {
	//console.log('failed to connect db: ', err);
	logger.error('failed to connect db: ', err);
	process.exit(1);
});

const sockets = {};
const userInfos = {};

function multicast(who, participants, ev, data) {
	for(var i = 0; i < participants.length; i++) {
		const userEmail = participants[i];
		const userSocket = sockets[userEmail];

		if(userSocket) {
			userSocket.emit(ev, data);
		}
	}
}

io.on('connection', (socket) => {
	console.log('connected from ' + socket.id);

	let authenticated = null;
	let authEmail = null;
	let userInfo = null;

	let socketIOFile = new SocketIOFile(socket, {
		uploadDir: {
			profile: 'userdata/profile',
			channelImage: 'userdata/channel/image',
			chatFile: 'userdata/temp'
		}
	});

	/*socketIOFile.on('start', () => {
		console.log('upload started.');
	});
	socketIOFile.on('stream', (data) => {
		console.log('Streaming... ' + data.uploaded + ' / ' + data.size);
	});*/
	socketIOFile.on('complete', (data) => {
		const todayStr = new Date().toISOString();
		const uploadData = data.data;

		switch(data.uploadTo) {
			// on upload profile, rename it directly, because already has user data
			case 'profile':
				var evName = '/user/update/image';
				var newName = `${userInfo._id}_${todayStr}`;
				var prevImage = userInfo.image;

				fs.rename(`${__dirname}/userdata/profile/${data.name}`, `${__dirname}/userdata/profile/${newName}`, (err) => {
					if(err) {
						return socket.emit(evName, {
							error: err.message || err
						});
					}

					user.update(authEmail, {
						$set: {
							image: newName
						}
					}).then( () => {
						userInfo.image = newName;	// update local user info
						socket.emit(evName, {});
					}).catch( (error) => {
						socket.emit(evName, {
							error: error.message || error.reason || error
						});
					});
				});
				break;
			//on upload channel image, make notice to client to update image name later	
			case 'channelImage':
				var uploadedImageName = data.name;
				var evName = '/channel/rename/image';
				var channelID = uploadData.channelID;
				var oldName = uploadData.currentImage;
				var newName = `${channelID}_${todayStr}`;
				
				fs.rename(`${__dirname}/userdata/channel/image/${uploadedImageName}`, `${__dirname}/userdata/channel/image/${newName}`, (err) => {
					if(err) {
						logger.error('failed to rename: ', err);
						return socket.emit(evName, {
							error: err.message || err
						});
					}

					socket.emit(evName, {
						newName
					});

					// remove old image
					if(oldName && oldName !== 'group') {
						fs.unlink(`${__dirname}/userdata/channel/image/${oldName}`, (err) => {
							if(err) {
								logger.error(err);
							}
						});
					}
				});
				break;
			case 'chatFile':
				var uploadId = data.uploadId;
				var evName = `/channel/file/upload/${uploadId}`;
				var channelID = uploadData.channelID;
				var oldName = data.name;
				var newName = `${channelID}_${todayStr}`;
				var tmpPath = 'userdata/temp';
				var mimeType = mime.lookup(`${tmpPath}/${oldName}`);

				function processFile() {
					fs.rename(`${__dirname}/${tmpPath}/${oldName}`, `${__dirname}/userdata/channel/${channelID}/${newName}`, (err) => {
						if(err) {
							logger.error('failed to rename: ', err);
							
							// remove file
							fs.unlink(`${tmpPath}/${oldName}`);

							return socket.emit(evName, {
								error: err.message || err
							});
						}

						// write into DB
						channel.saveFile(channelID, {
							uploader: userInfo.email,
							oldName,
							newName,
							path: `${__dirname}/userdata/channel/${channelID}`,
							mime: mimeType,
							size: data.size
						}).then( (result) => {
							socket.emit(evName, {});

							const multicastEvName = '/channel/message/receive';

							return channel.getSimple(channelID).then( (channelInfo) => {
								const participants = channelInfo.participants;

								multicast(userInfo.email, participants, multicastEvName, {
									channelID: channelID,
									'_id': result.messageID,
									email: userInfo.email,
									nickname: userInfo.nickname,
									image: userInfo.image,
									message: `${userInfo.nickname} upload a file.`,
									sentAt: new Date(),
									type: 4,
									file: {
										_id: result.fileId,
										name: oldName,
										uploader: userInfo.email,
										mime: mimeType,
										size: data.size,
										createdAt: new Date()
									}
								});
							});
						}).catch( (err) => {
							// remove file
							fs.unlink(`${__dirname}/userdata/channel/${channelID}/${newName}`);

							return socket.emit(evName, {
								error: err.message || err
							});
						});
					});
				}

				// create channel directory if not exists
				fs.access(`${__dirname}/userdata/channel/${channelID}`, fs.F_OK, (err) => {
					// directory not exists?
					if(err) {
						fs.mkdir(`${__dirname}/userdata/channel/${channelID}`, '0755', (error) => {
							if(error) {
								return socket.emit(evName, {
									error: error.message || error
								});
							}

							processFile();
						});
					}
					else {
						processFile();
					}
				});
				break;
		}
	});

	socket.on('error', (err) => {
		console.log('Error occured:', err);
		logger.error(err);
	});

	socket.on('disconnect', () => {
		console.log('disconnected from ' + socket.id);

		if(authenticated) {
			socketIOFile.removeAllListeners();
			socketIOFile = '';	// remove object
			
			delete sockets[authEmail];
			delete userInfos[authEmail];

			authenticated = null;
			authEmail = null;
			userInfo = null;
		}
	});

	
	// user
	// signup
	socket.on('/user/signup', (data) => {
		user.create(data).then( () => {
			socket.emit('/user/signup', {});
		}).catch( (error) => {
			socket.emit('/user/signup', {
				error: error.message || error.reason || error
			});
		});
	});
	
	// login
	socket.on('/user/signin', (data) => {
		const evName = '/user/signin';
		
		const validator = xvalid.createAutoValidator({
			exps: {
				email: 'email|required',
				password: 'required'
			}
		});

		validator.check(data).then( () => {
			return user.signin(data.email, data.password).then( () => {
				authenticated = true;
				authEmail = data.email;
				
				// get user info
				return user.get(data.email).then( (info) => {
					userInfos[authEmail] = userInfo = info;

					sockets[data.email] = socket;
					socket.emit(evName, {});
				});
			});
		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});

	// logout
	socket.on('/user/signout', (data) => {
		const evName = '/user/signout';
		
		const validator = xvalid.createAutoValidator({
			exps: {
				email: 'email|required'
			}
		});

		validator.check(data).then( () => {
			if(authenticated) {
				delete sockets[authEmail];
				delete userInfos[authEmail];
			}

			authenticated = null;
			authEmail = null;
			userInfo = null;

			socket.emit(evName, {});
		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});
	
	// get user
	socket.on('/user/get', (data) => {
		socket.emit('/user/get', userInfo);
	});

	// get user's channel reads
	socket.on('/user/get/channelReads', (data) => {
		const evName = '/user/get/channelReads';

		user.getChannelReads(data.email).then( (channelReads) => {
			socket.emit(evName, {
				channelReads
			});
		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});

	// get user's channel reads
	socket.on('/user/update/channelReads', (data) => {
		const evName = '/user/update/channelReads';

		user.updateChannelReads(data.email, data.channelID, data.messageID).then( () => {
			socket.emit(evName, {});
		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});

	// update user
	socket.on('/user/update', (data) => {
		const evName = '/user/update';

		const validator = xvalid.createAutoValidator({
			exps: {
				email: 'email|required',
				password: 'required'
			}
		});

		validator.check(data).then( () => {
			// check password
			return user.signin(data.email, data.password).then( () => {
				const updateObj = {
					$set: {}
				};

				// if user passes new password, update!
				if(data.newPassword) {
					updateObj["$set"].password = bcrypt.hashSync(data.newPassword);
				}

				function updateUser() {
					return user.update(data.email, updateObj).then( () => {
						// update userInfo
						return user.get(data.email).then((info) => {
							userInfos[data.email] = userInfo = info;
							socket.emit(evName, {});
						});
					});
				}

				// check nickname only it has
				if(data.nickname) {
					return user.checkExists('nickname', data.nickname).then( (exists) => {
						if(exists) {
							return socket.emit(evName, {
								error: {
									reason: 'Someone already using same nickname.'
								}
							});
						}

						updateObj["$set"].nickname = data.nickname;
						return updateUser();
					});	
				}
				else {
					return updateUser();
				}
				
			});
		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});

	// update channel notification
	socket.on('/user/update/notification', (data) => {
		const evName = '/user/update/notification';
		const validator = xvalid.createAutoValidator({
			exps: {
				email: 'email|required',
				channelID: 'string|required'
			}
		});

		validator.check(data).then( () => {
			return user.setNotification(data.email, data.channelID, data.set).then(() => {
				return user.get(data.email).then((info) => {
					userInfos[data.email] = userInfo = info;
					socket.emit(evName, {});
				});
			});
		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});

	
	// channel
	// get channel
	socket.on('/channel/get', (data) => {
		const evName = '/channel/get';
		const validator = xvalid.createAutoValidator({
			exps: {
				channelID: 'string|required'
			}
		});
		
		validator.check(data).then( () => {
			return channel.get(data.channelID).then( (channelInfo) => {
				socket.emit(evName, {
					channelInfo
				});
			});
		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});

	// get channel lists
	socket.on('/channel/get/list', (data) => {
		const evName = '/channel/get/list';
		const validator = xvalid.createAutoValidator({
			exps: {
				email: 'email|required'
			}
		});
		
		validator.check(data).then( () => {
			return channel.getList(data.email).then( (channels) => {
				socket.emit(evName, {
					channels
				});
			});			
		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});

	// get participants info
	socket.on('/channel/get/participants', (data) => {
		const evName = '/channel/get/participants';
		const validator = xvalid.createAutoValidator({
			exps: {
				participants: 'required'
			}
		});

		validator.check(data).then( () => {
			 return user.gets(data.participants).then( (participantsInfo) => {
				 socket.emit(evName, {
					 list: participantsInfo
				 });
			 });
		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});
	
	
	// addressbook
	// get
	socket.on('/addressbook/get', (data) => {
		const evName = '/addressbook/get';
		const validator = xvalid.createAutoValidator({
			exps: {
				email: 'email|required'
			}
		});
		
		validator.check(data).then( () => {
			return addressbook.get(data.email).then( (list) => {
				socket.emit(evName, {
					list
				});
			});
		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});
	
	// create
	socket.on('/addressbook/create', (data) => {
		const evName = '/addressbook/create';
		const validator = xvalid.createAutoValidator({
			exps: {
				email: 'email|required',
				target: 'email|required'
			}
		});
		
		validator.check(data).then( () => {
			return addressbook.create(data.email, data.target).then( () => {
				socket.emit(evName, {});
			});
		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});
	
	// delete
	socket.on('/addressbook/delete', (data) => {
		const evName = '/addressbook/delete';
		
		const validator = xvalid.createAutoValidator({
			exps: {
				email: 'email|required',
				target: 'email|required'
			}
		});
		
		validator.check(data).then( () => {
			return addressbook.delete(data.email, data.target).then( () => {
				socket.emit(evName, {});
			});
		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});
	
	
	// channel
	// connect to channel by email and target
	socket.on('/channel/connect', (data) => {
		const evName = '/channel/connect';
		
		const validator = xvalid.createAutoValidator({
			exps: {
				email: 'email|required',
				target: 'email|required'
			}
		});
		
		validator.check(data).then( () => {
			return channel.connect(data.email, data.target).then( (result) => {
				socket.emit(evName, result);
			});	
		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});

	// connect to channel by id
	socket.on('/channel/connect/id', (data) => {
		const evName = '/channel/connect/id';
		
		const validator = xvalid.createAutoValidator({
			exps: {
				channel: 'string|required'
			}
		});
		
		validator.check(data).then( () => {
			return channel.connectById(data.channel).then( (result) => {
				socket.emit(evName, result);
			});
		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});
	
	// get messages
	socket.on('/channel/message/get', (data) => {
		const evName = '/channel/message/get';

		channel.getMessages(data.channelID, data.per, data.fromID).then( (messages) => {
			socket.emit(evName, {
				messages
			});
		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});
	
	// write message
	socket.on('/channel/message/send', (data) => {
		const evName = '/channel/message/send';
		const multicastEvName = '/channel/message/receive';
		const validator = xvalid.createAutoValidator({
			exps: {
				channelID: 'string|required',
				email: 'email|required',
				message: 'string|required'
			}
		});

		// check user belong's the channel
		channel.getSimple(data.channelID).then( (channelInfo) => {
			const participants = channelInfo.participants;

			let found = false;
			for(var i = 0; i < participants.length; i++) {
				if(participants[i] === data.email) {
					found = true;
					break;
				}
			}

			if(!found) {
				return socket.emit(evName, {
					error: {
						reason: 'User does not belong to the channel.'
					}
				});
			}
			
			// multicast
			// get sender info
			// get channel info for multicast
				
			return channel.createMessage(data.channelID, data.email, data.message).then( (messageID) => {
				socket.emit(evName, {});

				return user.get(data.email).then( (senderInfo) => {
					multicast(data.email, participants, multicastEvName, {
						channelID: data.channelID,
						'_id': messageID,
						email: data.email,
						nickname: senderInfo.nickname,
						image: senderInfo.image,
						message: data.message,
						sentAt: new Date(),
						type: 1
					});
				});
			});

		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});

	// invite user
	socket.on('/channel/invite', (data) => {
		const evName = '/channel/invite';
		const multicastEvName = '/channel/message/receive';

		channel.invite(data.channelID, data.inviter, data.invitee).then( (result) => {
			const messageID = result.messageID;
			const messageText = result.message;

			return channel.getSimple(data.channelID).then( (channelInfo) => {
				const participants = channelInfo.participants;

				socket.emit(evName, {});

				return user.get(data.inviter).then( (senderInfo) => {
					multicast(data.email, participants, multicastEvName, {
						channelID: data.channelID,
						'_id': messageID,
						email: data.inviter,
						nickname: senderInfo.nickname,
						image: senderInfo.image,
						message: messageText,
						sentAt: new Date(),
						type: 3
					});
				});
			});

		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});

	// update channel name
	socket.on('/channel/update/name', (data) => {
		const evName = '/channel/update/name';
		const multicastEvName = '/channel/message/receive';
		const validator = xvalid.createAutoValidator({
			exps: {
				channelID: 'string|required',
				email: 'email|required',
				name: 'required'
			}
		});

		validator.check(data).then( () => {
			// changing name of the channel only available on multichat
			return channel.getSimple(data.channelID).then( (channelInfo) => {

				if(!channelInfo.multichat) {
					return socket.emit(evName, {
						error: {
							reason: 'Update channel name is only available on Multichat'
						}
					});
				}

				return channel.update(data.channelID, {
					$set: {
						name: data.name,
						"config.nameUpdated": true
					}
				}).then( () => {
					socket.emit(evName, {});

					return user.get(data.email).then( (senderInfo) => {
						const messageText = `${senderInfo.nickname} changed channel name to ${data.name}.`;
						const participants = channelInfo.participants;

						return channel.createMessage(data.channelID, data.email, messageText, 2).then( (messageID) => {
							multicast(data.email, participants, multicastEvName, {
								channelID: data.channelID,
								'_id': messageID,
								email: data.email,
								nickname: senderInfo.nickname,
								image: senderInfo.image,
								message: messageText,
								sentAt: new Date(),
								type: 2
							});
						});
					});
				});
			});
		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});

	// update channel image
	socket.on('/channel/update/image', (data) => {
		const evName = '/channel/update/image';
		const multicastEvName = '/channel/message/receive';
		const validator = xvalid.createAutoValidator({
			exps: {
				channelID: 'string|required',
				email: 'email|required',
				image: 'required'
			}
		});

		validator.check(data).then( () => {
			return channel.getSimple(data.channelID).then( (channelInfo) => {

				if(!channelInfo.multichat) {
					return socket.emit(evName, {
						error: {
							reason: 'Update channel name is only available on Multichat'
						}
					});
				}

				return channel.update(data.channelID, {
					$set: {
						image: data.image
					}
				}).then( () => {
					socket.emit(evName, {});

					return user.get(data.email).then( (senderInfo) => {
						const messageText = `${senderInfo.nickname} changed channel image.`;
						const participants = channelInfo.participants;

						return channel.createMessage(data.channelID, data.email, messageText, 2).then( (messageID) => {
							multicast(data.email, participants, multicastEvName, {
								channelID: data.channelID,
								'_id': messageID,
								email: data.email,
								nickname: senderInfo.nickname,
								image: senderInfo.image,
								message: messageText,
								sentAt: new Date(),
								type: 2
							});
						});
					});
				});
			});
		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});

	// leave the channel
	socket.on('/channel/leave', (data) => {
		const evName = '/channel/leave';
		const multicastEvName = '/channel/message/receive';
		const validator = xvalid.createAutoValidator({
			exps: {
				channelID: 'string|required',
				email: 'email|required'
			}
		});

		validator.check(data).then( () => {
			return channel.getSimple(data.channelID).then( (channelInfo) => {
				const participants = channelInfo.participants;
				const updateObj = {
					$pull: {
						participants: data.email
					}
				};

				function updateUserLeaves() {
					return channel.update(data.channelID, updateObj).then( () => {

						// push message that user is now leaving
						return user.get(data.email).then( (senderInfo) => {
							const messageText = `${senderInfo.nickname} leaved channel.`;
							
							// find and remove the user in channel participants
							let found = false;
							for(var i = 0; i < participants.length; i++) {
								if(participants[i] === data.email) {
									participants.splice(i, 1);
									found = true;
									break;
								}
							}

							if(!found) {
								return socket.emit(evName, {
									error: {
										reason: data.email + ' is not belong to this channel.'
									}
								});
							}

							socket.emit(evName, {});

							return channel.createMessage(data.channelID, data.email, messageText, 2).then( (messageID) => {
								multicast(data.email, participants, multicastEvName, {
									channelID: data.channelID,
									'_id': messageID,
									email: data.email,
									nickname: senderInfo.nickname,
									image: senderInfo.image,
									message: messageText,
									sentAt: new Date(),
									type: 3
								});
							});
						});
					});
				}

				// if multichat and config.nameUpdated is false, create new name.
				if(channelInfo.multichat && !channelInfo.config.nameUpdated) {
					let oldChannelName = channelInfo.name;
					
					return user.get(channelInfo.target).then( (targetInfo) => {
						let newChannelName = `${targetInfo.nickname} and ${participants.length - 2} more.`;

						updateObj["$set"] = {
							name: newChannelName
						};

						return updateUserLeaves();
					});
				}
				// else, update user's addressbook
				else {
					// determine user is creator or target for update who's addressbook
					let who = data.email;
					let target = data.email === channelInfo.creator ? channelInfo.target : channelInfo.creator;

					return addressbook.update(who, target, {
						$set: {
							channel: 0
						}
					}).then( () => {
						// update opposite's addressbook too.
						addressbook.update(target, who, {
							$set: {
								channel: 0
							}
						});

						return updateUserLeaves();
					});
				}
			});
		}).catch( (error) => {
			socket.emit(evName, {
				error: error.message || error.reason || error
			});
		});
	});
});


// make the program will not close instantly
process.stdin.resume();

// uncaught exception error handling for prevent node server dies
// remember, node server easily crashed on just simple exception thrown!
// domain API is deprecated so let's use process error cathing pattern
process.on('uncaughtException', function(err) {
	console.log(err);
	console.log(err.stack);
	logger.error(err);
	logger.error(err.stack);
});

function closeDB() {
	// close db forcely
	am2.disconnect(true).then( () => {
		//console.log('db closed');
		process.exit(1);
	});
}

// when app is closing
process.on('SIGINT', () => {
	closeDB();
});

// ctrl + c
process.on('exit', () => {
	closeDB();
});