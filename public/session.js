var send;
var shares = {};


function humanSize(size) {
    var units = ['T', 'G', 'M', 'K'];
    var unit = '';
    while(size >= 1024 && units.length > 0) {
	size /= 1024;
	unit = units.pop();
    }
    return (Math.round(size * 10) / 10) + ' ' +
	unit + 'B';
}

function Share(file, shareInfo) {
    var that = this;

    this.id = shareInfo.id;
    this.file = file;
    this.name = shareInfo.name;

    var div = $('<div class="box share"><p><a class="name file" href="#" type="application/octet-stream" target="_blank"></a></p><p class="control"><span class="size"></span> <a href="#" class="remove" title="Remove">✖</a></p></div>');
    div.find('.name').text(shareInfo.name);
    div.find('.name').attr('href', document.location.pathname + '/f' + this.id +
			           '/' + encodeURIComponent(shareInfo.name));
    div.find('.size').text(humanSize(shareInfo.size));
    div.find('a.remove').click(function(ev) {
	ev.preventDefault();
	that.remove();
    });
    div.hide();
    $('#shares').append(div);
    div.slideDown(500);
    this.div = div;
}

Share.prototype.remove = function(keepFileCache) {
    var div = this.div;
    div.slideUp(250, function() {
	div.remove();
    });

    send('unshare', this.id);
    delete shares[this.id];
    if (!keepFileCache)
	delete fileCache[this.name];
};

var CHUNK_LENGTH = 512 * 1024;

Share.prototype.upload = function(token, offset, by) {
    var that = this;

    var up = new UploadProgress(this.div, offset, this.file.size, by);

    var slice = this.file.slice || this.file.webkitSlice || this.file.mozSlice;
    if (slice) {
	var sendChunk = function(token1, offset1) {
	    var length = Math.min(that.file.size - offset1, CHUNK_LENGTH);
	    console.log("sendChunk", {fileSize:that.file.size,offset1:offset1,CL:CHUNK_LENGTH,length:length})
	    up.chunkReading(offset1, length);
	    var blob = slice.call(that.file, offset1, offset1 + length);
	    that.uploadChunk(token1, blob, 0, up, function(token2) {
		if (token2 && length > 0) {
		    console.log("next token", token2);
		    sendChunk(token2, offset1 + length);
		} else {
		    console.log("no next token");
		    up.end();
		}
	    });
	};
	sendChunk(token, offset);
    } else {
	up.chunkReading(offset, that.file.size);
	that.uploadChunk(token, that.file, offset, up, function() {
	    up.end();
	});
    }
};

Share.prototype.uploadChunk = function(token, blob, blobOffset, up, cb) {
    var that = this;
    var shut = function() { cb(); };  // w/o arguments

    var reader = new FileReader();
    reader.onload = function() {
	// if the Blob had no slice interface we need to slice the
	// result string manually:
	var data = (blobOffset > 0) ?
	    reader.result.slice(blobOffset) :
	    reader.result;

	var xhr = new XMLHttpRequest();
	xhr.onreadystatechange = function() {
	    if (xhr.readyState === 4)  // DONE
		cb(xhr.status === 200 ? xhr.responseText : null);
	};
	xhr.onabort = shut;
	xhr.ontimeout = shut;
	xhr.onerror = shut;
	up.trackXHR(xhr);
	xhr.open("POST",
		 document.location.pathname + '/f' + that.id + '/' + token);
	var sendAsBinary = xhr.sendAsBinary || xhr.webkitSendAsBinary || xhr.mozSendAsBinary;
	if (sendAsBinary) {
	    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
	    console.log('sending '+data.length);
	    sendAsBinary.call(xhr, data);
	} else {
	    xhr.setRequestHeader('Content-Type', 'application/base64');
	    console.log('sending64 '+data.length);
	    xhr.send(window.btoa(data));
	}
    };
    reader.onabort = shut;
    reader.onerror = shut;

    // give some time to render UploadProgress
    //window.setTimeout(function() {
	reader.readAsBinaryString(blob);
    //}, 10);
};

function UploadProgress(parent, offset, total, by) {
    var p = $('<p class="upload"><canvas width="160" height="16"></canvas> <span class="by"></span></p>');
    this.p = p;
    parent.append(p);

    if (by)
	p.find('.by').text(by);

    this.chunkProgress = -1;
    this.offset = 0;
    this.total = total;
    this.draw();
}

UploadProgress.prototype.draw = function() {
    if (!this.canvas)
	this.canvas = this.p.find('canvas')[0];
    var ctx = this.canvas.getContext('2d');
    var w = this.canvas.width, h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1;
    var line = function(x1, y1, x2, y2) {
	ctx.moveTo(x1, y1);
	ctx.lineTo(x2, y2);
	ctx.stroke();
    };

    /*line(0, 1, 0, h - 2);  // left
    line(1, 0, w - 2, 0);  // top
    line(1, h - 1, w - 2, h - 1);  // bottom
    line(w - 1, 1, w - 1, h - 2);  // right*/

    var bar = function(x1, x2, alpha, style) {
	ctx.globalAlpha = alpha;
	ctx.fillStyle = style;
	ctx.fillRect(Math.floor(x1 * (w - 2) + 1), 1,
		     Math.floor((x2 - x1) * (w - 2)), h - 2);
    };

    // previous chunks
    if (this.offset > 0)
	bar(0, this.offset / this.total, 1.0, '#AA0000');
    // current chunk shade
    bar(this.offset / this.total, (this.offset + this.chunkLength) / this.total, 0.2, '#800000');
    // current chunk progress
    if (this.chunkProgress >= 0) {
	bar(this.offset / this.total, (this.offset + (this.chunkProgress * this.chunkLength)) / this.total, 1.0, '#AA0000');
    }
};

UploadProgress.prototype.chunkReading = function(offset, length) {
    this.chunkProgress = -1;
    this.offset = offset;
    this.chunkLength = length;
    this.draw();
};

UploadProgress.prototype.trackXHR = function(xhr, by) {
    var that = this;

    if (!xhr.upload) {
	this.end();
	return;
    }

    xhr.upload.onloadstart = function() {
	that.chunkProgress = 0;
	that.draw();
    };
    xhr.upload.onprogress = function(ev) {
	that.chunkProgress = ev.loaded / ev.total;
	that.draw();
    };
};

UploadProgress.prototype.end = function() {
    var p = this.p;
    p.fadeOut(1000, function() {
	p.remove();
    });
    this.draw();
};

function RemoteShare(shareInfo) {
    var li = $('<li><p><a class="file name" href="#" type="application/octet-stream" target="_blank"></a></p> <p class="control"><span class="meta"><span class="size"></span></span></p></li>');
    var a = li.find('a');
    a.text(shareInfo.name);
    a.attr('href', document.location.pathname + '/f' + shareInfo.id +
	           '/' + encodeURIComponent(shareInfo.name));
    var size = li.find('.size');
    size.text(humanSize(shareInfo.size));
    if (shareInfo.by) {
	var by = $('<span class="by"></span>');
	by.text(shareInfo.by);
	li.find('.meta').append(' by ').append(by);
    }

    li.hide();
    $('#remote').append(li);
    li.slideDown(500);

    this.li = li;
    this.id = shareInfo.id;
}

RemoteShare.prototype.remove = function() {
    var li = this.li;
    li.slideUp(500, function() {
	li.remove();
    });
    delete shares[this.id];
};

var fileCache = {};

function fileChosen(ev) {
    var files = $('#file')[0].files;
    for(var i = 0; i < files.length; i++) {
	var file = files.item(i);
	fileCache[file.name] = file;

	send('share',
	     { name: file.name,
	       size: file.size,
	       type: file.type
	     });
    }
    $('#file')[0].value = null;
};

// after reconnect:
function restoreFiles() {
    var delay = 0;
    for(var name in fileCache)
	if (fileCache.hasOwnProperty(name)) {
	    var file = fileCache[name];
	    send('share',
		 { name: file.name,
		   size: file.size,
		   type: file.type
		 });
	}
}


function checkCompatibility() {
    var features = ["window.XMLHttpRequest",
		    "(new XMLHttpRequest()).upload",
		    "window.FileReader",
		    "window.btoa"];
    var missing = [];

    for(var i = 0; i < features.length; i++) {
	var feature = features[i];
	var present = false;
	try {
	    present = (eval(feature) !== undefined);
	} catch (x) {
	}
	if (!present)
	    missing.push(feature);
    }

    if (missing.length === 0) {
	return true;
    } else {
	return false;
    }
}

var connecting = false;

function connect() {
    if (connecting)
	return;
    connecting = true;

    var socket = io.connect("/noattach");

    socket.on('connect', function(){
	send = socket.emit.bind(socket);
	var loc = document.location;
	socket.emit('join', loc.pathname);
	$('#loading').hide();
	var roomlink = loc.protocol + "//" + loc.host + loc.pathname;
	$('#roomlink').text(roomlink).attr({ href: roomlink });
	$('#dashboard').show();

	if (checkCompatibility() === false) {
	    $('.left').find('h2').text('Sorry');
	    $('.left').find('.box').last().remove();
	    $('.left').append('<div class="box"><p class="note">Sorry, your browser lacks some important features to share files. We recommend upgrading to <a href="http://www.getfirefox.com/">Firefox</a> 3.6 or 4.0 &amp; <a href="http://www.google.com/chrome">Chromium</a> 6 or 7.</p></div>');
	}

	$('#remote').find('li').remove();
	$('.left').find('.share').remove();
	restoreFiles();
    });
    socket.on('shared', function(info){
	if (info && info.id !== null) {
	    // Own share confirmed
	    if (fileCache[info.name]) {
		shares[info.id] = new Share(fileCache[info.name], info);
	    } else {
		socket.emit('unshare', info.id);
	    }
	}
    });
    socket.on('share', function(info) {
	if (info && info.id) {
	    // New remote share
	    shares[info.id] = new RemoteShare(info);
	}
    });
    socket.on('transfer', function(req) {
	if (req &&
	    shares.hasOwnProperty(req.id) &&
	    req.token) {

	    // TODO: implement long path for error case
	    shares[req.id].upload(req.token, req.offset, req.by);
	}
    });
    socket.on('unshare', function(shareId) {
	if (shareId &&
	    shares.hasOwnProperty(shareId)) {
	    // already removes itself from shares & the DOM
	    shares[shareId].remove();
	}
    });

    socket.on('disconnect', function() {
	for(var id in shares)
	    if (shares.hasOwnProperty(id))
		shares[id].remove(true);
	$('#dashboard').hide();
	$('#loading').show();

	connecting = false;
    });
}

$(document).ready(function() {
    $('#loading').text("Plumbing the pipe...");
    $('#dashboard').hide();
    connect();

    /* New file */
    $('#file').bind('change', fileChosen);
});

