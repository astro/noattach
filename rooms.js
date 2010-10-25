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
console.log(this);
console.log({push:this.shares});
    for(var shareId in this.shares)
	if (this.shares.hasOwnProperty(shareId)) {
	    socket.send(JSON.stringify({ share: this.shares[shareId].info }));
	}
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
	    var msg = JSON.stringify({ unshare: { id: shareId } });
	    this.sockets.forEach(function(socket1) {
		socket1.send(msg);
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

Room.prototype.receive = function(socket, json) {
    if (json.share &&
	json.share.name &&
	json.share.size) {
	// share
	var info = json.share;
	var id, len = 4;
	do {
	    id = util.generateToken(len);
	    len++;
	} while(this.shares.hasOwnProperty(id));
	info.id = id;
	info.by = socket.connection.remoteAddress;

	// Add info
	this.shares[id] = {
	    socket: socket,
	    info: info
	};

	// Broadcast
	var msg = JSON.stringify({ share: info });
//console.log({msg:msg});
	this.sockets.forEach(function(peerSocket) {
//console.log([peerSocket.sessionId,socket.sessionId,peerSocket !== socket]);
	    if (peerSocket !== socket)
		peerSocket.send(msg);
	});

	// Confirm
	socket.send(JSON.stringify({ shared: info }));
    } else if (json.unshare && json.unshare.id) {
	// unshare
	var shareId = json.unshare.id;
	if (this.shares.hasOwnProperty(shareId) &&
	    // Security: only allow to remove owned shares
	    this.shares[shareId].socket === socket) {

	    // remove
	    delete this.shares[shareId];
	    // broadcast
	    this.sockets.forEach(function(socket1) {
		socket1.send(JSON.stringify({ unshare: { id: shareId } }));
	    });
	}
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
    var msg = { transfer: { id: shareId,
			    token: token,
			    offset: offset,
			    by: by } };
console.log(msg);
    share.socket.send(JSON.stringify(msg));
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
