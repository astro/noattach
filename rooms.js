var util = require('./util');


function Room(id) {
    this.id = id;
    this.shares = {};
    this.sockets = [];
    this.transferCbs = {};  // pending transferCbs by token
}

Room.prototype.join = function(socket) {
    this.sockets.push(socket);

    // push shares
    for(var shareId in this.shares)
	if (this.shares.hasOwnProperty(shareId)) {
	    socket.emit('share', this.shares[shareId].info);
	}

    // set up receive hooks
    var that = this;
    socket.on('share', function(info) {
	that.onShare(socket, info);
    });
    socket.on('unshare', function(id) {
	that.onUnshare(socket, id);
    });
};

Room.prototype.leave = function(socket) {
    var i;
    // remove socket
    while((i = this.sockets.indexOf(socket)) >= 0)
	this.sockets.splice(i, 1);

    // remove affected shares
    for(var shareId in this.shares)
	if (this.shares[shareId].socket === socket) {
	    // remove
	    delete this.shares[shareId];

	    // broadcast
	    this.sockets.forEach(function(socket1) {
		socket1.emit('unshare', shareId);
	    });
	}

    /* This was perhaps no normal HTTP request but a socket.io
     * disconnect. Therefore we explicitly offer to remove this
     * room
     */
    rooms.tidy(this.id);
};

Room.prototype.isEmpty = function() {
    return this.sockets.length < 1;
};

Room.prototype.onShare = function(socket, info) {
    if (info &&
	info.name &&
	info.size) {

	console.log("share", info);

	var id, len = 4;
	do {
	    id = util.generateToken(len);
	    len++;
	} while(this.shares.hasOwnProperty(id));
	info.id = id;
	//info.by = socket.handshake.address.address;

	// Add info
	this.shares[id] = {
	    socket: socket,
	    info: info
	};

	// Broadcast
	this.sockets.forEach(function(socket1) {
	    if (socket1 !== socket)
		socket1.emit('share', info);
	});

	// Confirm
	socket.emit('shared', info);
    }
};

Room.prototype.onUnshare = function(socket, shareId) {
    if (shareId &&
	this.shares.hasOwnProperty(shareId) &&
	// Security: only allow to remove owned shares
	this.shares[shareId].socket === socket) {

	console.log("unshare", shareId);

	delete this.shares[shareId];
	// broadcast
	this.sockets.forEach(function(socket1) {
	    socket1.emit('unshare', shareId);
	});
    }
};

Room.prototype.makeTransferToken = function() {
    var token = '';
    do {
	token = util.generateToken(32);
    } while(this.transferCbs.hasOwnProperty(token));
    return token;
};

Room.prototype.getTransferCallback = function(shareId /* unused */, token) {
    if (this.transferCbs.hasOwnProperty(token)) {

	var cb = this.transferCbs[token];
	delete this.transferCbs[token];
	return cb;
    } else
	return null;
};

/* invokes cb() for timeout */
Room.prototype.requestTransfer = function(shareId, offset, by, cb) {
    if (!this.shares.hasOwnProperty(shareId)) {
	console.warn('Transfer for unknown shareId');
	return;
    }

    // Parameters
    var share = this.shares[shareId];
    var token = this.addTransfer(shareId, cb);

    // Send request
    share.socket.emit('transfer',
		      { id: shareId,
			token: token,
			offset: offset });
};

/* later, instead of the socket.io connection, the ajax response is
 * used for the token, in order to maintain the upload context in the
 * advent of multiple chunks.
 *
 * returns: token
 */
Room.prototype.addTransfer = function(shareId, cb) {
    var that = this;
    var token = this.makeTransferToken();

    this.transferCbs[token] = cb;
    setTimeout(function() {
	var cb = that.getTransferCallback(shareId, token);
	if (cb)
	    cb();
    }, 30 * 1000);

    return token;
};


/**
 * returns null or shareInfo
 */
Room.prototype.getShare = function(shareId) {
    return this.shares.hasOwnProperty(shareId) ? this.shares[shareId].info : null;
};

var rooms = {
    has: function(roomId) {
	return rooms.hasOwnProperty(roomId);
    },
    get: function(roomId) {
	if (!rooms.hasOwnProperty(roomId))
	    // Create on demand
	    rooms[roomId] = new Room(roomId);

	return rooms[roomId];
    },

    tidy: function(roomId) {
	if (rooms.hasOwnProperty(roomId) &&
	    rooms[roomId].isEmpty()) {
	    // Destroy on non-demand
	    console.log({destroy:rooms[roomId]});
	    delete rooms[roomId];
	}
    }
};
module.exports = rooms;
