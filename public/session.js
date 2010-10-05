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

    var div = $('<div class="box share"><p><a class="name file"></a></p><p class="control"><span class="size"></span> <a href="#" class="remove" title="Remove">×</a></p></div>');
    div.find('.name').text(shareInfo.name);
    div.find('.name').attr('href', document.location.pathname + '/f' + this.id);
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

Share.prototype.remove = function() {
    var div = this.div;
    div.slideUp(250, function() {
	div.remove();
    });

    send({ unshare: { id: this.id } });
    delete shares[this.id];
    delete fileCache[this.name];
};

Share.prototype.upload = function(token, by) {
    var that = this;

    var up = new UploadProgress(this.div, by);
    var shut = function() {
	up.end();
    };
    var reader = new FileReader();
    reader.onload = function() {
	var xhr = new XMLHttpRequest();
	xhr.onreadystatechange = function() {
	    if (xhr.readyState === 4)  // DONE
		shut();
	};
	xhr.onabort = shut;
	xhr.ontimeout = shut;
	xhr.onerror = shut;
	up.trackXHR(xhr);
	xhr.open("POST",
		 document.location.pathname + '/f' + that.id + '/' + token);
	if (xhr.sendAsBinary) {
	    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
	    xhr.sendAsBinary(reader.result);
	} else {
	    xhr.setRequestHeader('Content-Type', 'application/base64');
	    xhr.send(window.btoa(reader.result));
	}
    };
    reader.onabort = shut;
    reader.onerror = shut;

    // give some time to render UploadProgress
    window.setTimeout(function() {
	reader.readAsBinaryString(that.file);
    }, 10);
};

function UploadProgress(parent, by) {
    var p = $('<p class="upload"><canvas width="160" height="16"></canvas> <span class="by"></span></p>');
    this.p = p;
    parent.append(p);

    if (by)
	p.find('.by').text(by);

    this.progress = -1;
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

    if (this.progress < 0) {
	ctx.globalAlpha = 0.2;
	ctx.fillStyle = '#800000';
	ctx.fillRect(1, 1, w - 2, h - 2);
    } else {
	ctx.globalAlpha = 0.8;
	ctx.fillStyle = '#AA0000';
	ctx.fillRect(1, 1, this.progress * (w - 2), h - 2);
    }
};

UploadProgress.prototype.trackXHR = function(xhr, by) {
    var that = this;

    if (!xhr.upload) {
	this.end();
	return;
    }

    xhr.upload.onloadstart = function() {
	that.progress = 0;
	that.draw();
    };
    xhr.upload.onprogress = function(ev) {
	that.progress = ev.loaded / ev.total;
	that.draw();
    };
    xhr.upload.onloadend = function() {
	that.progress = 1;
	that.end();
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
    var li = $('<li><a class="file" href="#" target="_blank"></a> <span class="meta"><span class="size"></span></span></li>');
    var a = li.find('a');
    a.text(shareInfo.name);
    a.attr('href', document.location.pathname + '/f' + shareInfo.id);
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

	send({ share: { name: file.name,
			size: file.size,
			type: file.type } });
    }
    $('#file')[0].value = null;
};

// after reconnect:
function restoreFiles() {
    var delay = 0;
    for(var name in fileCache)
	if (fileCache.hasOwnProperty(name))
	    // call immediately, just to have scope for file
	    // independent of name
	    (function(file) {
		 delay += Math.floor(100 + Math.random() * 1000);
		 window.setTimeout(function() {
		     send({ share: { name: file.name,
				     size: file.size,
				     type: file.type } });
		 }, delay);
	     })(fileCache[name]);
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

var socket = null;

function connect() {
    if (socket !== null)
	return;

    window.WEB_SOCKET_SWF_LOCATION = '/WebSocketMain.swf';
    socket = new io.Socket(null,
			   { transports: ['websocket', 'htmlfile',
			                  'xhr-multipart', 'xhr-polling']
			   });
    var currentSocket = socket;
    var connectTimeout = window.setTimeout(function() {
	socket.disconnect();
	reconnect();
    }, 10000);
    socket.connect();

    send = function(json) {
	socket.send(JSON.stringify(json));
    };

    socket.on('connect', function(){
	send({ join: document.location.pathname });
	window.clearTimeout(connectTimeout);
	$('#loading').hide();
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
    socket.on('message', function(data){
	var json;
	try {
	    json = JSON.parse(data);
	} catch (x) {
	    return;
	}

	if (json.shared && json.shared.id !== null) {
	    // Own share confirmed
	    if (fileCache[json.shared.name]) {
		shares[json.shared.id] = new Share(fileCache[json.shared.name], json.shared);
	    } else {
		send({ unshare: { id: json.shared.id } });
	    }
	}
	if (json.share && json.share.id) {
	    // New remote share
	    shares[json.share.id] = new RemoteShare(json.share);
	}
	if (json.transfer) {
	    // TODO: implement long path for error case
	    shares[json.transfer.id].upload(json.transfer.token, json.transfer.by);
	}
	if (json.unshare &&
	    json.unshare.id &&
	    shares.hasOwnProperty(json.unshare.id)) {
	    // already removes itself from shares & the DOM
	    shares[json.unshare.id].remove();
	}
    });

    var reconnect = function() {
	$('#dashboard').hide();
	$('#loading').show();

	if (socket === currentSocket)
	    socket = null;
	window.setTimeout(connect, Math.ceil((0.5 + 3 * Math.random()) * 1000));
    };
    socket.on('disconnect', reconnect);
}

$(document).ready(function() {
    connect();

    /* New file */
    $('#file').bind('change', fileChosen);
});

