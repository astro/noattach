var send;

function Share(file, shareInfo) {
    this.id = shareInfo.id;
    this.file = file;

    var div = $('<div class="box"><div class="inner"><p class="size"></p><p class="name"></p></div><p class="righticon"><a class="remove" target="_blank" title="Remove">[rm]</a></p></div>');
    div.find('.name').text(shareInfo.name);
    div.find('.size').text(shareInfo.size);
    $('#shares').append(div);
}

Share.prototype.upload = function(token) {
    var that = this;
    var reader = new FileReader();
    reader.readAsBinaryString(this.file);
    reader.onload = function() {
	console.log('read '+reader.result.length);
	$.ajax({ url: document.location.pathname +
		      '/f' + that.id + '/' + token,
		 type: 'POST',
		 data: window.btoa(reader.result)
	       });
    };
    reader.onabort = function() {
	console.error('abort');
    };
    reader.onerror = function(e) {
	alert(e.message);
    };
    console.log(reader);
};

function RemoteShare(shareInfo) {
    var li = $('<li><a href="#"></a> <span class="meta"><span class="size"></span></span></li>');
    var a = li.find('a');
    a.text(shareInfo.name);
    a.attr('href', document.location.pathname + '/f' + shareInfo.id);
    var size = li.find('.size');
    size.text(shareInfo.size);
    if (shareInfo.by) {
	var by = $('<span class="by"></span>');
	by.text(shareInfo.by);
	li.find('.meta').append(' by ').append(by);
    }

    li.hide();
    li.slideDown(500);
    $('#remote').append(li);
}

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



var shares = {};

$(document).ready(function() {
    var socket = new io.Socket(null, {transports:['websocket', 'htmlfile', 'xhr-multipart', 'xhr-polling']});
    socket.connect();

    send = function(json) {
	socket.send(JSON.stringify(json));
    };

    socket.on('connect', function(){
	send({ join: document.location.pathname });
	$('#dashboard').show();
    });
    socket.on('message', function(data){
console.log(data);
	var json;
	try {
	    json = JSON.parse(data);
	} catch (x) {
	    console.error("Cannot parse: " + message);
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
	    shares[json.transfer.id].upload(json.transfer.token);
	}
    });

    /* New file */
    $('#file').bind('change', fileChosen);
});

