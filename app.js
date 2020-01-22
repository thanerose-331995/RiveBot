const express = require('express');
const RiveScript = require('rivescript');
const path = require('path');
const mysql = require('mysql');
var text2png = require('text2png');
var fs = require('fs');
var http = require("https");

global.appRoot = path.resolve(__dirname); //for referencing files later, global so it can be ref in other files if need

const app = express();
const port = 3030;
var botReply = "No Reply Set";

//-------------------
//DATABASE CONNECTION
//-------------------

var con = mysql.createConnection({
    host: "localhost",
    user: "thanerose",
    password: "SubzeroRT19",
    database: "riveappDB",
    port: 8000
});

function signUp(values, callback) {
    dbConnect("*", values, function (res) {
        callback(res);
    })
}

function checkUser(values, callback) {
    var doesExist = false;
    var errcode = "";

    dbConnect("£", ["username", values[0]], function (res) {
        doesExist = !isEmpty(res);
        errcode = "username already in use";
        if (!doesExist) {
            dbConnect("£", ["email", values[2]], function (res) {
                doesExist = !isEmpty(res);
                errcode = "email already in use"
                if (!doesExist) {
                    errcode = "none";
                }
                callback(doesExist, errcode);
            })
        } else {
            callback(doesExist, errcode);
        }
    });
}

function login(values, callback) {
    dbConnect("&", values, function (res) {
        if (!isEmpty(res)) {
            //user exists
            callback(res[0]['id']);
        }
        else {
            callback(0);
        }
    })
}

function addPost(values, callback) {
    dbConnect("$", values, function (res) {
        callback(res['insertId'])
        // createImage(values, res['insertId'], function (filepath) {
        //     callback(filepath);
        // });
    })
}

function getPoem(values, callback) {
    dbConnect("%", values, function (res) {
        callback(res);
    })
}

function dbConnect(action, val, callback) {

    var queryString = "";

    switch (action) {
        case "*":
            //new user
            queryString = "INSERT INTO users (username, password, email) VALUES (" + mysql.escape(val[0]) + ", " + mysql.escape(val[1]) + ", " + mysql.escape(val[2]) + ")";
            break;
        case "£":
            //check if user exists
            queryString = "SELECT id FROM users WHERE " + val[0] + " = " + mysql.escape(val[1]);
            break;
        case "&":
            //login user
            queryString = "SELECT id FROM users WHERE username = " + mysql.escape(val[0]) + " and password = " + mysql.escape(val[1]);
            break;
        case "$":
            //new post
            queryString = "INSERT INTO posts (content, dT, user_id) VALUES (" + mysql.escape(val[0]) + ", " + mysql.escape(val[1]) + ", " + mysql.escape(val[2]) + ")";
            break;
        case "%":
            //get posts
            queryString = "SELECT * FROM posts WHERE user_id = " + val;
            console.log(queryString);
            break;
        default:
            return "NO ACTION";
    }

    con.connect(function (err) {
        if (err) {
        };
        console.log("Query Sent: " + queryString);

        con.query(queryString, function (err, res) {
            if (err) {
                console.log(err);
                throw err
            };
            callback(res);
        });
    });
}

//---------------
//SERVER COMMANDS 
//---------------

app.use(express.json());

app.get('/', function (req, res) {
    res.set('Content-Type', 'text/html');
    //send the html
    res.sendFile(appRoot + "\\index.html");
    //send the javascript and css files
    app.use(express.static('style'));
    app.use(express.static('javascript'));
    app.use(express.static('images'));
});

app.post('/', function (req, res) {

    var data = req.body;
    var action = data.type;
    var err = "";

    switch (action) {
        //----------
        //POEM ENTRY
        //----------
        case "POEM":
            addPost([data.message, data.timeID, data.userID], function (r) {
                res.send({
                    r: r,
                    e: err
                });
            });
            break;
        //---------
        //GET POEMS
        //---------
        case "GET-POEM":
            getPoem(data.userID, function (r) {
                res.send({
                    r: r,
                    e: err
                })
            })
            break;
        //------------
        //CHAT MESSAGE
        //------------
        case "CHAT":
            //send to bot
            reply(data.value, function () {
                //return reply
                res.send(botReply);
            });
            break;
        //------------
        //LOGIN SUBMIT
        //------------
        case "LOGIN":
            var loggedIn = false;
            var loginInfo = [data.username, data.password, data.email];
            if (data.email == "NO") {
                //login
                login([loginInfo[0], loginInfo[1]], function (result) {
                    if (result > 0) {
                        userID = result;
                        loggedIn = true;
                    } else {
                        err = "err: user does not exist";
                    }
                    res.send({
                        r: loggedIn,
                        e: err,
                        id: result
                    });
                })
            } else {
                //signup
                var exists;
                var r = false;
                //check for user
                checkUser(loginInfo, function (result, errcode) {
                    exists = result;
                    if (!exists) {
                        //if user does not exist, insert
                        signUp(loginInfo, function (resu) {
                            r = true;
                            res.send({
                                r: r,
                                e: err,
                                id: resu.insertId
                            });
                        })
                    }
                    else {
                        err = "err: user already exists // " + errcode;
                        res.send({
                            r: r,
                            e: err,
                            id: 0
                        });
                    }
                });
            }
            break;
        //---------
        //GET WORDS
        //---------
        case "WORDS":
            getWords(function (words) {
                console.log(words);
                res.send(words)
            });
            break;
        case "PROMPTS":
            getPromps(function (prompts) {
                res.send(prompts)
            })
            break;
        default:
            err = "ERR: INVALID TYPE"
            res.send(err);
            break;
    }
});

//server settup with express
app.listen(port, () => console.log(`Example app listening on port ${port}`));

//--------------
//BOT CONNECTION
//--------------

//initialise bot and its brains
const bot = new RiveScript();
const brains = [
    appRoot + '\\rive\\begin.rive',
    appRoot + '\\rive\\brain.rive'
];

//load the brains and then check shes ready
bot.loadFile(brains).then(botReady);

function botReady() {
    bot.sortReplies();
    console.log('RiveBot Loaded');
};


//take the message and send back a reply
function reply(message, callback) {
    message = message.toLowerCase();
    var res = message.split(" ");
    var word;

    if (res.includes("hyponyms")) {
        word = res[(res.indexOf("hyponyms")) + 2];
        botReply = "Finding hyponyms of " + word;
        callback();
    }
    else if (res.includes("synonyms")) {
        word = res[(res.indexOf("synonyms")) + 2];
        getSynonyms(word, function (res) {
            botReply = formatReply(word, "synonyms", res);
            callback();
        });
    }
    else if (res.includes("definitions")) {
        word = res[(res.indexOf("definitions")) + 2];
        getDefinitions(word, function (res) {
            botReply = formatReply(word, "definitions", res);
            callback();
        })
    } else {
        bot.reply("local user", message).then(function (reply) {
            //regiser name
            if (reply.includes("$")) {
                var name = getWordAfter(reply, "$");
                username = name;
                reply = reply.replace('$', '');
            }
            botReply = reply;
            callback();
        });
    }
}

function formatReply(word, type, words) {
    var reply = type + ":" + word;
    var temp = ":";
    words.forEach(x => {
        if (type == "synonyms") {
            if (x.length < 8) {
                temp = temp + x + ",";
            }
        } else {
            temp = temp + x + ",";
        }
    })
    reply = reply + temp;
    return reply;
}
//----------
//TEXT 2 PNG
//----------

function createImage(data, poemID, callback) {
    poem = data[0] + ".";
    id = data[2];
    var dir = "images/" + id + "/";

    //if user folder doesnt exist create one
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
    fs.readdir(dir, (err, files) => {

        var filepath = dir + poemID + ".png";

        fs.writeFileSync(filepath, text2png(poem, {
            font: '50px Georgia',
            color: 'black',
            backgroundColor: 'linen',
            lineSpacing: 10,
            padding: 150
        }));
        callback(id + "/" + poemID + ".png");
    })

}

//--------
//WORD GET
//--------
// getWords(function(res){
//     console.log(res);
// });

function getWords(callback) {
    randomWord(function (res) {
        callback(res);
    })
}

function randomWord(callback) {
    var options = {
        "method": "GET",
        "hostname": "wordsapiv1.p.rapidapi.com",
        "port": null,
        "path": "/words/?random=true",
        "headers": {
            "x-rapidapi-host": "wordsapiv1.p.rapidapi.com",
            "x-rapidapi-key": "10c886961bmshd848ef01f58d339p114436jsn917f1b7e8458"
        }
    };

    var req = http.request(options, function (res) {
        var chunks = [];

        res.on("data", function (chunk) {
            chunks.push(chunk);
        });

        res.on("end", function () {
            var body = Buffer.concat(chunks);
            body = JSON.parse(body);
            var word = body['word'];

            //if the word doesnt have a space
            if (!(word.includes(" "))) {
                console.log("checking: " + word);

                //OH GOD ITS CALLBACK HELL WHY THE FUCK DID I DO THIS
                getHypernym(word, function (res) {
                    //is the res not 0
                    if (res.length != 0) {
                        //pick a random one and find the word pool
                        var rand = Math.floor(Math.random() * res.length);
                        getPool(res[rand], function (res) {
                            //are there more than 6 words in the pool
                            if (res.length >= 6) {
                                //cool then sort them and send them back
                                sortWords(res, function (words) {
                                    callback(words);
                                });

                                //IF NOT, START AGAIN
                            } else {
                                randomWord(function (res) {
                                    callback(res);
                                });
                            };
                        });
                    }
                    else {
                        randomWord(function (res) {
                            callback(res);
                        });
                    };
                });
            }
            else {
                randomWord(function (res) {
                    callback(res);
                });
            }
        });
    });

    req.end();
}

function getHypernym(word, callback) {
    var options = {
        "method": "GET",
        "hostname": "wordsapiv1.p.rapidapi.com",
        "port": null,
        "path": "/words/" + word,
        "headers": {
            "x-rapidapi-host": "wordsapiv1.p.rapidapi.com",
            "x-rapidapi-key": "10c886961bmshd848ef01f58d339p114436jsn917f1b7e8458"
        }
    };

    var req = http.request(options, function (res) {
        var chunks = [];

        res.on("data", function (chunk) {
            chunks.push(chunk);
        });

        res.on("end", function () {
            var body = Buffer.concat(chunks);
            body = body.toString();
            body = (JSON.parse(body))['results'];
            var words = []
            if (!isEmpty(body)) {
                body.forEach(item => {
                    if (typeof item['typeOf'] == "object") {
                        item['typeOf'].forEach(x => {
                            if (!words.includes(x) && !(x.includes(" "))) {
                                words.push(x);
                            }
                        })
                    }
                    if (typeof item['instanceOf'] == "object") {
                        item['instanceOf'].forEach(x => {
                            if (!words.includes(x) && !(x.includes(" "))) {
                                words.push(x);
                            }
                        })
                    }
                    if (typeof item['derivation'] == "object") {
                        item['derivation'].forEach(x => {
                            if (!words.includes(x) && !(x.includes(" "))) {
                                words.push(x);
                            }
                        })
                    }
                })
                callback(words);
            }
            else {
                callback([]);
            }
        });
    });

    req.end();
}

function getPool(word, callback) {
    var options = {
        "method": "GET",
        "hostname": "wordsapiv1.p.rapidapi.com",
        "port": null,
        "path": "/words/" + word,
        "headers": {
            "x-rapidapi-host": "wordsapiv1.p.rapidapi.com",
            "x-rapidapi-key": "10c886961bmshd848ef01f58d339p114436jsn917f1b7e8458"
        }
    };

    var req = http.request(options, function (res) {
        var chunks = [];

        res.on("data", function (chunk) {
            chunks.push(chunk);
        });

        res.on("end", function () {
            var body = Buffer.concat(chunks);
            body = body.toString();
            body = (JSON.parse(body))['results'];
            var words = []
            if (!isEmpty(body)) {
                body.forEach(item => {
                    if (typeof item['typeOf'] == "object") {
                        item['typeOf'].forEach(x => {
                            if (!words.includes(x) && (x.length < 7) && !(x.includes(" "))) {
                                words.push(x);
                            }
                        })
                    }
                    if (typeof item['hasTypes'] == "object") {
                        var temp = item['hasTypes'];
                        for (var x in temp) {
                            if (!words.includes(temp[x]) && (temp[x].length < 7) && !(x.includes(" "))) {
                                words.push(temp[x])
                            }
                        }
                    }
                })
                callback(words);
            }
            else {
                callback([]);
            }
        });
    });

    req.end();
}

function sortWords(words, callback) {
    var foundWords = [];
    while (foundWords.length != 6) {
        var rand = Math.floor(Math.random() * words.length);
        if (!(foundWords.includes(words[rand]))) {
            foundWords.push(words[rand]);
        }
    }
    callback(foundWords);
}

function getSynonyms(word, callback) {
    var synonyms = [];

    var options = {
        "method": "GET",
        "hostname": "wordsapiv1.p.rapidapi.com",
        "port": null,
        "path": "/words/" + word,
        "headers": {
            "x-rapidapi-host": "wordsapiv1.p.rapidapi.com",
            "x-rapidapi-key": "10c886961bmshd848ef01f58d339p114436jsn917f1b7e8458"
        }
    };

    var req = http.request(options, function (res) {
        var chunks = [];

        res.on("data", function (chunk) {
            chunks.push(chunk);
        });

        res.on("end", function () {
            var body = Buffer.concat(chunks);
            body = body.toString();
            body = (JSON.parse(body))['results'];

            body.forEach(item => {
                if (typeof item['synonyms'] !== 'undefined') {
                    if (!synonyms.includes(item['synonyms'])) {
                        var items = item['synonyms'];
                        items.forEach(x => {
                            synonyms.push(x);
                        })
                    }
                }
            })
            callback(synonyms)
        });
    });

    req.end();
}

function getDefinitions(word, callback) {
    var definitions = [];

    var options = {
        "method": "GET",
        "hostname": "wordsapiv1.p.rapidapi.com",
        "port": null,
        "path": "/words/" + word,
        "headers": {
            "x-rapidapi-host": "wordsapiv1.p.rapidapi.com",
            "x-rapidapi-key": "10c886961bmshd848ef01f58d339p114436jsn917f1b7e8458"
        }
    };

    var req = http.request(options, function (res) {
        var chunks = [];

        res.on("data", function (chunk) {
            chunks.push(chunk);
        });

        res.on("end", function () {
            var body = Buffer.concat(chunks);
            body = body.toString();
            body = (JSON.parse(body))['results'];

            body.forEach(item => {
                var def = item['definition'];
                if (def.length < 100) {
                    definitions.push(def);
                }
            })
            console.log(definitions)
            callback(definitions)
        });
    });

    req.end();
}
//REDDIT


function getPromps(callback) {

    var prompts = [];

    var req = http.request("https://www.reddit.com/r/WritingPrompts/top.json?sort=top", function (res) {
        var chunks = [];

        res.on("data", function (chunk) {
            chunks.push(chunk);
        });

        res.on("end", function () {
            var body = Buffer.concat(chunks);
            body = body.toString()
            body = JSON.parse(body)['data']['children'];

            body.forEach(x => {
                var prompt = x['data']['title'];
                if (prompt.length > 0) {
                    var split = prompt.slice(0, 4);
                    if (split == "[WP]") {
                        var add = prompt.slice(4);
                        prompts.push(add);
                    }
                }
            })
            callback(prompts)
        })
    })

    req.end();
}


//-----------------
//GENERAL FUNCTIONS
//-----------------

//function for returning a word after a char
function getWordAfter(string, point) {
    console.log("String: " + string + ", Point: " + point);
    var index = string.indexOf(point);
    var word = "";
    var stop = false;

    for (var i = 0; i < string.length; i++) {
        if (!stop) {
            if (i > index) {
                if (string[i] == " ") {
                    stop = true;
                }
                else {
                    word += string[i];
                }
            }
        }
    }
    return word;
}

//function for checking if empty
function isEmpty(obj) {
    for (var key in obj) {
        if (obj.hasOwnProperty(key))
            return false;
    }
    return true;
}