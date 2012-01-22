var sys = require('sys');
var EventEmitter = require('events').EventEmitter;

function Transfer(shareInfo, room, req, res) {
    var that = this;
    EventEmitter.call(this);

    this.shareInfo = shareInfo;
    this.room = room;
    this.downReq = req;
    this.downRes = res;  // HTTP response

    var code = 200;
    var filename = shareInfo.name.replace(/\"/g, '');
    var headers = { 'Content-Type': 'application/octet-stream',
		    'Content-Disposition': 'attachment; filename="' + filename + '"',
		    'Accept-Ranges': 'bytes' };

    var m;
    if (req.headers.range &&
        (m = req.headers.range.match(/bytes=(\d+)/))) {

	this.offset = parseInt(m[1], 10);

	code = 206;
	headers['Content-Length'] = shareInfo.size - this.offset;
	headers['Content-Range'] = 'bytes ' + this.offset +
	    '-' + (shareInfo.size - 1) +
	    '/' + shareInfo.size;
    } else {
	this.offset = 0;

	code = 200;
	headers['Content-Length'] = shareInfo.size;
    }

    room.requestTransfer(shareInfo.id, this.offset, req.connection.remoteAddress,
			 this.makeTransferCallback());

    req.on('error', function() {
console.log('downReq error');
	that.end();
    });
    res.on('error', function() {
console.log('downRes error');
	that.end();
    });
    res.on('end', function() {
console.log('downRes end');
	that.end();
    });
    req.socket.on('error', function() {
console.log('down sock error');
	that.end();
    });
    res.socket.on('close', function() {
console.log('down sock close');
	that.end();
    });

console.log(headers);
    res.writeHead(code, headers);
}

sys.inherits(Transfer, EventEmitter);
module.exports.Transfer = Transfer;

Transfer.prototype.makeTransferCallback = function() {
    var that = this;
    return function(req, res) {
	if (req && res)
	    that.acceptUpload(req, res);
	else
	    that.end();
    };
};

Transfer.prototype.acceptUpload = function(req, res) {
console.log("acceptUpload",req,res)
    var that = this;

    this.upReq = req;
    this.upRes = res;

    var decoder;
    if (typeof req.headers['content-type'] === 'string' &&
	req.headers['content-type'].indexOf('application/base64') >= 0) {

	req.setEncoding('utf-8');
	decoder = base64Decoder();
    } else {
	decoder = identityDecoder();
	console.log('binary upload!');
    }

    var buf = '';
    req.on('data', function(data) {
console.log('req data', data.length)
	var outData = decoder(data);
	var flushed = that.downRes.write(outData, 'binary');
	that.offset += outData.length;
	if (!flushed) {
	    req.pause();
	    //console.log('pause');
	}
    });
    this.downRes.on('drain', function() {
	//console.log('drain, resume');
	req.resume();
    });
    req.on('end', function() {
console.log('req end')
	var outData = decoder('', true);
	that.downRes.write(outData, 'binary');
	that.offset += outData.length;

	if (that.offset < that.shareInfo.size) {
	    // next chunk
	    var token = that.room.addTransfer(that.shareInfo.id, that.makeTransferCallback());
	    res.end(token);
	} else {
	    // upload done
	    that.end();
	}
    });

    res.writeHead(200, { });
};

Transfer.prototype.end = function() {
console.log('transfer end');
    if (this.upRes) {
	console.log('end upRes');
	this.upRes.end();
	if (this.upReq.socket)
	    this.upReq.socket.destroy();
    }

    this.downRes.end();
};


function identityDecoder() {
    return function(data) {
	return data;
    };
}

function base64Decoder() {
    var buf = '';  // string to decode
    var _in = 0, _out = 0;
    return function(data, flush) {
	buf += data;
	_in += data.length;

	if (flush) {
	    console.log("unbase64",data);
	    data = new Buffer(buf, 'base64');
	    console.log('flush '+data.length);
	    buf = '';
	} else {
	    var i = Math.floor(buf.length / 4) * 4;
	    data = new Buffer(buf.slice(0, i), 'base64');
	    buf = buf.slice(i, buf.length);
	}

	_out += data.length;
	return data;
    };
}
