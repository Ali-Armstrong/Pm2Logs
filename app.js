"use strict"
var express            = require( 'express' )
    , app              = express()
    , passport         = require( 'passport' )
    , util             = require( 'util' )
    , bodyParser       = require( 'body-parser' )
    , cookieParser     = require( 'cookie-parser' )
    , session          = require( 'express-session' )
    , GoogleStrategy   = require( 'passport-google-oauth2' ).Strategy
    , path             = require('path')
    , logger           = require('morgan')
    , runningEnv       = process.argv[2]
    , config           = require("./config/" + runningEnv + "/config.json")
    , kill             = require('tree-kill')
    , log              = require('tracer').console()
    , clients          = {}
    , sanitizer        = require('sanitizer')
    , sessions         = {};

const { spawn } = require('child_process');


app.set('port', process.env.PORT || config.port);


passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(obj, done) {
    done(null, obj);
});

passport.use(new GoogleStrategy({
        clientID:     config.googleAuth.clientID,
        clientSecret: config.googleAuth.clientSecret,
        callbackURL: config.googleAuth.callbackURL
    },
    function(request, accessToken, refreshToken, profile, done) {
        // asynchronous verification, for effect...
        process.nextTick(function () {
            return done(null, profile);
        });
    }
));

// view engine setupport
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');


app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


app.use( session({
    saveUninitialized: true, // saved new sessions
    resave: true,
    secret: 'Secret_key'
}));

app.use( passport.initialize());
app.use( passport.session());

app.get('/auth/google', passport.authenticate('google', { scope: [
    'https://www.googleapis.com/auth/plus.login',
    'https://www.googleapis.com/auth/plus.profile.emails.read']
}));

app.get( '/auth/google/callback',
    passport.authenticate( 'google', {
        successRedirect: '/home',
        failureRedirect: '/'
    }));


app.get('/',ensureAuthenticated, function(req, res){
    res.render('home', { userEmail:req.user.email});
});

app.get('/home', ensureAuthenticated, function(req, res){
    sessions[req.user.email] = {
        "session": req.session
    };
    res.render('home',{ userEmail:req.user.email});
});

app.get('/logout', function(req, res){
    try{
        delete sessions[req.user.email]
    }catch (err){
        log.error("some error at logout........"+err);
        log.error(JSON.stringify(sessions)+"......."+req.user.email)
    }
    req.logout();
    res.redirect('/');
});

app.all('*', function(req, res) {
    res.redirect("/");
});

function ensureAuthenticated(req, res, next) {
   // console.log(req.headers);
   // console.log("ip...",req.ip)
    if(req.isAuthenticated() && config.AccessEmails.indexOf(req.user.email)>-1) {
        log.info("Login Successful",req.user.email);
        return next();
    }
    else if(req.isAuthenticated()) {
        res.render('index', {message: "You are not a valid User...."});
        log.error("Unauthorized email",req.user.email);
    }
    else
        res.render('index', {message: null})

}

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

var io = require('socket.io').listen(app.listen(app.get('port')));//Telling Express+Socket.io App To Listen To Port

io.sockets.on("connection",function(socket){
    var ls;
    var options;
    var comm;
    var allow_access;

    socket.on('add-user', function(data){
        //console.log('user added')
        clients[data.username] = {
            "socket": socket.id
        };
    });


    socket.on("search",function(data){
        //console.log(clients)
        if (config.AccessEmails.indexOf(data.username)>-1 && clients[data.username] && sessions[data.username]){
            var command=data.query;
            options=[];
            comm=[];
            allow_access=0;
            if(command.indexOf('|')>-1 || command.indexOf('&&')>-1){
                comm=command.split(/[|&&]+/)
                allow_access=check_allowable(comm);
                comm[0]='sh';
                options.push('-c');
                options.push(command)
            }else{
                allow_access=check_allowable([command]);
                comm=command.split(' ');
                for(var i=1;i<comm.length;i++)
                    options.push(comm[i])
            }

            if(ls && ls.pid!=undefined)
                kill(ls.pid);

            //onsole.log(comm[0],options)
            if(allow_access) {
                ls = spawn(comm[0], options, {detached: true});
                //console.log(ls.pid)
                ls.stdout.on('data', (res) => {
                    try{
                        io.sockets.connected[clients[data.username].socket].emit("result", sanitizer.escape(res.toString()))
                    }catch (err){
                        console.log(clients+'\n'+err)
                    }
                });

                ls.stderr.on('data', (res) => {
                    try{
                        io.sockets.connected[clients[data.username].socket].emit("result", sanitizer.escape(res.toString()))
                    }catch (err){
                        console.log(clients+'\n'+err)
                    }
                });

                ls.on('close', (code) => {
                    console.log(`child process exited with code ${code}`);
                });

                ls.on('error', function (err) {
                    io.sockets.connected[clients[data.username].socket].emit("result", "Please Enter a valid command");
                    log.error("invalid command",err)
                });
            }else {
                log.error("not accessable",command);
                io.sockets.connected[clients[data.username].socket].emit("result", "You are not allowed to run that command");
            }
        } else {
            log.error("User does not exist: " + data.username+" query "+data.query);
            log.error(JSON.stringify(clients)+".......\n"+JSON.stringify(sessions))
        }
    });
    socket.on('end', function (data){
        try{
            io.sockets.connected[clients[data.username].socket].disconnect(0);
            delete clients[data.username];
        }catch (err){
            log.error(err)
        }
        //console.log(clients)
    });

    socket.on('kill',function () {
        if(ls && ls.pid!=undefined)
            kill(ls.pid)
    });

    socket.on('disconnect',function () {
        if(ls && ls.pid!=undefined)
            kill(ls.pid)
    });

    function check_allowable(query) {
        //console.log(query)
        for(var j=0;j<query.length;j++){
            query[j]=query[j].trim();

            /*if(query[j].indexOf('.')>-1 && query[j].indexOf(config.AllowCommands.allowdirectory)>-1){}
            else if(query[j].indexOf('.')>-1){return 0}*/

            query[j]=query[j].match(/[^\s"']+|"([^"]*)"|'([^']*)'/g);
            //console.log(query[j]);
            if(!query[j])
                return 0;

            if(query[j][0]=='pm2') {
                if (config.AllowCommands[query[j][0]] && config.AllowCommands[query[j][0]].indexOf(query[j][1]) > -1) {}
                else {return 0}
            }
            else if(query[j][0]=='cat' || query[j][0]=='tail'){
                for (var k=1;k<query[j].length;k++){
                    if(query[j][k].indexOf('-')==-1 && query[j][k].indexOf(config.AllowCommands[query[j][0]])>-1){}
                    else if(query[j][k].indexOf('-')==-1){return 0}
                }
            }else if(query[j][0]=='grep' && query[j].length>2){
                //console.log(query[j])
                if(query[j][query[j].length-1].indexOf(config.AllowCommands[query[j][0]])>-1){}
                else{return 0}
            }
            else{
                if (config.AllowCommands[query[j][0]]){}
                else {return 0}
            }
        }
        return 1
    }

});



module.exports = app;
