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

    var div = $('<li class="box share"><p><a class="name file" href="#" type="application/octet-stream"></a></p><p class="control"><span class="size"></span> <a href="#" class="remove" title="Remove">✖</a></p></li>');
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
	    up.chunkReading(offset1, length);
	    var blob = slice.call(that.file, offset1, offset1 + length);
	    that.uploadChunk(token1, blob, 0, up, function(token2) {
		if (token2 && length > 0) {
		    sendChunk(token2, offset1 + length);
		} else {
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
	    sendAsBinary.call(xhr, data);
	} else {
	    xhr.setRequestHeader('Content-Type', 'application/base64');
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
    var div = $('<div class="upload"><progress value="0" max="100"></progress><p class="progress"></p></div>');
    this.div = div;
    parent.append(div);

    this.chunkProgress = 0;
    this.chunkLength = 512 * 1024;
    this.offset = 0;
    this.total = total;
    this.draw();
}

UploadProgress.prototype.draw = function() {
    var progressEl = this.div.find('progress');
    var value = 100 * (this.offset + (this.chunkProgress * this.chunkLength)) / this.total;
    progressEl.prop('value', value);

    var progressLabel = this.div.find('.progress');
    progressLabel.text(Math.ceil(value) + "%");
};

UploadProgress.prototype.chunkReading = function(offset, length) {
    this.chunkProgress = 0;
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
    var div = this.div;
    div.fadeOut(1000, function() {
	div.remove();
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
	var host = (loc.host === "noattach.no.de") ?
	    "noatta.ch" : loc.host;
	var roomlink = loc.protocol + "//" + host + loc.pathname;
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
    $('#loading').html("<img src='/throbber.gif'>");
    $('#dashboard').hide();
    connect();

    /* New file */
    $('#file').bind('change', fileChosen);
});

