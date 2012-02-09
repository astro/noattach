var fs = require('fs');
var Connect = require('connect');
var io = require('socket.io');

var rooms = require('./rooms');
var util = require('./util');
var transfer = require('./transfer');

var ROOM_PREFIX = 'r';
var ROOM_REGEXP = /^\/r(\d{6,24})(.*)/;
var PUBLIC = __dirname + '/public';

var stats = { room: { view: 0,
		      post: 0,
		      head: 0,
		      get: 0 },
	      redirect: 0,
	      'static': 0,
	      sockets: 0
	    };

function statsMiddleware(req, res, next) {
    if (req.method === 'GET' &&
	req.url === '/stats.json') {

	res.writeHead(200, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(stats));
    } else
	next();
}

function roomMiddleware(req, res, next) {
    var m = req.url.match(ROOM_REGEXP);
    if (!m)
	return next();

    var roomId = m[1];
    var room = rooms.get(roomId);
    process.nextTick(function() {
	rooms.tidy(roomId);
    });

    var path = m[2];
    if (!path) {
	MiddleWare.respondFile(PUBLIC + '/index.html', 'text/html; charset=utf-8')(req, res, next);

	stats.room.view++;
    } else if (req.method === 'POST' &&
	       (m = path.match(/^\/f(\d+)\/(\d+)$/))) {
        var shareId = m[1];
	var token = m[2];
	var cb = room.getTransferCallback(shareId, token);
	if (!cb) {
	    console.warn({ mismatch: { shareId: shareId, token: token } });
	    res.writeHead(404, { });
	    res.end();
	} else {
	    /* transferCb success! */
	    cb(req, res);
	}

	stats.room.post++;
    } else if (req.method === 'HEAD' &&
	       (m = path.match(/^\/f(\d+)/))) {
	var shareId = m[1];
	var shareInfo = room.getShare(shareId);
	if (shareInfo) {
	    var filename = shareInfo.name.replace(/\"/g, '');
	    res.writeHead(200, { 'Content-Type': 'application/octet-stream',
				 'Content-Disposition': 'attachment; filename="' + filename + '"',
				 'Content-Length': shareInfo.size });
	} else
	    res.writeHead(404, { });
	res.end();

	stats.room.head++;
    } else if (req.method === 'GET' &&
	       (m = path.match(/^\/f(\d+)/))) {
	var shareId = m[1];
	var shareInfo = room.getShare(shareId);
	if (shareInfo) {
	    // good, transfer takes control of req & res now
	    new transfer.Transfer(shareInfo, room, req, res);
	} else {
	    res.writeHead(404, { });
	    res.end();
	}

	stats.room.get++;
    } else {
	res.writeHead(404, { });
	res.end();
    }
}

var MiddleWare = {
    on: function(method, path, to) {
	return function(req, res, next) {
	    if (req.method === method &&
		req.url === path)
		to(req, res, next);
	    else
		next();
	};
    },

    redirectRandom: function(req, res, next) {
	var room, len = 8;
	do {
	    room = util.generateToken(len);
	    len++;
	} while(rooms.has(room));

	res.writeHead(307, { Location: ROOM_PREFIX + room });
	res.end();

	stats.redirect++;
    },

    respondFile: function(filename, contentType) {
	return function(req, res, next) {
            fs.stat(filename, function(err, stat){
		// Pass through for missing files, thow error for other problems
		if (err || stat.isDirectory()) {
		    next(err || new Error('Cannot respond directory'));
		}

		// Serve the file directly using buffers
		function onRead(err, data) {
		    if (err) throw next(err);

		    // Response headers
		    var headers = {
			"Content-Type": contentType,
			"Content-Length": stat.size,
			"Last-Modified": stat.mtime.toUTCString(),
			"Cache-Control": "public max-age=3600"
		    };

		    res.writeHead(200, headers);
		    res.end(req.method === 'HEAD' ? undefined : data);

		    stats['static']++;
		}

		fs.readFile(filename, onRead);
	    });
	};
    }
};

var server = Connect.createServer(
    Connect.logger(),
    MiddleWare.on('GET', '/', MiddleWare.redirectRandom),
    Connect.static(PUBLIC),
    roomMiddleware,
    statsMiddleware,
    Connect.errorHandler({ dumpExceptions: true, showStack: true })
);
server.listen(parseInt(process.env.PORT, 10) || 8000);

var socketServer = io.listen(server);
socketServer.configure(function(){
    socketServer.set('transports', ['htmlfile', 'xhr-polling', 'jsonp-polling']);
    socketServer.set('close timeout', 15);
    socketServer.set('heartbeat timeout', 5);
    socketServer.set('heartbeat interval', 10);
});
socketServer.of('/noattach').on('connection', function(socket) {
    var room;
    // hook socket's message & disconnect

    socket.on('join', function(path) {
	var m = path && path.match(ROOM_REGEXP);
	if (m && m[1] && !m[2]) {
	    console.log('join', path, m[1]);
	    room = rooms.get(m[1]);
	    room.join(socket);
	}
    });
    socket.on('disconnect', function() {
	if (room)
	    room.leave(socket);

	stats.sockets--;
    });

    stats.sockets++;
});
