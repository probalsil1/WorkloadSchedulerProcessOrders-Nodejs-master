/*********************************************************************
 *
 * Licensed Materials - Property of IBM
 * Product ID = 5698-WSH
 *
 * Copyright IBM Corp. 2015. All Rights Reserved.
 *
 ********************************************************************/ 
 
var express = require('express');

var  http = require('http'), path = require('path'), fs = require('fs'), ws = require('iws-light'), Guid = require('guid');

var app = express();

var db;

var cloudant;

var dbCredentials = {
		dbName : 'wspojs'
	};

var wsConn;

var wsLibrary = {
		name: 'wslib',
		procName: 'wspojs',
		procDesc: 'This process will start every day at 23:00 (11PM)'
};

var wsUrl = "insert your personal Workload Scheduler URL";

var agentName;

//all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.multipart());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/style', express.static(path.join(__dirname, '/views/style')));
app.use('/js', express.static(path.join(__dirname, '/views/js')));


//development only
if ('development' === app.get('env')) {
	app.use(express.errorHandler());
}



function initDBConnection() {
	if(process.env.VCAP_SERVICES) {
		var vcapServices = JSON.parse(process.env.VCAP_SERVICES);

		if(vcapServices.cloudantNoSQLDB) {
			dbCredentials.host = vcapServices.cloudantNoSQLDB[0].credentials.host;
			dbCredentials.port = vcapServices.cloudantNoSQLDB[0].credentials.port;
			dbCredentials.user = vcapServices.cloudantNoSQLDB[0].credentials.username;
			dbCredentials.password = vcapServices.cloudantNoSQLDB[0].credentials.password;
			dbCredentials.url = vcapServices.cloudantNoSQLDB[0].credentials.url;
		}	
	}
	else {
        dbCredentials.host = "insert your cloudant host";
		dbCredentials.port = 111;
		dbCredentials.user = "insert your cloudant user";
		dbCredentials.password = "insert your cloudant password";
		dbCredentials.url = "insert your cloudant url";
	}
	 
	cloudant = require('cloudant')(dbCredentials.url);

	cloudant.db.get(dbCredentials.dbName, function(err) {
		  if(err){
			  if(err.error == 'not_found'){
			  		console.log("Cloudant database not found");
					console.log("Creating Cloudant database...");
					cloudant.db.create(dbCredentials.dbName, function (err) {
					  if(err){
						  console.log('Could not create db ', err);
					  } else{
						  console.log("Cloudant database created");
					  }
				  });
			  } else{
				  console.log(err);
			  }
		  }
	});

	db = cloudant.use(dbCredentials.dbName);
}

function initWSConnection() {
	if(process.env.VCAP_SERVICES) {
		wsConn = ws.createConnection();
		
	} else {
		wsConn = ws.createConnection(wsUrl);
	}
	
	wsConn.getCloudAgent(function(data) {
		agentName = data;
	});
	
	//wsConn.enableLogging(true);
	
	wsConn.setTimezone({timezone: "Europe/Rome"}, function(err){
		if(err){
			console.log(err);
		} 
	});
}

initDBConnection();
initWSConnection();

function getProcessByName(libName, procName, callback) {
	console.log("Loading libraries...");
	wsConn.getProcessLibraries(null, function (err, data) {
	    if (err) {
	    	callback(err);
		} else {
			var library;
			var process;
			data.forEach(function(lib) {
				if (lib.name === libName) {
					library = lib;
					console.log("Process library found");
				}
			});
			if (!library) {
				console.log("Process library not found");
				console.log("Creating process library...");
				wsConn.createProcessLibrary(wsLibrary, function(err, data){
					if(err){
						console.log(err);
						callback(err);
					} else{
						console.log("Process library created");
						library = data;
						createNewProcess(library, wsLibrary.procName, wsLibrary.procDesc, function(err, proc){
							if(err){
								callback(err);
							} else{
								callback(null,proc);
							}
						});

					}
				});
			} else {
				console.log("Loading processes...");
				wsConn.getProcesses(library, function (err, data) {
					if (err) {
						callback(err);
					} else {
						data.forEach(function(proc) {
							if (proc.name === procName) {
								process = proc;
								console.log("Process found");
							}
						});
						if (process) {
							callback(null,process);
						} else {
							console.log("Process not found");
							createNewProcess(library, wsLibrary.procName, wsLibrary.procDesc, function(err, proc){
								if(err){
									callback(err);
								} else{
									callback(null,proc);
								}
							});
						}
					}
				});
			}
		}
	});
}

app.post('/api/submissions', function(request, response) {
	var submission = request.body;
	if(!submission){
		response.status(400).send('submission missing').end();
	}
	else{
		submission.start=new Date().toLocaleDateString();
		
		//Init status fields
		if (submission.end) delete submission.end;
		if (submission.jobId) delete submission.jobId;
		
		submission.status = 'submitted';
	
		submission._id = Guid.raw();
		
		db.insert(submission, '', function(err) {
			if(err) {
				console.log(err);
				response.status(500).send(err).end();
			} else {		

				//Start process on Workload Scheduler
				getProcessByName(wsLibrary.name, wsLibrary.procName, /* @callback */ function(err, process){
					if(err){
						setStatus(submission, "failed", function(err){
							if(err){
								console.log(err);
							}
						});
						response.status(500).send(err).end();
					} else{
						//console.info(process);
						response.status(200).end();
					}
				});
			}
		});
	}
});


function createNewProcess(library, processName, processDescription, callback){
	console.log("Creating process...");
	var process = new ws.WAProcess(processName, processDescription);
	fs.readFile('./project.json', 'utf8', function (err, data) {
  	if (err){
		callback(err);
	} else{
		var appInfo = JSON.stringify(data);
		var appName = appInfo.substring(appInfo.indexOf("| ") + 2, appInfo.length - 4);
		var restPath = "http://" + appName + ".mybluemix.net/api/sendemail/";
		var rfStep = new ws.steps.RestfulStep(agentName, restPath, "GET");
		process.addStep(rfStep);
		var trigger = ws.TriggerFactory.everyDayAt(1, 23, 00);							    			    
		process.addTrigger(trigger);
		process.tasklibraryid = library.id;
		
		wsConn.createAndEnableProcess(process, function(err, data){
			if(err){
				callback(err);
			} else{
				console.log("Process created and enabled");
				callback(null, data);
				}
			});
		}
	});

	return process;
}

function setStatus(document, status, callback){
	document.status = status;
	db.insert(document, '', function(err) {
		if(err) {
			callback(err);
		} else {
			callback();
		}
	});
}

app.get('/api/submissions', /* @callback */ function(request, response) {

	console.log("Get method invoked.. ");
	
	db.list(function(err, body) {
		if (!err) {
			var len = body.rows.length;
			console.log('total # of docs -> ' + len);
			
			var submissions = [];
			var i = 0;

			body.rows.forEach(function(document) {
				console.log('Getting :' + document.id);
				db.get(document.id, function(err, doc) {
					if (!err) {
						submissions.push(doc);
						i++;
						if (i>=len) {
							response.json(submissions).end;
						}
					} else {
						console.log('Error getting ' + document.id + ": " + err);
					}
				});
			});
		} else {
			console.log(err);
			response.status(500).send(err).end();
		}
	});
});

app.get('/api/submissions/:id', function(request, response) {
	var id = request.param('id');
	console.log("Get submission " + id + " invoked.. ");
	
	db.get(id, function(err, submission) {
		if (!err) {
			response.json(submission).end;
		} else {
			console.log('Error getting ' + id + ": " + err);
			response.status(404).send(err).end();
		}
	});
});

app.get('/api/sendemail/', /* @callback */ function(request, response){
	db.list(function(err, body) {
		if (!err) {
			var submissions = [];
			var i = 0;
			body.rows.forEach(function(document) {
				db.get(document.id, function(err, doc) {
					if (!err) {
						i++;
						if(doc.status !== "completed"){
							submissions.push(doc);
							var email = doc.email;
							var subject = doc.emailSubject;
							var text = doc.emailBody;
							//var status = doc.status;
							//var start = doc.start;
							console.log("Sending email to " + email + "...");
							var credentials;
							if (process.env.VCAP_SERVICES) {
							    var env = JSON.parse(process.env.VCAP_SERVICES);
							    credentials = env['sendgrid'][0].credentials;
							} else {
							    credentials = {
							        "hostname": "smtp.sendgrid.net",
							        "username" : "insert your SendGrid username",
							        "password" : "insert your Sendgrid password"
							    };
							}
							var sendgrid  = require('sendgrid')(credentials.username, credentials.password);
							sendgrid.send({
								to: email,
								from: 'Insert your email address',
								subject: subject,
								text: text
							},
							/* @callback */
							function(err, json) {
								if (err) {
									console.log("Email to "+ email +" not sent: " + err);
									setStatus(doc, "failed", function(err){
										if(err){
											console.log(err);
										}
									});
									response.status(500).send(err).end();
								} else {
									console.log("Email to "+ email +" sent");
									setStatus(doc, "completed", function(err){
										if(err){
											console.log(err);
										}
									});
									response.json(submissions).end();
								}
							});
						}
					} else {
						console.log('Error getting ' + document.id + ": " + err);
					}
				});
			});
		} else {
			console.log(err);
			response.status(500).send(err).end();
		}
	});
});

http.createServer(app).listen(app.get('port'), function() {
	console.log('Express server listening on port ' + app.get('port'));
});
