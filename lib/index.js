"use strict";

const am2 = require('am2');
const bcrypt = require('bcrypt-nodejs');
const xvalid = require('xvalid');
const ObjectID = am2.ObjectID;

const addressbook = {
	get(email) {
		return new Promise( (resolve, reject) => {
			if(typeof email === 'undefined' || !email) {
				return reject('Email must be specified.');
			}
			
			am2.aggregate('addressbook', [
				{ $match: { email } },
				{
					$lookup: {
						from: 'user',
						localField: 'target',
						foreignField: 'email',
						as: 'embedded'
					}
				},
				{
					$unwind: '$embedded'
				},
				{
					$project: {
						email: '$target',
						nickname: '$embedded.nickname',
						image: '$embedded.image'
					}
				}
			]).then( (data) => {
				resolve(data);
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	getChannel(email, target) {
		return new Promise( (resolve, reject) => {
			if(typeof email === 'undefined' || !email) {
				return reject('Email must be specified.');
			}
			
			am2.find('addressbook', {
				email,
				target,
				channel: {
					$ne: 0
				}
			}).then( (data) => {
				resolve(data[0] && data[0].channel || null);
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	updateChannel(email, target, channelID) {
		return new Promise( (resolve, reject) => {
			if(typeof email === 'undefined' || !email) {
				return reject('Email must be specified.');
			}
			else if(typeof target === 'undefined' || !target) {
				return reject('Target must be specified.');
			}
			else if(typeof channelID === 'undefined') {
				return reject('Channel ID must be specified.');
			}	// this allows 0
			
			am2.update('addressbook', {
				email,
				target
			}, {
				$set: {
					channel: channelID
				}
			}).then( () => {
				resolve();
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	checkExists(email, target) {
		return new Promise( (resolve, reject) => {
			if(typeof email === 'undefined' || !email) {
				return reject('Email must be specified.');
			}
			else if(typeof target === 'undefined' || !target) {
				return reject('Target must be specified.');
			}
			
			am2.count('addressbook', { email, target }).then( (cnt) => {
				resolve( cnt > 0 );
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	create(email, target) {
		return new Promise( (resolve, reject) => {
			if(typeof email === 'undefined' || !email) {
				return reject('Email must be specified.');
			}
			else if(typeof target === 'undefined' || !target) {
				return reject('Target must be specified.');
			}
			else if(email === target) {
				return reject('Cannot add friend yourself.');
			}
			
			// check user exists
			user.checkExists('email', target).then( (exists) => {
				if(!exists) {
					return reject('user does not exists.');
				}
				else {
					// check already exists
					return this.checkExists(email, target).then( (exists) => {
						if(exists) {
							reject('user already added as your friend.');
						}
						else {
							return am2.insert('addressbook', {
								email,
								target,
								channel: 0,
								createdAt: new Date()
							}).then( () => {
								resolve();
							});
						}
					});
				}
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	delete(email, target) {
		return new Promise( (resolve, reject) => {
			if(typeof email === 'undefined' || !email) {
				return reject('Email must be specified.');
			}
			else if(typeof target === 'undefined' || !target) {
				return reject('Target must be specified.');
			}
			
			am2.delete('addressbook', { email, target }).then( () => {
				resolve();
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	update(email, target, updateObj) {
		return new Promise( (resolve, reject) => {
			if(typeof email === 'undefined' || !email) {
				return reject('Email must be specified.');
			}
			else if(typeof target === 'undefined' || !target) {
				return reject('Target must be specified.');
			}
			else if(typeof updateObj === 'undefined' || !updateObj) {
				return reject('Update fields object must be specified.');
			}

			user.checkExists('email', email).then( (exists) => {
				if(!exists) {
					return reject('User does not exists.');
				}

				return am2.update('addressbook', {
					email,
					target
				}, updateObj).then( () => {
					resolve();
				});
			}).catch( (err) => {
				reject(err);
			});
		});
	}
};

const channel = {
	getList(email) {
		return new Promise( (resolve, reject) => {
			if(typeof email === 'undefined' || !email) {
				return reject('Email must be specified.');
			}
			
			am2.aggregate('channelList',
			[
				{
					$match: {
						participants: {
							$elemMatch: { $eq: email }
						}
					}
				},
				{
					$lookup: {
						from: 'user',
						localField: 'creator',
						foreignField: 'email',
						as: 'creatorInfo'
					}
				},
				{
					$unwind: '$creatorInfo'
				},
				{
					$project: {
						'_id': '$_id',
						creator: {
							_id: '$creatorInfo._id',
							email: '$creatorInfo.email',
							nickname: '$creatorInfo.nickname',
							image: '$creatorInfo.image'
						},
						target: '$target',
						createdAt: '$createdAt',
						updatedAt: '$updatedAt',
						lastMessage: '$lastMessage',
						multichat: '$multichat',
						name: '$name',
						image: '$image',
						participants: '$participants',
						config: '$config'
					}
				},
				{
					$lookup: {
						from: 'user',
						localField: 'target',
						foreignField: 'email',
						as: 'targetInfo'
					}
				},
				{
					$unwind: '$targetInfo'
				},
				{
					$project: {
						'_id': '$_id',
						creator: '$creator',
						target: {
							_id: '$targetInfo._id',
							email: '$targetInfo.email',
							nickname: '$targetInfo.nickname',
							image: '$targetInfo.image'
						},
						createdAt: '$createdAt',
						updatedAt: '$updatedAt',
						lastMessage: '$lastMessage',
						multichat: '$multichat',
						name: '$name',
						image: '$image',
						participants: '$participants',
						config: '$config'
					}
				},
				{
					$sort: {
						updatedAt: -1
					}
				}
			]
			).then( (channels) => {
				resolve(channels);
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	get(channelID) {
		return new Promise( (resolve, reject) => {
			if(typeof channelID === 'undefined' || !channelID) {
				return reject('Channel ID must be specified.');
			}
			
			am2.aggregate('channelList',
			[
				{
					$match: {
						'_id': new ObjectID(channelID)
					}
				},
				{
					$lookup: {
						from: 'user',
						localField: 'creator',
						foreignField: 'email',
						as: 'creatorInfo'
					}
				},
				{
					$unwind: '$creatorInfo'
				},
				{
					$project: {
						'_id': '$_id',
						creator: {
							_id: '$creatorInfo._id',
							email: '$creatorInfo.email',
							nickname: '$creatorInfo.nickname',
							image: '$creatorInfo.image'
						},
						target: '$target',
						createdAt: '$createdAt',
						updatedAt: '$updatedAt',
						lastMessage: '$lastMessage',
						multichat: '$multichat',
						name: '$name',
						image: '$image',
						participants: '$participants',
						config: '$config'
					}
				},
				{
					$lookup: {
						from: 'user',
						localField: 'target',
						foreignField: 'email',
						as: 'targetInfo'
					}
				},
				{
					$unwind: '$targetInfo'
				},
				{
					$project: {
						'_id': '$_id',
						creator: '$creator',
						target: {
							_id: '$targetInfo._id',
							email: '$targetInfo.email',
							nickname: '$targetInfo.nickname',
							image: '$targetInfo.image'
						},
						createdAt: '$createdAt',
						updatedAt: '$updatedAt',
						lastMessage: '$lastMessage',
						multichat: '$multichat',
						name: '$name',
						image: '$image',
						participants: '$participants',
						config: '$config'
					}
				}
			]
			).then( (channelInfo) => {
				resolve(channelInfo[0]);
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	// returns only channel list data without any joining
	getSimple(channelID) {
		return new Promise( (resolve, reject) => {
			if(typeof channelID === 'undefined' || !channelID) {
				return reject('Channel ID must be specified.');
			}

			am2.find('channelList', {
				_id: new ObjectID(channelID)
			}).then( (channels) => {
				resolve(channels[0]);
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	updateChannelMessage(channelID, messageID, email, nickname, image, message, sentAt) {
		return new Promise( (resolve, reject) => {
			am2.update('channelList', {
				'_id': new ObjectID(channelID)
			}, {
				$set: {
					lastMessage: {
						messageID,
						email,
						nickname,
						image,
						message,
						sentAt
					},
					updatedAt: new Date()
				}
			}).then( () => {
				resolve();
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	checkExists(channelID) {
		return new Promise( (resolve, reject) => {
			if(typeof channelID === 'undefined' || !channelID) {
				return reject('Channel ID must be specified.');
			}
			
			// check duplication
			am2.count('channelList', { '_id': new ObjectID(channelID) }).then( (cnt) => {
				resolve(cnt > 0);
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	// String channelID: ID of the channel to find messages
	// Number per: how many messages per request?
	// String fromID: ID of the message to starting found 
	getMessages(channelID, per, fromID) {
		return new Promise( (resolve, reject) => {
			if(typeof channelID === 'undefined' || !channelID) {
				return reject('Channel ID must be specified.');
			}
			if(typeof per === 'undefined') per = 10;

			// check channel exists
			channel.checkExists(channelID).then( (exists) => {
				if(!exists) {
					return reject('Channel does not exists.');
				}

				function response(cursor) {
					am2.cursorToArray(cursor).then( (messages) => {
						// reversing order of documents
						resolve(messages.reverse());
					}).catch( (err) => {
						reject(err);
					});
				}

				if(!fromID) {
					am2.findAndGetCursor(`channel_${channelID}`).then( (cursor) => {
						// reversing order for finding from end of the channel
						cursor.sort({ _id: -1 }).limit(per);

						response(cursor);
					}).catch( (err) => {
						reject(err);
					});
				}
				else {
					// get fromID message for get date
					am2.find(`channel_${channelID}`, { _id: new ObjectID(fromID) })
					.then( (fromMessage) => {
						if(fromMessage.length === 0) {
							return reject('Message Not Found');
						}

						let fromDate = fromMessage[0].sentAt;

						am2.findAndGetCursor(`channel_${channelID}`, {
							sentAt: {
								"$lt": new Date(fromDate)
							}
						}).then( (cursor) => {

							cursor.sort({ _id: -1 }).limit(per);
							response(cursor);

						}).catch( (err) => {
							reject(err);
						});
					}).catch( (err) => {
						reject(err);
					});
				}

			}).catch( (err) => {
				reject(err);
			});
		});
	},
	createMessage(channelID, email, message, type, file) {
		return new Promise( (resolve, reject) => {
			if(typeof channelID === 'undefined' || !channelID) {
				return reject('Channel ID must be specified.');
			}
			else if(typeof email === 'undefined' || !email) {
				return reject('Email must be specified.');
			}
			else if(typeof message === 'undefined' || !message) {
				return reject('Message must be specified.');
			}

			if(typeof type === 'undefined') type = 1;	// default(normal message)
			
			// check channel exists
			channel.checkExists(channelID).then( (exists) => {
				if(!exists) {
					return reject('Channel does not exists.');
				}

				// get user info
				return user.get(email).then( (userinfo) => {
					const sentAt = new Date();
					let messageData = {
						email,
						nickname: userinfo.nickname,
						image: userinfo.image,
						message,
						sentAt,
						type
					};

					if(file && typeof file === 'object') {
						messageData.file = file;
					}

					return am2.insert(`channel_${channelID}`, messageData).then( (result) => {
						let messageID = result.insertedId;
						// update last message of channel list
						this.updateChannelMessage(channelID, messageID, email, userinfo.nickname, userinfo.image, message, sentAt);
						resolve(messageID);
					});
				});
			}).catch( (err) => {
				console.log(err);
				console.log(err.stack);
				reject(err);
			});
		});
	},
	connect(email, target) {
		return new Promise( (resolve, reject) => {
			if(typeof email === 'undefined' || !email) {
				return reject('Email must be specified.');
			}
			else if(typeof target === 'undefined' || !target) {
				return reject('Target must be specified.');
			}
			
			// get channel
			addressbook.getChannel(email, target).then( (channelID) => {
				if(!channelID) {
					// create new channel list
					user.get(target).then( (targetInfo) => {
						am2.insert('channelList', {
							creator: email,
							target: target,
							createdAt: new Date(),
							updatedAt: new Date(),
							lastMessage: {},
							//multichat concerned
							multichat: false,
							name: (targetInfo.nickname) + ' and 1 more',
							image: '',
							participants: [email, target],
							config: {
								nameUpdated: false
							}
						}).then( (result) => {
							let cid = result.insertedId;

							// create channel's index
							am2.createIndex(`channel_${cid}`, { sentAt: 1 }, {
								unique: true
							});
							
							// update user's addressbook
							addressbook.updateChannel(email, target, cid).then( () => {
								this.get(cid).then( (channelInfo) => {
									resolve(channelInfo);
								}).catch( (err) => {
									reject(err);
								});
							}).catch( (err) => {
								// rollback the channel
								am2.delete('channelList', { '_id': new ObjectID(cid) });
								reject(err);
							});
							
						}).catch( (err) => {
							reject(err);
						});
					}).catch( (err) => {
						reject(err);
					});
				}
				else {
					this.get(channelID).then( (channelInfo) => {
						resolve(channelInfo);
					}).catch( (err) => {
						reject(err);
					});
				}
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	connectById(channelID) {
		return new Promise( (resolve, reject) => {
			if(typeof channelID === 'undefined' || !channelID) {
				return reject('Channel ID must be specified.');
			}

			// check exists
			channel.checkExists(channelID).then( (exists) => {
				if(!exists) {
					return reject('Channel does not exists.');
				}
				else {
					return this.get(channelID).then( (channelInfo) => {
						resolve(channelInfo);
					});
				}
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	invite(channelID, inviter, invitee) {
		return new Promise( (resolve, reject) => {
			if(typeof channelID === 'undefined' || !channelID) {
				return reject('Channel ID must be specified.');
			}
			else if(typeof inviter === 'undefined' || !inviter) {
				return reject('Inviter must be specified.');
			}
			else if(typeof invitee === 'undefined' || !invitee) {
				return reject('Invitee must be specified.');
			}

			channel.checkExists(channelID).then( (exists) => {
				if(!exists) {
					return reject('Channel does not exists.');
				}
				else {
					// get channel info
					return this.get(channelID).then( (channelInfo) => {
						
						// check user already in
						const participants = channelInfo.participants;

						for(var i = 0; i < participants.length; i++) {
							if(participants[i] === invitee) {
								return reject('User already in channel');
							}
						}

						// update Inviter's addressbook
						return addressbook.updateChannel(inviter, channelInfo.target.email, 0).then( () => {
							let newChannelName = channelInfo.name;

							if(!channelInfo.config.nameUpdated) {
								newChannelName = `${channelInfo.target.nickname} and ${(participants.length)} more`;
							}

							const updateObj = {
								"$set": {
									name: newChannelName,
									multichat: true
								},
								"$push": {
									participants: invitee
								}
							};

							if(channelInfo.image === '') {
								updateObj["$set"].image = "group";
							}

							return channel.update(channelID, updateObj).then( () => {

								// get invitor and invitee info
								return user.get(inviter).then( (inviterInfo) => {
									return user.get(invitee).then( (inviteeInfo) => {
										const multicastMessage = `${inviterInfo.nickname} invites ${inviteeInfo.nickname}.`;

										// push new message
										return this.createMessage(channelID, inviter, multicastMessage, 2).then( (messageID) => {
											resolve({
												messageID,
												message: multicastMessage
											});
										});
									});
								});

							});
						});

					});
				}
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	update(channelID, updateObj) {
		return new Promise( (resolve, reject) => {
			if(typeof channelID === 'undefined' || !channelID) {
				return reject('Channel ID must be specified.');
			}
			else if(typeof updateObj === 'undefined' || !updateObj) {
				return reject('Update fields object must be specified.');
			}

			channel.checkExists(channelID).then( (exists) => {
				if(!exists) {
					return reject('Channel does not exists.');
				}

				return am2.update('channelList', {
					_id: new ObjectID(channelID)
				}, updateObj).then( () => {
					resolve();
				});
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	saveFile(channelID, info) {
		return new Promise( (resolve, reject) => {
			const validator = xvalid.createAutoValidator({
				exps: {
					uploader: 'email|required',
					oldName: 'required',
					newName: 'required',
					path: 'required',
					mime: 'required',
					size: 'required'
				}
			});

			validator.check(info).then( () => {
				let createdAt = new Date();

				return am2.insert('uploadedFiles', {
					channel: channelID,
					uploader: info.uploader,
					originalName: info.oldName,
					name: info.newName,
					mime: info.mime,
					size: info.size,
					downloaded: 0,
					createdAt
				}).then( (result) => {
					let fileId = result.insertedId;

					// get user info
					return user.get(info.uploader).then( (userinfo) => {
						return channel.createMessage(channelID, info.uploader, `${userinfo.nickname} upload a file.`, 4, {
							_id: fileId,
							name: info.oldName,
							uploader: userinfo.email,
							mime: info.mime,
							size: info.size,
							createdAt
						}).then( (messageID) => {
							resolve({
								messageID,
								fileId,
								message: ''
							});
						});
					});
				});
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	getFileData(channelID, fileId) {
		return new Promise( (resolve, reject) => {
			am2.find('uploadedFiles', {
				_id: new ObjectID(fileId),
				channel: channelID
			}).then((docs) => {
				if(docs.length <= 0) {
					return reject(new Error('File Not Found'));
				}

				resolve(docs[0]);
			}).catch((err) => {
				reject(err);
			});
		});
	}
};

const user = {
	checkExists(type, data) {
		return new Promise( (resolve, reject) => {
			
			if(typeof type === 'undefined' || !type) {
				return reject({
					reason: 'Type must be specified.'
				});
			}
			else if(typeof data === 'undefined' || !data) {
				return reject({
					reason: 'Data must be specified.'
				});
			}
			
			type = type.toLowerCase();
			
			switch(type) {
				case 'email':
				case 'nickname':
					break;
				default:
					reject({
						reason: 'Unauthorized Request'
					});
					break;
			}
			
			// check duplication
			am2.count('user', { [type]: data }).then( (cnt) => {
				resolve(cnt > 0);
			}).catch( (err) => {
				reject(err);
			});
			
		});
	},
	signin(email, password) {
		return new Promise( (resolve, reject) => {
			if(typeof email === 'undefined' || !email) {
				return reject('Email must be specified.');
			}
			else if(typeof password === 'undefined' || !password) {
				return reject('Password must be specified.');
			}
			
			// get password from db
			am2.find('user', {
				email
			}).then( (docs) => {
				if(docs.length <= 0) {
					return reject('Email or Password is invalid.');
				}
				else {
					// get pw
					const hashedPw = docs[0].password;
					const comparedResult = bcrypt.compareSync(password, hashedPw);
					
					if(comparedResult) {
						resolve();
					}
					else {
						reject('Email or Password is invalid.');
					}
				}
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	get(email) {
		return new Promise( (resolve, reject) => {
			if(typeof email === 'undefined' || !email) {
				return reject('Email must be specified.');
			}
			
			am2.find('user', { email }, {
				excludes: ['password']
			}).then( (user) => {
				resolve(user[0]);
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	gets(users) {
		return new Promise( (resolve, reject) => {
			if(typeof users === 'undefined' || !users) {
				return reject('Users must be specified.');
			}

			am2.aggregate('user', [
				{
					$match: {
						email: {
							$in: users
						}
					}
				},
				{
					$project: {
						email: '$email',
						nickname: '$nickname',
						createdAt: '$createdAt',
						updatedAt: '$updatedAt',
						image: '$image'
					}
				}
			]).then( (users) => {
				resolve(users);
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	getChannelReads(email) {
		return new Promise( (resolve, reject) => {
			if(typeof email === 'undefined' || !email) {
				return reject('Email must be specified.');
			}
			
			this.get(email).then( (userInfo) => {
				resolve(userInfo.channelReads || []);
			}).catch( (err) => {
				reject(err);
			});			
		});
	},
	updateChannelReads(email, channelID, messageID) {
		return new Promise( (resolve, reject) => {
			if(typeof email === 'undefined' || !email) {
				return reject('Email must be specified.');
			}
			else if(typeof channelID === 'undefined' || !channelID) {
				return reject('Channel ID must be specified.');
			}
			else if(typeof messageID === 'undefined' || !messageID) {
				return reject('Message ID must be specified.');
			}

			this.getChannelReads(email).then( (channelReadsList) => {
				let hasChannelReads = false;

				for(var i = 0; i < channelReadsList.length; i++) {
					if(channelReadsList[i].channelID === channelID) {
						hasChannelReads = true;
						break;
					}
				}

				// if has channel reads, update
				if(hasChannelReads) {
					return am2.update('user', 
					{
						email,
						"channelReads.channelID": channelID 
					},
					{
						$set: {
							"channelReads.$.reads": messageID
						}
					}).then( () => {
						resolve();
					});
				}

				// else, create one.
				else {
					return am2.update('user', { email }, {
						$addToSet: {
							channelReads: {
								channelID,
								reads: messageID
							}
						}
					}).then( () => {
						resolve();
					});
				}

			}).catch( (err) => {
				reject(err);
			});
		});
	},
	create(data) {
		return new Promise( (resolve, reject) => {

			const validator = xvalid.createAutoValidator({
				exps: {
					email: 'email|required',
					password: 'required',
					nickname: 'required',
				}
			});
			
			validator.check(data).then( () => {
				
				// check email duplication
				return this.checkExists('email', data.email).then( (cnt) => {
					if(cnt) {
						return reject('Email already exists');
					}
					else {
						
						// check nickname duplication
						return this.checkExists('nickname', data.nickname).then( (cnt) => {
							if(cnt) {
								return reject('Nickname already exists');
							}
							else {
								
								// insert into db
								return am2.insert('user', {
									email: data.email,
									password: bcrypt.hashSync(data.password),
									nickname: data.nickname,
									image: 'default',
									createdAt: new Date(),
									updatedAt: new Date()
								}).then( () => {
									resolve();
								});
								
							}
						});
						
					}
				});
				
			}).catch( (err) => {
				reject(err);
			});
			
		});
	},
	update(email, updateObj) {
		return new Promise( (resolve, reject) => {
			if(typeof email === 'undefined' || !email) {
				return reject('Email must be specified.');
			}
			else if(typeof updateObj === 'undefined' || !updateObj) {
				return reject('Update fields object must be specified.');
			}

			user.checkExists('email', email).then( (exists) => {
				if(!exists) {
					return reject('User does not exists.');
				}

				return am2.update('user', { email }, updateObj).then( () => {
					resolve();
				});
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	setNotification(email, channelID, set) {
		return new Promise( (resolve, reject) => {
			if(typeof email === 'undefined' || !email) {
				return reject('Email must be specified.');
			}
			else if(typeof channelID === 'undefined' || !channelID) {
				return reject('Channel ID must be specified.');
			}
			
			set = !!set;

			channel.checkExists(channelID).then( (exists) => {
				if(!exists) {
					return reject('Channel does not exists.');
				}

				// don't confuse. list of noticiation means users in this list don't want to get notifications!
				let updateObj = {
					[set ? '$pull' : '$push']: {
						"noNotification": channelID
					}
				};

				// pull from notNotification
				return am2.update('user', {
					email
				}, updateObj).then( () => {
					resolve();
				});
			}).catch( (err) => {
				reject(err);
			});
		});
	},
	delete(emailid) {
		
	}
};

module.exports = {
	addressbook: addressbook,
	channel: channel,
	user: user
};