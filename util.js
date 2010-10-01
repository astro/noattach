module.exports.generateToken = function generateToken(length) {
    var token = '';
    for(var i = 0; i < length; i++)
	token += Math.ceil(Math.random() * 10);
    return token;
};
