var fs = require('fs');
var Connect = require('connect');
var io = require('socket.io');

var rooms = require('./rooms');
var util = require('./util');

var ROOM_PREFIX = 'r';
var ROOM_REGEXP = /^\/r(\d{6,24})(.*)/;
var PUBLIC = __dirname + '/public';

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
    } else if (req.method === 'POST' &&
	       (m = path.match(/^\/f(\d+)\/(\d+)$/))) {
        var shareId = m[1];
	var token = m[2];
	var transfer = room.getTransfer(shareId, token);
	if (!transfer) {
	    console.warn({ mismatch: { shareId: shareId, token: token } });
	    res.writeHead(404, { });
	    res.end();
	} else {
	    transfer.acceptUpload(req, res);
	}
    } else if (req.method === 'HEAD' &&
	       (m = path.match(/^\/f(\d+)$/))) {
	var shareId = m[1];
	var share = room.getShare(shareId);
	if (share) {
	    var filename = share.name.replace(/\"/g, '');
	    res.writeHead(200, { 'Content-Type': 'application/octet-stream',
				 'Content-Disposition': 'attachment; filename="' + filename + '"',
				 'Content-Length': share.size });
	} else
	    res.writeHead(404, { });
	res.end();
    } else if (req.method === 'GET' &&
	       (m = path.match(/^\/f(\d+)/))) {
	var shareId = m[1];
	var transfer = room.requestTransfer(shareId, req, res);
	if (!transfer) {
	    res.writeHead(404, { });
	    res.end();
	}
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
		}

		fs.readFile(filename, onRead);
	    });
	};
    }
};

var server = Connect.createServer(
    Connect.logger(),
    MiddleWare.on('GET', '/', MiddleWare.redirectRandom),
    Connect.gzip(),
    Connect.staticProvider(PUBLIC),
    roomMiddleware,
    Connect.errorHandler({ dumpExceptions: true, showStack: true })
);
server.listen(parseInt(process.env.PORT, 10) || 8000);

var socketServer = io.listen(server);
socketServer.on('connection', function(socket) {
    var room;
    // hook socket's message & disconnect

    socket.on('message', function(data) {
	console.log(data.toString());
	var json;
	try {
	    json = JSON.parse(data);
	} catch (x) {
	    console.error(x.stack);
	    return;
	}

	if (room) {
	    room.receive(socket, json);
	} else if (json && typeof(json.join) == 'string') {
	    var m = json.join.match(ROOM_REGEXP);
	    if (m[1] && !m[2]) {
		room = rooms.get(m[1]);
		room.join(socket);
	    }
	}
    });
    socket.on('disconnect', function() {
	if (room)
	    room.leave(socket);
    });
});
