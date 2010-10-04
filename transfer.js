var sys = require('sys');
var EventEmitter = require('events').EventEmitter;

function Transfer(shareInfo, req, res) {
    var that = this;
    EventEmitter.call(this);

    this.shareInfo = shareInfo;
    this.downReq = req;
    this.downRes = res;  // HTTP response

    res.writeHead(200, { 'Content-Type': 'binary/octet-stream',
			 'Content-Disposition': 'attachment; filename=' + shareInfo.name,
			 'Content-Length': shareInfo.size });

    req.on('error', function() {
	that.end();
    });

    this.timeout = setTimeout(function() {
	that.end();
    }, 30 * 1000);
}
sys.inherits(Transfer, EventEmitter);
module.exports.Transfer = Transfer;

Transfer.prototype.acceptUpload = function(req, res) {
    var that = this;

    this.emit('invalidate');
    this.upReq = req;
    this.upRes = res;

    var decoder = base64Decoder();
    req.setEncoding('utf-8');  // FIXME

    var buf = '';
    req.on('data', function(data) {
	var written = that.downRes.write(decoder(data), 'binary');
	if (!written) {
	    req.pause();
	    console.log('pause');
	}
    });
    this.downRes.on('drain', function() {
	console.log('drain, resume');
	req.resume();
    });
    req.on('end', function() {
	that.downRes.write(decoder('', true), 'binary');
	that.end();
    });

    res.writeHead(200, { });
};

Transfer.prototype.end = function() {
console.log({transferEnd:this});
    if (this.upRes) {
	this.upRes.end();
    } else
	this.emit('invalidate');

    this.downRes.end();
};


function base64Decoder() {
    var buf = '';  // string to decode
    var _in = 0, _out = 0;
    return function(data, flush) {
	buf += data;
	_in += data.length;

	if (flush) {
	    data = new Buffer(buf, 'base64');
	    console.log('flush '+data.length);
	    buf = '';
	} else {
	    var i = Math.floor(buf.length / 4) * 4;
	    data = new Buffer(buf.slice(0, i), 'base64');
	    buf = buf.slice(i, buf.length);
	}

	_out += data.length;
console.log({'in':_in, out:_out});
	return data;
    };
}
